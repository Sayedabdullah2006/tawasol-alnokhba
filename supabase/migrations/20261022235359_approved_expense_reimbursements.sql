-- Approved reimbursements are payable additions, never salary or insured wages.
alter table public.wf_employee_requests add column expense_details jsonb;
alter table public.wf_monthly_payroll add column reimbursement_amount numeric(15,2) not null default 0 check(reimbursement_amount>=0),
 add column reimbursements jsonb not null default '[]' check(jsonb_typeof(reimbursements)='array');
alter table public.wf_monthly_payroll drop constraint wf_payroll_net_balance;
alter table public.wf_monthly_payroll add constraint wf_payroll_net_balance check(gross_amount+reimbursement_amount=total_amount+deductions_amount);
create index wf_expense_invoice_lookup on public.wf_employee_requests using gin(attachments jsonb_path_ops)
 where kind='expenses' and status in ('pending','approved');

create function workforce_private.validate_expense_request() returns trigger
language plpgsql security invoker set search_path='' as $$
declare invoice jsonb; payout date;
begin
 if TG_OP='UPDATE' and old.kind='expenses' and old.status='approved' then
  if (new.employee_id,new.kind,new.amount,new.attachments,new.status,new.test_run_id,new.expense_details)
   is distinct from (old.employee_id,old.kind,old.amount,old.attachments,old.status,old.test_run_id,old.expense_details) then
   raise sqlstate 'PT409' using message='تعويض المصروف المعتمد محفوظ ولا يمكن تغيير قيمته أو فواتيره';end if;
  return new;
 end if;
 if new.kind<>'expenses' then new.expense_details:=null;return new;end if;
 if TG_OP='INSERT' and new.status<>'pending' then raise sqlstate 'PT400' using message='أرسل طلب التعويض للمراجعة أولًا';end if;
 if new.status not in ('pending','approved') then new.expense_details:=null;return new;end if;
 -- Existing pending requests may be cancelled/rejected without a new invoice.
 if TG_OP='UPDATE' and new.status='pending' and (new.amount,new.attachments,new.kind,new.employee_id)
  is not distinct from (old.amount,old.attachments,old.kind,old.employee_id) then return new;end if;
 if new.amount is null or new.amount<=0 or jsonb_array_length(new.attachments)=0 then
  raise sqlstate 'PT400' using message='أدخل المبلغ وأرفق فاتورة المصروف';end if;
 if not exists(select 1 from jsonb_array_elements(new.attachments) a where a->>'mime_type' in ('application/pdf','image/png','image/jpeg','image/webp')) then
  raise sqlstate 'PT400' using message='أرفق الفاتورة بصيغة PDF أو صورة';end if;
 if exists(select 1 from jsonb_array_elements(new.attachments) a where coalesce(a->>'sha256','') !~ '^[a-f0-9]{64}$'
  or coalesce((a->>'size_bytes')::bigint,0)<=0 or nullif(a->>'id','') is null or nullif(a->>'filename','') is null) then
  raise sqlstate 'PT400' using message='تعذر التحقق من الفاتورة؛ أعد رفع الملف';end if;
 if (select count(*)<>count(distinct a->>'sha256') from jsonb_array_elements(new.attachments) a) then
  raise sqlstate 'PT409' using message='الفاتورة مرفقة أكثر من مرة';end if;
 -- Serialize by invoice bytes, including across employees; a renamed/reuploaded
 -- copy cannot be approved/claimed twice. Rejected/cancelled claims may be retried.
 for invoice in select value from jsonb_array_elements(new.attachments) order by value->>'sha256' loop
  perform pg_advisory_xact_lock(hashtextextended(invoice->>'sha256',5271));
  if exists(select 1 from public.wf_employee_requests q where q.id<>new.id and q.kind='expenses' and q.status in ('pending','approved')
   and q.test_run_id is not distinct from new.test_run_id
   and q.attachments @> jsonb_build_array(jsonb_build_object('sha256',invoice->>'sha256'))) then
   raise sqlstate 'PT409' using message='هذه الفاتورة مرتبطة بطلب تعويض سابق؛ راجع الطلبات';end if;
 end loop;
 new.expense_details:=null;
 if TG_OP='UPDATE' and new.status='approved' and old.status='pending' then
  if not exists(select 1 from public.profiles where id=new.decided_by and role='admin') then raise insufficient_privilege;end if;
  -- Same employee lock as payroll save/pay: a concurrent payment cannot close
  -- the target month between routing the reimbursement and posting it.
  perform 1 from public.wf_employees where id=new.employee_id for update;
  payout:=date_trunc('month',workforce_private.work_now() at time zone 'Asia/Riyadh')::date;
  while exists(select 1 from public.wf_monthly_payroll where employee_id=new.employee_id and month=payout and status='paid') loop
   payout:=(payout+interval '1 month')::date;
  end loop;
  new.expense_details:=jsonb_build_object('payroll_month',payout,'approved_at',workforce_private.work_now());
 end if;
 return new;
end $$;
revoke all on function workforce_private.validate_expense_request() from public,anon,authenticated;
create trigger wf_expense_validate before insert or update on public.wf_employee_requests for each row execute function workforce_private.validate_expense_request();

create function workforce_private.expense_total(p_employee uuid,p_month date) returns numeric
language sql stable security invoker set search_path='' as $$
 select coalesce(sum(amount),0) from public.wf_employee_requests where employee_id=p_employee and kind='expenses' and status='approved'
 and test_run_id is null and (expense_details->>'payroll_month')::date=p_month
$$;
revoke all on function workforce_private.expense_total(uuid,date) from public,anon,authenticated;
grant execute on function workforce_private.expense_total(uuid,date) to service_role;

create function workforce_private.apply_expense_payroll() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' and old.status='paid' then
  new.reimbursement_amount:=old.reimbursement_amount;new.reimbursements:=old.reimbursements;new.total_amount:=old.total_amount;return new;
 end if;
 new.reimbursement_amount:=workforce_private.expense_total(new.employee_id,new.month);
 select coalesce(jsonb_agg(jsonb_build_object('request_id',q.id,'title',q.title,'amount',q.amount::text,
  'approved_at',q.expense_details->>'approved_at','invoices',
   (select jsonb_agg(jsonb_build_object('id',a->>'id','filename',a->>'filename','mime_type',a->>'mime_type')) from jsonb_array_elements(q.attachments) a)) order by q.id),'[]')
 into new.reimbursements from public.wf_employee_requests q where q.employee_id=new.employee_id and q.kind='expenses'
  and q.status='approved' and q.test_run_id is null and (q.expense_details->>'payroll_month')::date=new.month;
 -- Runs after salary/insurance/attendance triggers: no reimbursement can fund a
 -- salary deduction, change an hourly rate or enter the GOSI basis.
 new.total_amount:=new.gross_amount-new.deductions_amount+new.reimbursement_amount;
 return new;
end $$;
revoke all on function workforce_private.apply_expense_payroll() from public,anon,authenticated;
create trigger wf_zz_expense_payroll before insert or update on public.wf_monthly_payroll for each row execute function workforce_private.apply_expense_payroll();

create function workforce_private.post_expense() returns trigger
language plpgsql security invoker set search_path='' as $$
declare month date;
begin
 if new.kind='expenses' and new.status='approved' and old.status='pending' and new.test_run_id is null then
  month:=(new.expense_details->>'payroll_month')::date;
  perform public.wf_attendance_payroll_snapshot(new.decided_by,new.employee_id,month);
  perform workforce_private.refresh_attendance_payroll(new.employee_id,month);
 end if;return new;
end $$;
revoke all on function workforce_private.post_expense() from public,anon,authenticated;
create trigger wf_expense_post after update on public.wf_employee_requests for each row execute function workforce_private.post_expense();

create or replace function workforce_private.refresh_attendance_payroll(p_employee uuid,p_month date) returns void language plpgsql security invoker set search_path='' as $$
declare r public.wf_monthly_payroll; detail jsonb; insurance jsonb; actual jsonb;
begin
 select * into r from public.wf_monthly_payroll where employee_id=p_employee and month=p_month for update;
 if not found or r.status='paid' then return;end if;
 detail:=workforce_private.attendance_payroll(p_employee,p_month);insurance:=workforce_private.insurance_payroll(p_employee,p_month);
 select x into actual from jsonb_array_elements(r.deductions) x where x->>'kind'='insurance' limit 1;
 if r.reimbursement_amount is distinct from workforce_private.expense_total(p_employee,p_month) or r.overtime_amount is distinct from workforce_private.overtime_total(p_employee,p_month) or (r.attendance_details-'applied_amount'-'unapplied_amount') is distinct from detail
  or insurance is not null and (r.insurance_details is distinct from insurance or actual is null or actual->>'reference' is distinct from insurance->>'reference' or (actual->>'amount')::numeric is distinct from (insurance->>'amount')::numeric) then
  update public.wf_monthly_payroll set version=version+1,updated_at=clock_timestamp() where id=r.id;
 end if;
end $$;

create or replace function workforce_private.mark_test_resource() returns trigger
language plpgsql security invoker set search_path='' as $$
declare actor uuid; requested text;
begin
 if TG_OP='UPDATE' then
  if new.test_run_id is distinct from old.test_run_id then raise sqlstate 'PT409' using message='لا يمكن تحويل سجل حقيقي إلى اختبار أو إزالة علامة الاختبار'; end if;
  return new;
 end if;
 if TG_TABLE_NAME='wf_tasks' then
  requested:=nullif(current_setting('workforce.test_run_id',true),'');
  if requested is not null then new.test_run_id:=requested::uuid; end if;
  actor:=new.created_by;
 else
  select user_id into actor from public.wf_employees where id=new.employee_id;
 end if;
 if new.test_run_id is not null then
  perform public.wf_test_run('assert',actor,new.test_run_id);
  if TG_TABLE_NAME='wf_employee_requests' then
   if new.kind not in ('general','overtime','expenses') then raise sqlstate 'PT400' using message='استخدم طلبًا إداريًا في الاختبار؛ الطلبات المؤثرة على الحضور والمال متاحة في الوضع العادي'; end if;
  end if;
  new.title:=left('اختبار · '||new.title,case when TG_TABLE_NAME='wf_tasks' then 250 else 150 end);
 elsif new.title ~* '^(QA-LIVE-|WF-TEST:|wf-qa-|QA-profile-)' then
  raise sqlstate 'PT400' using message='ابدأ جولة اختبار قبل إنشاء بيانات الاختبار';
 end if;
 return new;
end $$;

revoke all on function workforce_private.mark_test_resource() from public,anon,authenticated;
create or replace function workforce_private.daily_payroll_accrual(p public.wf_monthly_payroll) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare tick timestamptz:=workforce_private.work_now(); today date:=(tick at time zone 'Asia/Riyadh')::date;
 first_day date; last_day date:=(p.month+interval '1 month - 1 day')::date; cutoff date;
 days_total integer; days_elapsed integer; ratio numeric:=0; base numeric:=p.basic_amount+p.allowances_amount;
 gross numeric:=0; insurance numeric:=0; other numeric:=0; settlement numeric:=0; pending numeric:=0;
 credited numeric:=0; daily integer; workdays integer[]; paid_day boolean; term record; hourly numeric;
 detail jsonb; final boolean; day_gap numeric:=0; result numeric; award numeric;
 policy public.wf_employee_insurance_settings; insured_start date; insured_day date; insured_basis numeric:=0; insured_term numeric; insured_denominator numeric;
begin
 select greatest(p.month,e.start_date) into first_day from public.wf_employees e where e.id=p.employee_id;
 select cutoff_on into cutoff from workforce_private.payroll_attendance_policy where id;
 final:=p.status='paid' or today>last_day or today=last_day and today>=cutoff and (tick at time zone 'Asia/Riyadh')::time>=time '17:00';
 select coalesce(sum((d->>'amount')::numeric) filter(where d->>'kind'='insurance'),0),
  coalesce(sum((d->>'amount')::numeric) filter(where d->>'kind'<>'insurance'),0) into insurance,other from jsonb_array_elements(p.deductions) d;
 if final then
  return jsonb_build_object('starts_on',first_day,'through',last_day,'as_of',tick,'closed',true,
   'gross_amount',p.gross_amount::text,'insurance_amount',insurance::text,'other_amount',other::text,
   'attendance_amount',p.attendance_amount::text,'total_amount',p.total_amount::text,'current_credited_seconds',0);
 end if;
 days_total:=greatest(1,last_day-first_day+1);days_elapsed:=greatest(0,least(today,last_day)-first_day+1);
 ratio:=least(1,days_elapsed::numeric/days_total);
 -- The joining-month salary already uses the approved /30 proration. Distribute
 -- that period over its calendar days; a full month always accrues exactly its salary.
 gross:=base*ratio;insurance:=round(insurance*ratio,2);
 -- Calculate the contribution from source wages, not from an already-rounded
 -- monthly contribution. This also respects a later insurance effective date.
 select * into policy from public.wf_employee_insurance_settings where employee_id=p.employee_id;
 if found then
  insured_start:=greatest(first_day,policy.effective_from);
  insured_denominator:=case when insured_start>p.month then 30 else extract(day from last_day) end;
  for insured_day in select generate_series(insured_start::timestamp,least(today,last_day)::timestamp,interval '1 day')::date loop
   select c.basic_salary+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(c.allowances) a where coalesce(a->>'name','') ~* '(سكن|housing)'),0)
    into insured_term from public.wf_compensation_versions c where c.employee_id=p.employee_id and c.effective_from<=insured_day order by c.effective_from desc,c.revision desc limit 1;
   if not found then raise sqlstate 'PT409' using message='أكملي إعداد الراتب الأساسي وبدل السكن أولًا';end if;
   insured_basis:=insured_basis+insured_term;
  end loop;
  insurance:=round(insured_basis/insured_denominator*policy.rate/100,2);
 end if;
 detail:=workforce_private.attendance_payroll(p.employee_id,p.month);
 settlement:=(detail->>'calculated_amount')::numeric;
 if today between first_day and last_day then
  select s.daily_minutes,s.workdays into daily,workdays from public.wf_attendance_settings s where s.employee_id=p.employee_id;
  daily:=coalesce(daily,480);workdays:=coalesce(workdays,array[0,1,2,3,4,6]);
  paid_day:=extract(dow from today)::integer<>all(workdays) or to_char(today,'MM-DD') in ('02-22','09-23')
   or exists(select 1 from public.wf_paid_calendar_days where day=today)
   or exists(select 1 from public.wf_employee_requests q where q.employee_id=p.employee_id and q.test_run_id is null
    and q.kind='leave' and q.status='approved' and q.leave_type='paid'
    and today between (q.starts_at at time zone 'Asia/Riyadh')::date and (q.ends_at at time zone 'Asia/Riyadh')::date);
  if not paid_day then
   select (c.basic_salary+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(c.allowances) a),0))/30/8 hourly
    into term from public.wf_compensation_versions c where c.employee_id=p.employee_id and c.effective_from<=today order by c.effective_from desc,c.revision desc limit 1;
   if not found then raise sqlstate 'PT409' using message='أكملي إعداد راتب الموظفة للفترة أولًا';end if;
   hourly:=term.hourly;
   with ranges as (
    select greatest(lower(r),today::timestamp at time zone 'Asia/Riyadh') lo,
     least(upper(r),tick,(case when today<cutoff then (today+1)::timestamp else today+time '17:00' end) at time zone 'Asia/Riyadh') hi
    from public.wf_attendance_sessions a cross join lateral workforce_private.work_credit_ranges(a,tick) r
    where a.employee_id=p.employee_id and a.checked_in<((today+1)::timestamp at time zone 'Asia/Riyadh')
     and (a.checked_out>=today::timestamp at time zone 'Asia/Riyadh' or a.checked_out is null)
    union all
    select greatest(q.starts_at,(today+time '09:00') at time zone 'Asia/Riyadh'),least(q.ends_at,(today+time '17:00') at time zone 'Asia/Riyadh',tick)
    from public.wf_employee_requests q where q.employee_id=p.employee_id and q.test_run_id is null and q.kind='permission' and q.status='approved'
     and q.starts_at<((today+1)::timestamp at time zone 'Asia/Riyadh') and q.ends_at>today::timestamp at time zone 'Asia/Riyadh'
   ), merged as(select range_agg(tstzrange(lo,hi,'[)')) rr from ranges where hi>lo)
   select least(daily*60,coalesce(sum(extract(epoch from upper(r)-lower(r))),0)) into credited from merged cross join lateral unnest(rr) r;
   day_gap:=greatest(0,daily*60-credited)*hourly/3600;
   if (detail->>'through')::date=today then
    -- At 17:00 the monthly settlement includes today. Keep it exactly once.
    settlement:=greatest(0,settlement-round(day_gap,2));
   end if;
   pending:=least(base/days_total,day_gap);
  end if;
 end if;
 -- Recorded incentives are earned when entered; future salary is never included.
 award:=case when days_elapsed>0 then greatest(0,p.gross_amount-base) else 0 end;
 gross:=round(greatest(0,gross-pending)+award,2);settlement:=round(least(settlement,greatest(0,gross-insurance-other)),2);
 result:=greatest(0,gross-insurance-other-settlement)+p.reimbursement_amount;
 return jsonb_build_object('starts_on',first_day,'through',case when days_elapsed>0 then least(today,last_day) else null end,
  'as_of',tick,'closed',false,'gross_amount',gross::text,'insurance_amount',insurance::text,'other_amount',other::text,
  'attendance_amount',settlement::text,'total_amount',result::text,'current_credited_seconds',credited);
end $$;
revoke all on function workforce_private.daily_payroll_accrual(public.wf_monthly_payroll) from public,anon,authenticated;
grant execute on function workforce_private.daily_payroll_accrual(public.wf_monthly_payroll) to service_role;


-- Separate reimbursements from salary payment protection when settling hours.
create or replace function workforce_private.apply_attendance_payroll() returns trigger
language plpgsql security invoker set search_path='' as $$
declare detail jsonb; manual numeric; applied numeric;
begin
 -- Fully paid snapshots remain historical records.
 if TG_OP='UPDATE' and old.status='paid' then
  new.attendance_amount:=old.attendance_amount;new.attendance_details:=old.attendance_details;return new;
 end if;
 detail:=workforce_private.attendance_payroll(new.employee_id,new.month);
 select coalesce(sum((x->>'amount')::numeric),0) into manual from jsonb_array_elements(new.deductions) x;
 applied:=least((detail->>'calculated_amount')::numeric,greatest(0,new.gross_amount-manual-greatest(0,new.paid_amount-new.reimbursement_amount)));
 new.attendance_amount:=applied;
 new.attendance_details:=detail||jsonb_build_object('applied_amount',applied::text,'unapplied_amount',greatest(0,(detail->>'calculated_amount')::numeric-applied)::text);
 new.deductions_amount:=manual+applied;
 new.total_amount:=new.gross_amount-new.deductions_amount;
 return new;
end $$;

-- Establish the separate payable before the attendance/payment cap is calculated.
create function workforce_private.prepare_expense_balance() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 new.reimbursement_amount:=case when TG_OP='UPDATE' and old.status='paid' then old.reimbursement_amount
  else workforce_private.expense_total(new.employee_id,new.month) end;
 return new;
end $$;
revoke all on function workforce_private.prepare_expense_balance() from public,anon,authenticated;
create trigger wf_02_expense_balance before insert or update on public.wf_monthly_payroll for each row execute function workforce_private.prepare_expense_balance();

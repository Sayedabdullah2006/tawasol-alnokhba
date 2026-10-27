-- Previewed and tested locally before production application.
alter table public.wf_employees add column employment_ends_on date check(employment_ends_on>=start_date);
create function workforce_private.employment_end(p_employee uuid) returns date language sql stable set search_path='' as $$select employment_ends_on from public.wf_employees where id=p_employee$$;
revoke all on function workforce_private.employment_end(uuid) from public,anon,authenticated;
grant execute on function workforce_private.employment_end(uuid) to service_role;

create table public.wf_final_settlements(
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique references public.wf_employee_requests(id),employee_id uuid not null references public.wf_employees(id),
 status text not null check(status in ('approved','paid')),version int not null default 1,inputs jsonb not null,snapshot jsonb not null,
 approved_by uuid not null references public.profiles(id),approved_at timestamptz not null default now(),paid_by uuid references public.profiles(id),paid_at timestamptz,payment_reference text,
 last_key uuid not null,last_payload jsonb not null,
 check((status='approved' and paid_at is null) or (status='paid' and paid_at is not null and paid_by is not null and length(btrim(payment_reference))>=3))
);
alter table public.wf_final_settlements enable row level security;
revoke all on public.wf_final_settlements from public,anon,authenticated,service_role;
grant select on public.wf_final_settlements to authenticated;
grant select,insert,update on public.wf_final_settlements to service_role;
create policy wf_final_settlement_admin on public.wf_final_settlements for select to authenticated using((select workforce_private.is_admin()));

-- Keep closed/past paid salary statements intact; calculate a closing copy separately.
create function workforce_private.closing_salary(p_employee uuid,p_month date) returns jsonb language plpgsql stable set search_path='' as $$
declare e public.wf_employees;d date;lo date;hi date;t record;b numeric:=0;a numeric:=0;denom numeric;
begin
 select * into e from public.wf_employees where id=p_employee;
 lo:=greatest(p_month,e.start_date);hi:=least((p_month+interval '1 month - 1 day')::date,e.employment_ends_on);
 denom:=case when lo=p_month and hi=(p_month+interval '1 month - 1 day')::date then extract(day from hi) else 30 end;
 for d in select generate_series(lo::timestamp,hi::timestamp,interval '1 day')::date loop
  select basic_salary,coalesce((select sum((v->>'amount')::numeric) from jsonb_array_elements(c.allowances) v),0) allowances into t from public.wf_compensation_versions c where c.employee_id=p_employee and c.effective_from<=d order by c.effective_from desc,c.revision desc limit 1;
  if not found then raise sqlstate 'PT409' using message='أكمل بيانات الأجر للفترة قبل التسوية';end if;
  b:=b+t.basic_salary/denom;a:=a+t.allowances/denom;
 end loop;
 return jsonb_build_object('basic',round(b,2),'allowances',round(a,2));
end $$;
alter table public.wf_monthly_payroll add column employment_deduction_carry jsonb not null default '[]';
create function workforce_private.apply_employment_cutoff() returns trigger language plpgsql set search_path='' as $$
declare ending date;w jsonb;full_gross numeric;room numeric;amount numeric;take numeric;x jsonb;items jsonb:='[]';carry jsonb:='[]';original jsonb;insurance_data jsonb;
begin
 if TG_OP='UPDATE' and old.status='paid' then return new;end if;
 ending:=workforce_private.employment_end(new.employee_id);
 if ending is null or ending>=(new.month+interval '1 month - 1 day')::date then return new;end if;
 w:=workforce_private.closing_salary(new.employee_id,new.month);
 new.basic_amount:=(w->>'basic')::numeric;new.allowances_amount:=(w->>'allowances')::numeric;
 full_gross:=new.basic_amount+new.allowances_amount+coalesce((select sum((i->>'amount')::numeric) from jsonb_array_elements(new.items)i),0)+workforce_private.overtime_total(new.employee_id,new.month);
 insurance_data:=workforce_private.insurance_payroll(new.employee_id,new.month);
 room:=greatest(0,full_gross-coalesce((insurance_data->>'amount')::numeric,0));
 original:=new.deductions;
 if TG_OP='UPDATE' and new.deductions=old.deductions then original:=original||old.employment_deduction_carry;end if;
 for x in select * from jsonb_array_elements(original) loop
  if x->>'kind'='insurance' and insurance_data is not null then continue;end if;
  amount:=(x->>'amount')::numeric;take:=least(room,amount);room:=room-take;
  if take>0 then items:=items||jsonb_build_array(x||jsonb_build_object('amount',take::text));end if;
  if amount>take then carry:=carry||jsonb_build_array(x||jsonb_build_object('amount',(amount-take)::text));end if;
 end loop;
 new.deductions:=items;new.employment_deduction_carry:=carry;
 return new;
end $$;
create trigger wf_00_employment_cutoff before insert or update on public.wf_monthly_payroll for each row execute function workforce_private.apply_employment_cutoff();

-- A single effective end date is used by salary, absence, banked hours, insurance and sick/unpaid leave.
do $patch$ declare f record;b text;begin
 for f in select oid,proname,prosrc from pg_proc where oid in (
 'workforce_private.attendance_payroll_before_unpaid(uuid,date)'::regprocedure,
 'workforce_private.daily_payroll_accrual_before_unpaid(public.wf_monthly_payroll)'::regprocedure,
 'workforce_private.insurance_payroll(uuid,date)'::regprocedure,
 'workforce_private.weekly_hours(uuid,date)'::regprocedure,
 'workforce_private.sick_payroll(uuid,date,date)'::regprocedure,
 'workforce_private.unpaid_leave_payroll(uuid,date,date)'::regprocedure) loop
 b:=f.prosrc;
 if f.proname='daily_payroll_accrual_before_unpaid' then
  b:=replace(b,'last_day date:=(p.month+interval ''1 month - 1 day'')::date','last_day date:=least((p.month+interval ''1 month - 1 day'')::date,workforce_private.employment_end(p.employee_id))');
  b:=replace(b,'else extract(day from last_day) end','else extract(day from (p.month+interval ''1 month - 1 day'')) end');
  b:=replace(b,'case when insured_start>p.month then 30','case when insured_start>p.month or workforce_private.employment_end(p.employee_id)<(p.month+interval ''1 month - 1 day'')::date then 30');
 elsif f.proname='insurance_payroll' then
  b:=replace(b,'last_day date:=(p_month+interval ''1 month - 1 day'')::date','last_day date:=least((p_month+interval ''1 month - 1 day'')::date,workforce_private.employment_end(p_employee))');
  b:=replace(b,'else extract(day from last_day) end','else extract(day from (p_month+interval ''1 month - 1 day'')) end');
  b:=replace(b,'case when first_day>p_month then 30','case when first_day>p_month or workforce_private.employment_end(p_employee)<(p_month+interval ''1 month - 1 day'')::date then 30');
 elsif f.proname in ('sick_payroll','unpaid_leave_payroll') then b:=replace(b,'begin','begin'||E'\n p_through:=least(p_through,workforce_private.employment_end(p_employee));');
 else
  b:=replace(b,'weekly:=workforce_private.weekly_hours(p_employee,p_month);','last_day:=least(last_day,workforce_private.employment_end(p_employee)); weekly:=workforce_private.weekly_hours(p_employee,p_month);');
  b:=replace(b,'for d in select generate_series(first_day::timestamp,least(today,last_day)::timestamp','last_day:=least(last_day,workforce_private.employment_end(p_employee)); for d in select generate_series(first_day::timestamp,least(today,last_day)::timestamp');
 end if;
 if b=f.prosrc then raise exception 'Missing cutoff seam: %',f.proname;end if;
 execute replace(pg_get_functiondef(f.oid),f.prosrc,b);
 end loop;
end $patch$;

-- Read access to personal records remains available after ending; new clock-ins do not.
do $patch$ declare f record;b text;begin
 select oid,prosrc into f from pg_proc where oid='public.wf_work_command(uuid,text,uuid,uuid,text,uuid,text)'::regprocedure;
 b:=replace(f.prosrc,'if p_command=''in'' then','if p_command=''in'' and (tick at time zone ''Asia/Riyadh'')::date>workforce_private.employment_end(employee) then raise sqlstate ''PT409'' using message=''انتهت علاقة العمل؛ تسجيل حضور جديد غير متاح'';end if; if p_command=''in'' then');
 if b=f.prosrc then raise exception 'Missing clock-in seam';end if;execute replace(pg_get_functiondef(f.oid),f.prosrc,b);
end $patch$;

create function workforce_private.post_resignation_end() returns trigger language plpgsql set search_path='' as $$
begin
 if new.kind='resignation' and new.status='approved' and old.status='pending' and new.test_run_id is null then
  update public.wf_employees set employment_ends_on=least(employment_ends_on,(new.resignation_details->>'effective_at')::timestamptz at time zone 'Asia/Riyadh')::date where id=new.employee_id;
  update public.wf_monthly_payroll set updated_at=workforce_private.work_now() where employee_id=new.employee_id and status<>'paid';
 end if;return new;
end $$;
create trigger wf_resignation_end after update on public.wf_employee_requests for each row execute function workforce_private.post_resignation_end();
-- Existing accepted requests are backfilled without rewriting contracts or paid payrolls.
update public.wf_employees e set employment_ends_on=x.ending from(select employee_id,min((resignation_details->>'effective_at')::timestamptz at time zone 'Asia/Riyadh')::date ending from public.wf_employee_requests where kind='resignation' and status='approved' and test_run_id is null group by employee_id)x where e.id=x.employee_id;

-- Days beyond twenty in an approved unpaid period suspend service under article 116.
create function workforce_private.suspended_service_days(p_employee uuid,p_start date,p_end date) returns setof date language sql stable set search_path='' as $$
 with days as (
  select distinct x::date as service_day from public.wf_employee_requests q cross join lateral generate_series((q.starts_at at time zone 'Asia/Riyadh')::date::timestamp,least((q.ends_at at time zone 'Asia/Riyadh')::date,p_end)::timestamp,interval '1 day') x
  where q.employee_id=p_employee and q.kind='leave' and q.leave_type='unpaid' and q.status='approved' and q.test_run_id is null
 ), islands as(select service_day,service_day-row_number() over(order by service_day)::int grp from days), numbered as(select service_day,row_number() over(partition by grp order by service_day) ordinal from islands)
 select service_day from numbered where service_day>=p_start and ordinal>20
$$;

-- Final leave includes the unfinished month; the ongoing dashboard keeps completed-month accrual.
create function workforce_private.employment_leave_accrual(p_employee uuid,p_asof date,p_include_suspension boolean) returns jsonb language plpgsql stable set search_path='' as $$
declare e public.wf_employees;m date;finish date;d date;amount numeric;accrued numeric:=0;pending numeric:=0;opening numeric;used numeric:=0;annual numeric;last_day date;workdays int[];n numeric;detail jsonb:='[]';current_opening numeric;cashed numeric:=0;
begin
 select * into e from public.wf_employees where id=p_employee;
 if not found then raise sqlstate 'P0002' using message='الموظفة غير متاحة';end if;
 last_day:=least(p_asof,e.employment_ends_on);
 for m in select generate_series(date_trunc('month',e.start_date)::timestamp,date_trunc('month',last_day)::timestamp,interval '1 month')::date loop
  finish:=(m+interval '1 month - 1 day')::date;amount:=0;
  for d in select generate_series(greatest(m,e.start_date)::timestamp,least(finish,coalesce(e.employment_ends_on,finish))::timestamp,interval '1 day')::date loop
   if not p_include_suspension and d in(select workforce_private.suspended_service_days(p_employee,e.start_date,least(finish,last_day))) then continue;end if;
   amount:=amount+(case when d-case when p_include_suspension then 0 else (select count(*)::int from workforce_private.suspended_service_days(p_employee,e.start_date,d)) end>=(e.start_date+interval '5 years')::date then 30 else 21 end)/12.0/extract(day from finish);
  end loop;
  if finish<date_trunc('month',p_asof)::date or e.employment_ends_on is not null and e.employment_ends_on<=p_asof then accrued:=accrued+amount;detail:=detail||jsonb_build_array(jsonb_build_object('month',m,'days',round(amount,6)));else pending:=amount;end if;
 end loop;
 select coalesce(sum(days),0) into opening from public.wf_leave_entitlements where employee_id=p_employee and year<=extract(year from last_day);
 if e.employment_ends_on is null then select coalesce(sum(days),0) into used from public.wf_leave_movements where employee_id=p_employee;
 else
  select coalesce(s.workdays,array[0,1,2,3,4,6]) into workdays from public.wf_attendance_settings s where s.employee_id=p_employee;workdays:=coalesce(workdays,array[0,1,2,3,4,6]);
  select coalesce(sum(least(l.days,(select count(*) from generate_series((q.starts_at at time zone 'Asia/Riyadh')::date::timestamp,least((q.ends_at at time zone 'Asia/Riyadh')::date,last_day)::timestamp,interval '1 day') x where extract(year from x)=l.year and extract(dow from x)::int=any(workdays) and workforce_private.paid_holiday(x::date) is null))),0) into used from public.wf_leave_movements l join public.wf_employee_requests q on q.id=l.request_id where l.employee_id=p_employee;
 end if;
 select coalesce(sum(days),0) into current_opening from public.wf_leave_entitlements where employee_id=p_employee and year=extract(year from last_day);
 select coalesce(sum((f.snapshot->'leave'->>'available')::numeric),0) into cashed from public.wf_final_settlements f where f.employee_id=p_employee and f.status='paid';
 annual:=case when last_day-case when p_include_suspension then 0 else (select count(*)::int from workforce_private.suspended_service_days(p_employee,e.start_date,last_day)) end>=(e.start_date+interval '5 years')::date then 30 else 21 end;
 return jsonb_build_object('year',extract(year from last_day),'annual_days',annual,'monthly_days',annual/12,'accrued',round(accrued,6),'opening',opening,'current_year_opening',current_opening,'granted',round(accrued+opening,6),'used',used,'cashed_days',cashed,'available',greatest(0,round(accrued+opening-used-cashed,6)),'pending_days',round(pending,6),'pending_until',(date_trunc('month',last_day)+interval '1 month - 1 day')::date,'ends_on',e.employment_ends_on,'months',detail);
end $$;

create or replace function workforce_private.leave_accrual(p_employee uuid,p_asof date) returns jsonb language sql stable set search_path='' as $$
 select workforce_private.employment_leave_accrual(p_employee,p_asof,coalesce((select (inputs->>'count_unpaid_as_service')::boolean from public.wf_final_settlements where employee_id=p_employee order by approved_at desc limit 1),false))
$$;
revoke all on function workforce_private.employment_leave_accrual(uuid,date,boolean) from public,anon,authenticated;
grant execute on function workforce_private.employment_leave_accrual(uuid,date,boolean) to service_role;

-- A closing copy handles already-paid/prepaid months without rewriting history.
create function workforce_private.closing_payroll(p public.wf_monthly_payroll) returns jsonb language plpgsql stable set search_path='' as $$
declare wages jsonb;insurance jsonb;att jsonb;gross numeric;ins numeric;other numeric;absence numeric;reimburse numeric;ending date;
begin
 ending:=workforce_private.employment_end(p.employee_id);
 if p.status='paid' and (ending is null or ending>=(p.month+interval '1 month - 1 day')::date) then
  return jsonb_build_object('gross',p.gross_amount,'insurance',coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(p.deductions) x where x->>'kind'='insurance'),0),'other',coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(p.deductions||p.employment_deduction_carry) x where x->>'kind'<>'insurance'),0),'attendance',p.attendance_amount,'reimbursements',p.reimbursement_amount,'total',p.total_amount);
 end if;
 wages:=case when ending<(p.month+interval '1 month - 1 day')::date then workforce_private.closing_salary(p.employee_id,p.month) else jsonb_build_object('basic',p.basic_amount,'allowances',p.allowances_amount) end;insurance:=workforce_private.insurance_payroll(p.employee_id,p.month);att:=workforce_private.attendance_payroll(p.employee_id,p.month);
 gross:=(wages->>'basic')::numeric+(wages->>'allowances')::numeric+coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(p.items) x),0)+workforce_private.overtime_total(p.employee_id,p.month);
 ins:=coalesce((insurance->>'amount')::numeric,(select sum((x->>'amount')::numeric) from jsonb_array_elements(p.deductions||p.employment_deduction_carry)x where x->>'kind'='insurance'),0);other:=coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(p.deductions||p.employment_deduction_carry) x where x->>'kind'<>'insurance'),0);
 absence:=least((att->>'calculated_amount')::numeric,greatest(0,gross-ins-other));reimburse:=workforce_private.expense_total(p.employee_id,p.month);

 return jsonb_build_object('gross',gross,'insurance',ins,'other',other,'attendance',absence,'reimbursements',reimburse,'total',gross-ins-other-absence+reimburse);
end $$;

create function workforce_private.final_settlement_quote(p_request uuid,p_inputs jsonb default '{}') returns jsonb language plpgsql stable set search_path='' as $$
declare r public.wf_employee_requests;e public.wf_employees;t public.wf_compensation_versions;ending date;d date;y date;anniversary date;years numeric:=0;year_fraction numeric;leave jsonb;salary numeric;variable numeric;wage numeric;eos_wage numeric;full_eos numeric;factor numeric;exception text;event_day date;adjustment jsonb;credits numeric:=0;debits numeric:=0;recoveries numeric:=0;pay public.wf_monthly_payroll;v jsonb;sources jsonb:='[]';missing jsonb;gross numeric:=0;insurance numeric:=0;other numeric:=0;attendance numeric:=0;expenses numeric:=0;paid numeric:=0;leave_amount numeric;eos numeric;net numeric;result jsonb;reference text;suspended int;key text;
begin
 select * into r from public.wf_employee_requests where id=p_request and kind='resignation' and status='approved' and test_run_id is null;
 if not found then raise sqlstate 'PT409' using message='التسوية متاحة بعد قبول الاستقالة';end if;
 select * into e from public.wf_employees where id=r.employee_id;ending:=e.employment_ends_on;
 if ending is null then raise sqlstate 'PT409' using message='تاريخ انتهاء الخدمة غير موثق';end if;
 if jsonb_typeof(p_inputs)<>'object' then raise sqlstate 'PT400' using message='بيانات التسوية غير صحيحة';end if;
 for key in select jsonb_object_keys(p_inputs) loop if key<>all(array['variable_monthly','variable_policy','variable_reference','exception','exception_date','exception_reference','adjustments','wage_reviewed','count_unpaid_as_service','unpaid_service_reference']) then raise sqlstate 'PT400' using message='حقل تسوية غير مسموح';end if;end loop;
 if coalesce(p_inputs->>'variable_monthly','0') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise sqlstate 'PT400' using message='الأجر المتغير غير صحيح';end if;
 variable:=coalesce((p_inputs->>'variable_monthly')::numeric,0);
 if p_inputs ? 'count_unpaid_as_service' and jsonb_typeof(p_inputs->'count_unpaid_as_service')<>'boolean' then raise sqlstate 'PT400' using message='اختيار احتساب مدة الإجازة غير صحيح';end if;
 if coalesce((p_inputs->>'count_unpaid_as_service')::boolean,false) and length(btrim(coalesce(p_inputs->>'unpaid_service_reference','')))<3 then raise sqlstate 'PT400' using message='وثّق اتفاق استمرار احتساب الخدمة خلال الإجازة غير المدفوعة';end if;
 if coalesce(p_inputs->>'variable_policy','include') not in ('include','exclude_eos') then raise sqlstate 'PT400' using message='طريقة الأجر المتغير غير صحيحة';end if;
 if p_inputs->>'variable_policy'='exclude_eos' and length(btrim(coalesce(p_inputs->>'variable_reference','')))<3 then raise sqlstate 'PT400' using message='أدخل مرجع الاتفاق على استبعاد العمولات من مكافأة النهاية وفق المادة ٨٦';end if;
 select * into t from public.wf_compensation_versions c where c.employee_id=e.id and c.effective_from<=ending order by c.effective_from desc,c.revision desc limit 1;
 if not found then raise sqlstate 'PT409' using message='أكمل الأجر الأخير قبل التسوية';end if;
 salary:=t.basic_salary+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(t.allowances) a),0);wage:=salary+variable;eos_wage:=salary+case when p_inputs->>'variable_policy'='exclude_eos' then 0 else variable end;
 y:=e.start_date;
 while y<=ending loop
  anniversary:=(y+interval '1 year')::date;
  select case when coalesce((p_inputs->>'count_unpaid_as_service')::boolean,false) then 0 else count(*) end into suspended from workforce_private.suspended_service_days(e.id,y,least(ending,anniversary-1));
  year_fraction:=greatest(0,least(ending+1,anniversary)-y-suspended)::numeric/(anniversary-y);years:=years+year_fraction;y:=anniversary;
 end loop;
 full_eos:=eos_wage*(least(years,5)/2+greatest(0,years-5));
 factor:=case when years<2 then 0 when years<=5 then 1.0/3 when years<10 then 2.0/3 else 1 end;
 exception:=coalesce(p_inputs->>'exception','ordinary');
 if exception not in ('ordinary','force_majeure','marriage','childbirth') then raise sqlstate 'PT400' using message='سبب استحقاق المكافأة غير صحيح';end if;
 if exception<>'ordinary' then
  if length(btrim(coalesce(p_inputs->>'exception_reference','')))<3 then raise sqlstate 'PT400' using message='وثّق مرجع الاستثناء النظامي قبل تطبيقه';end if;
  if exception in ('marriage','childbirth') then
   if coalesce(p_inputs->>'exception_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise sqlstate 'PT400' using message='حدد تاريخ الواقعة الموثقة';end if;
   event_day:=(p_inputs->>'exception_date')::date;
   if event_day>ending or ending>(event_day+case when exception='marriage' then interval '6 months' else interval '3 months' end)::date then raise sqlstate 'PT400' using message='تاريخ الواقعة خارج المهلة النظامية للاستثناء';end if;
  end if;
  factor:=1;
 end if;
 eos:=round(full_eos*factor,2);leave:=workforce_private.employment_leave_accrual(e.id,ending,coalesce((p_inputs->>'count_unpaid_as_service')::boolean,false));leave_amount:=round((leave->>'available')::numeric*wage/30,2);
 select coalesce(jsonb_agg(m::date),'[]') into missing from generate_series(date_trunc('month',e.start_date),date_trunc('month',ending),interval '1 month') m where not exists(select 1 from public.wf_monthly_payroll where employee_id=e.id and month=m::date);
 for pay in select * from public.wf_monthly_payroll where employee_id=e.id order by month,id loop
  v:=workforce_private.closing_payroll(pay);gross:=gross+(v->>'gross')::numeric;insurance:=insurance+(v->>'insurance')::numeric;other:=other+(v->>'other')::numeric;attendance:=attendance+(v->>'attendance')::numeric;expenses:=expenses+(v->>'reimbursements')::numeric;paid:=paid+pay.paid_amount;
  sources:=sources||jsonb_build_array(jsonb_build_object('id',pay.id,'month',pay.month,'version',pay.version,'status',pay.status,'gross',v->>'gross','insurance',v->>'insurance','other',v->>'other','attendance',v->>'attendance','reimbursements',v->>'reimbursements','due',v->>'total','paid',pay.paid_amount::text,'overtime',pay.overtime_amount::text,'incentives',pay.items,'deductions',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(pay.deductions||pay.employment_deduction_carry) x where x->>'kind'<>'insurance'),'invoices',(select coalesce(jsonb_agg(jsonb_build_object('request_id',q.id,'title',q.title,'amount',q.amount::text,'approved_at',q.expense_details->>'approved_at','invoices',(select coalesce(jsonb_agg(jsonb_build_object('id',a->>'id','filename',a->>'filename','mime_type',a->>'mime_type')),'[]') from jsonb_array_elements(q.attachments)a)) order by q.id),'[]') from public.wf_employee_requests q where q.employee_id=e.id and q.kind='expenses' and q.status='approved' and q.test_run_id is null and (q.expense_details->>'payroll_month')::date=pay.month)));
 end loop;
 if jsonb_typeof(coalesce(p_inputs->'adjustments','[]'))<>'array' or jsonb_array_length(coalesce(p_inputs->'adjustments','[]'))>30 then raise sqlstate 'PT400' using message='بنود التسوية غير صحيحة';end if;
 for adjustment in select * from jsonb_array_elements(coalesce(p_inputs->'adjustments','[]')) loop
  reference:=btrim(coalesce(adjustment->>'reference',''));
  if coalesce(adjustment->>'kind','') not in ('credit','debit','recovery') or coalesce(adjustment->>'amount','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' or (adjustment->>'amount')::numeric<=0 or length(btrim(coalesce(adjustment->>'title','')))<3 or length(reference)<3 then raise sqlstate 'PT400' using message='أدخل اسم البند وقيمته ومرجعه';end if;
  if (select count(*) from jsonb_array_elements(p_inputs->'adjustments') a where btrim(a->>'reference')=reference)>1 or exists(select 1 from public.wf_monthly_payroll p cross join lateral jsonb_array_elements(p.items||p.deductions||p.employment_deduction_carry) i where p.employee_id=e.id and i->>'reference'=reference) then raise sqlstate 'PT409' using message='هذا المرجع محسوب سابقًا؛ لا تكرره في التسوية';end if;
  if adjustment->>'kind'='credit' then credits:=credits+(adjustment->>'amount')::numeric;elsif adjustment->>'kind'='recovery' then recoveries:=recoveries+(adjustment->>'amount')::numeric;else debits:=debits+(adjustment->>'amount')::numeric;end if;
 end loop;
 if recoveries>paid then raise sqlstate 'PT400' using message='التحصيل المسجل يتجاوز المبالغ المصروفة سابقًا';end if;
 net:=round(gross+expenses+leave_amount+eos+credits-insurance-other-attendance-debits-paid+recoveries,2);
 result:=jsonb_build_object('request_id',r.id,'employee_id',e.id,'employee_name',e.full_name,'ends_on',ending,'settlement_due',ending+14,'service_years',round(years,8),'service_days',ending-e.start_date+1-case when coalesce((p_inputs->>'count_unpaid_as_service')::boolean,false) then 0 else (select count(*) from workforce_private.suspended_service_days(e.id,e.start_date,ending)) end,'salary_basis',salary::text,'variable_monthly',variable::text,'leave_wage',wage::text,'eos_wage',eos_wage::text,'leave',leave,'leave_amount',leave_amount::text,'eos_full',round(full_eos,2)::text,'eos_factor',factor,'eos_exception',exception,'eos_amount',eos::text,'gross',gross::text,'insurance',insurance::text,'other',other::text,'attendance',attendance::text,'expenses',expenses::text,'already_paid',paid::text,'recovered_amount',recoveries::text,'additional_credits',credits::text,'additional_debits',debits::text,'net_due',greatest(0,net)::text,'overpayment_review',greatest(0,-net)::text,'sources',sources,'missing_months',missing,'inputs',p_inputs,
 'source_guard',md5(jsonb_build_object(
  'attendance',(select jsonb_agg(to_jsonb(a) order by a.id) from public.wf_attendance_sessions a where a.employee_id=e.id),
  'requests',(select jsonb_agg(to_jsonb(a) order by a.id) from public.wf_employee_requests a where a.employee_id=e.id and a.kind in ('leave','permission','overtime','expenses','missing-hours','attendance-correction','advance') and a.status='approved' and a.test_run_id is null),
  'terms',(select jsonb_agg(to_jsonb(a) order by a.effective_from,a.revision) from public.wf_compensation_versions a where a.employee_id=e.id),
  'opening',(select jsonb_agg(to_jsonb(a) order by a.year) from public.wf_leave_entitlements a where a.employee_id=e.id),
  'used',(select jsonb_agg(to_jsonb(a) order by a.request_id,a.year) from public.wf_leave_movements a where a.employee_id=e.id)
 )::text));
 return result||jsonb_build_object('hash',md5((result||jsonb_build_object('sources',(select jsonb_agg(z.value-'version' order by z.value->>'month',z.value->>'id') from jsonb_array_elements(sources) z(value))))::text));
end $$;

-- Preserve accounting snapshots once a final settlement is approved, until explicitly reopened.
create function workforce_private.settlement_covers(p_payroll uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.wf_final_settlements f cross join lateral jsonb_array_elements(f.snapshot->'sources') s where s->>'id'=p_payroll::text)
$$;
do $patch$ declare f record;b text;begin
 select oid,prosrc into f from pg_proc where oid='public.wf_payroll_command(uuid,uuid,uuid,date,integer,text,jsonb,uuid)'::regprocedure;
 b:=replace(f.prosrc,'begin','begin'||E'\n if workforce_private.settlement_covers(p_id) then raise sqlstate ''PT409'' using message=''هذا الكشف مرتبط بتسوية نهائية؛ استخدم بطاقة التسوية لمنع تكرار الصرف'';end if;');
 execute replace(pg_get_functiondef(f.oid),f.prosrc,b);
 select oid,prosrc into f from pg_proc where oid='workforce_private.refresh_attendance_payroll(uuid,date)'::regprocedure;
 b:=replace(f.prosrc,'begin','begin'||E'\n if exists(select 1 from public.wf_monthly_payroll where employee_id=p_employee and month=p_month and workforce_private.settlement_covers(id)) then return;end if;');
 execute replace(pg_get_functiondef(f.oid),f.prosrc,b);
 select oid,prosrc into f from pg_proc where oid='workforce_private.work_credit_ranges(public.wf_attendance_sessions,timestamptz)'::regprocedure;
 b:=replace(f.prosrc,'finish:=least(coalesce(a.checked_out,a.checked_in+interval ''24 hours''),p_now);','finish:=least(coalesce(a.checked_out,a.checked_in+interval ''24 hours''),p_now,(workforce_private.employment_end(a.employee_id)+1)::timestamp at time zone ''Asia/Riyadh'');');
 if b=f.prosrc then raise exception 'Missing attendance-credit cutoff';end if;execute replace(pg_get_functiondef(f.oid),f.prosrc,b);
end $patch$;

create function public.wf_final_settlement(p_actor uuid,p_request uuid,p_command text default 'quote',p_version int default 0,p_payload jsonb default '{}',p_key uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.wf_final_settlements;r public.wf_employee_requests;q jsonb;inputs jsonb;source jsonb;p public.wf_monthly_payroll;reference text;stamp timestamptz:=workforce_private.work_now();serialized jsonb;balance numeric;
begin
 if workforce_private.assert_task_actor(p_actor) is not null then raise insufficient_privilege;end if;
 if p_command not in ('quote','approve','reopen','pay') or p_command is null then raise sqlstate 'PT400' using message='إجراء تسوية غير صحيح';end if;
 select * into r from public.wf_employee_requests where id=p_request and kind='resignation' and status='approved' and test_run_id is null;
 if not found then raise sqlstate 'PT404' using message='لا توجد استقالة مقبولة لهذا الطلب';end if;
 if p_command<>'quote' then
  perform 1 from public.wf_employees where id=r.employee_id for update;
  perform pg_advisory_xact_lock(hashtextextended(r.employee_id::text,19));
 end if;
 select * into f from public.wf_final_settlements where request_id=p_request for update;
 inputs:=coalesce(p_payload->'inputs',f.inputs,'{}');
 if p_command='quote' then
  if f.id is not null and f.status in ('approved','paid') then q:=f.snapshot;else q:=workforce_private.final_settlement_quote(p_request,inputs);end if;
  return jsonb_build_object('quote',q,'settlement',to_jsonb(f));
 end if;
 if p_key is null or p_version is null then raise sqlstate 'PT400' using message='مفتاح الإجراء والنسخة مطلوبان';end if;
 serialized:=jsonb_build_object('command',p_command,'payload',p_payload,'actor',p_actor);
 if f.last_key=p_key then
  if f.last_payload<>serialized then raise sqlstate 'PT409' using message='مفتاح الإجراء مستخدم لبيانات أخرى';end if;
  return jsonb_build_object('quote',f.snapshot,'settlement',to_jsonb(f));
 end if;
 if coalesce(f.version,0)<>p_version then raise sqlstate 'PT409' using message='تغيرت التسوية؛ حدّث البطاقة';end if;
 if p_command='reopen' then
  if f.status<>'approved' then raise sqlstate 'PT409' using message='لا يمكن إعادة فتح تسوية مصروفة';end if;
  perform set_config('workforce.settlement_actor',p_actor::text,true);
  delete from public.wf_final_settlements where id=f.id;
  return jsonb_build_object('quote',workforce_private.final_settlement_quote(p_request,inputs),'settlement',null);
 end if;
 if p_command='approve' then
  if f.id is not null then raise sqlstate 'PT409' using message='التسوية معتمدة؛ أعد فتحها قبل التعديل';end if;
  if coalesce(p_payload->'inputs'->>'wage_reviewed','false')<>'true' then raise sqlstate 'PT400' using message='أكّد مراجعة الأجر الفعلي والعمولات والحقوق والاستقطاعات';end if;
  if (stamp at time zone 'Asia/Riyadh')::date<=((r.resignation_details->>'effective_at')::timestamptz at time zone 'Asia/Riyadh')::date then raise sqlstate 'PT409' using message='اعتمد التسوية بعد إغلاق آخر يوم عمل حتى تكتمل ساعات اليوم';end if;
  perform 1 from public.wf_monthly_payroll where employee_id=r.employee_id order by id for update;
  for p in select * from public.wf_monthly_payroll where employee_id=r.employee_id and status<>'paid' loop perform workforce_private.refresh_attendance_payroll(p.employee_id,p.month);end loop;
  q:=workforce_private.final_settlement_quote(p_request,inputs);
  if jsonb_array_length(q->'missing_months')>0 then raise sqlstate 'PT409' using message='أكمل كشوف الأشهر الناقصة قبل اعتماد التسوية';end if;
  if q->>'hash' is distinct from p_payload->>'expected_hash' then raise sqlstate 'PT409' using message='تغيرت المبالغ؛ حدّث التقدير وراجعها قبل الاعتماد';end if;
  insert into public.wf_final_settlements(request_id,employee_id,status,inputs,snapshot,approved_by,last_key,last_payload) values(r.id,r.employee_id,'approved',inputs,q,p_actor,p_key,serialized) returning * into f;
 elsif p_command='pay' then
  if f.status is distinct from 'approved' then raise sqlstate 'PT409' using message='التسوية مصروفة أو غير معتمدة';end if;
  reference:=btrim(coalesce(p_payload->>'reference',''));
  if length(reference) not between 3 and 500 then raise sqlstate 'PT400' using message='أدخل مرجع التحويل أو محضر التسوية';end if;
  if (f.snapshot->>'overpayment_review')::numeric>0 then raise sqlstate 'PT409' using message='توجد زيادة مصروفة تحتاج معالجة موثقة قبل إغلاق التسوية';end if;
  perform 1 from public.wf_monthly_payroll where employee_id=r.employee_id order by id for update;
  q:=workforce_private.final_settlement_quote(p_request,f.inputs);
  if q->>'hash'<>f.snapshot->>'hash' then raise sqlstate 'PT409' using message='ظهرت حقوق أو تغييرات بعد الاعتماد؛ أعد فتح التسوية لمراجعتها';end if;
  for source in select * from jsonb_array_elements(f.snapshot->'sources') loop
   select * into p from public.wf_monthly_payroll where id=(source->>'id')::uuid for update;
   balance:=p.total_amount-p.paid_amount;
   if balance>0 then
    if p.total_amount<>(source->>'due')::numeric then raise sqlstate 'PT409' using message='الكشف لا يطابق تسوية الإقفال؛ راجع المبالغ';end if;
    insert into public.wf_payroll_payments(payroll_id,amount,reference,recorded_by) values(p.id,balance,'final:'||f.id||' / '||reference,p_actor);
    update public.wf_monthly_payroll set paid_amount=total_amount,status='paid',approved_by=coalesce(approved_by,p_actor),approved_at=coalesce(approved_at,stamp),version=version+1,updated_at=stamp,updated_by=p_actor where id=p.id;
   elsif p.status<>'paid' and p.total_amount=p.paid_amount then
    update public.wf_monthly_payroll set status='paid',approved_by=coalesce(approved_by,p_actor),approved_at=coalesce(approved_at,stamp),version=version+1,updated_by=p_actor where id=p.id;
   end if;
  end loop;
  update public.wf_final_settlements set status='paid',paid_by=p_actor,paid_at=stamp,payment_reference=reference,version=version+1,last_key=p_key,last_payload=serialized where id=f.id returning * into f;
 end if;
 return jsonb_build_object('quote',f.snapshot,'settlement',to_jsonb(f));
end $$;
revoke all on function public.wf_final_settlement(uuid,uuid,text,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.wf_final_settlement(uuid,uuid,text,integer,jsonb,uuid) to service_role;
grant delete on public.wf_final_settlements to service_role;
-- Every helper is internal; no unauthenticated financial read path.
revoke all on function workforce_private.closing_salary(uuid,date),workforce_private.closing_payroll(public.wf_monthly_payroll),workforce_private.final_settlement_quote(uuid,jsonb),workforce_private.suspended_service_days(uuid,date,date),workforce_private.settlement_covers(uuid),workforce_private.apply_employment_cutoff(),workforce_private.post_resignation_end() from public,anon,authenticated;
grant execute on function workforce_private.closing_salary(uuid,date),workforce_private.closing_payroll(public.wf_monthly_payroll),workforce_private.final_settlement_quote(uuid,jsonb),workforce_private.suspended_service_days(uuid,date,date),workforce_private.settlement_covers(uuid) to service_role;

-- The ledger is append-only, including reopen and payment history.
create table public.wf_final_settlement_events(id bigint generated always as identity primary key,request_id uuid not null references public.wf_employee_requests(id),actor_id uuid not null references public.profiles(id),action text not null,snapshot jsonb not null,created_at timestamptz not null default now());
alter table public.wf_final_settlement_events enable row level security;
revoke all on public.wf_final_settlement_events from public,anon,authenticated;
grant select on public.wf_final_settlement_events to authenticated;
grant select,insert on public.wf_final_settlement_events to service_role;
grant usage,select on sequence public.wf_final_settlement_events_id_seq to service_role;
create policy wf_final_events_admin on public.wf_final_settlement_events for select to authenticated using((select workforce_private.is_admin()));
create function workforce_private.audit_final_settlement() returns trigger language plpgsql set search_path='' as $$begin
 if TG_OP='DELETE' then insert into public.wf_final_settlement_events(request_id,actor_id,action,snapshot) values(old.request_id,nullif(current_setting('workforce.settlement_actor',true),'')::uuid,'reopen',to_jsonb(old));return old;end if;
 insert into public.wf_final_settlement_events(request_id,actor_id,action,snapshot) values(new.request_id,coalesce(new.paid_by,new.approved_by),new.status,to_jsonb(new));return new;end $$;
create trigger wf_final_settlement_audit after insert or update or delete on public.wf_final_settlements for each row execute function workforce_private.audit_final_settlement();
revoke all on function workforce_private.audit_final_settlement() from public,anon,authenticated;

create function workforce_private.guard_ended_employee_requests() returns trigger language plpgsql set search_path='' as $$
declare ending date:=workforce_private.employment_end(new.employee_id);
begin
 if ending is null or new.test_run_id is not null or new.status in ('rejected','cancelled') then return new;end if;
 if new.kind in ('leave','permission','remote-work','overtime','attendance-correction') and (new.ends_at>=(ending+1)::timestamp at time zone 'Asia/Riyadh' or (new.starts_at at time zone 'Asia/Riyadh')::date>ending) or new.kind='missing-hours' and new.work_day>ending then
  raise sqlstate 'PT409' using message='الفترة بعد آخر يوم عمل موثق؛ راجع تاريخ الطلب';
 end if;
 if new.kind='advance' and (workforce_private.work_now() at time zone 'Asia/Riyadh')::date>ending then raise sqlstate 'PT409' using message='لا يمكن طلب سلفة بعد انتهاء علاقة العمل';end if;
 return new;
end $$;
create trigger wf_ended_employee_requests before insert or update on public.wf_employee_requests for each row execute function workforce_private.guard_ended_employee_requests();
revoke all on function workforce_private.guard_ended_employee_requests() from public,anon,authenticated;

-- Do not generate new absence reminders or Saturday performance alerts after employment ends.
do $patch$ declare f record;b text;target regprocedure;begin
 target:=to_regprocedure('workforce_private.attendance_reminder_needed(uuid,date)');
 if target is not null then
  select oid,prosrc into f from pg_proc where oid=target;
  b:=replace(f.prosrc,'e.start_date<=p_day','e.start_date<=p_day and (e.employment_ends_on is null or e.employment_ends_on>=p_day)');
  if b=f.prosrc then raise exception 'Missing attendance reminder eligibility seam';end if;
  execute replace(pg_get_functiondef(f.oid),f.prosrc,b);
 end if;
 target:=to_regprocedure('public.wf_weekly_report_data_before_performance(date)');
 if target is not null then
  select oid,prosrc into f from pg_proc where oid=target;
  b:=replace(f.prosrc,'where e.status=''active'' and e.start_date<p_week_end','where e.status=''active'' and e.start_date<p_week_end and (e.employment_ends_on is null or e.employment_ends_on>=p_week_end)');
  if b=f.prosrc then raise exception 'Missing weekly reporting eligibility seam';end if;
  execute replace(pg_get_functiondef(f.oid),f.prosrc,b);
 end if;
end $patch$;

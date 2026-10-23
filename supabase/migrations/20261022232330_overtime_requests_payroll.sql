alter table public.wf_employee_requests drop constraint wf_employee_requests_kind_check;
alter table public.wf_employee_requests add constraint wf_employee_requests_kind_check check(kind in ('leave','permission','remote-work','expenses','advance','letter','payroll-review','attendance-correction','general','overtime'));
alter table public.wf_employee_requests add column overtime_details jsonb;
alter table public.wf_monthly_payroll add column overtime_amount numeric(15,2) not null default 0 check(overtime_amount>=0);

create function workforce_private.quote_overtime() returns trigger language plpgsql security invoker set search_path='' as $$
declare work_date date; finish date; c public.wf_compensation_versions; actual numeric; rate numeric; hours numeric; payout date;
begin
 if TG_OP='UPDATE' and old.kind='overtime' and old.status='approved' and
  (new.kind,new.employee_id,new.starts_at,new.ends_at,new.amount,new.status,new.test_run_id,new.overtime_details)
  is distinct from (old.kind,old.employee_id,old.starts_at,old.ends_at,old.amount,old.status,old.test_run_id,old.overtime_details) then
  raise sqlstate 'PT409' using message='طلب خارج الدوام المعتمد محفوظ ولا يمكن تغيير قيمته';
 end if;
 if new.kind<>'overtime' then new.overtime_details:=null;return new;end if;
 if TG_OP='UPDATE' and old.kind='overtime' and (new.starts_at,new.ends_at,new.employee_id) is not distinct from (old.starts_at,old.ends_at,old.employee_id)
  and not(new.status='approved' and old.status='pending') then new.amount:=old.amount;new.overtime_details:=old.overtime_details;return new;end if;
 work_date:=(new.starts_at at time zone 'Asia/Riyadh')::date;finish:=(new.ends_at at time zone 'Asia/Riyadh')::date;
 if new.starts_at is null or new.ends_at is null or new.ends_at<=new.starts_at or new.ends_at>new.starts_at+interval '24 hours'
  or (finish<>work_date and not(finish=work_date+1 and (new.ends_at at time zone 'Asia/Riyadh')::time=time '00:00')) then
  raise sqlstate 'PT400' using message='حدد يومًا واحدًا وفترة خارج دوام صحيحة';end if;
 if not exists(select 1 from public.wf_employees where id=new.employee_id and status='active' and start_date<=work_date) then raise sqlstate 'PT400' using message='الفترة تسبق المباشرة أو الحساب غير نشط';end if;
 if extract(dow from work_date)<>5 and to_char(work_date,'MM-DD') not in ('02-22','09-23') and not exists(select 1 from public.wf_paid_calendar_days h where h.day=work_date)
  and tstzrange(new.starts_at,new.ends_at,'[)') && tstzrange((work_date+time '09:00') at time zone 'Asia/Riyadh',(work_date+time '17:00') at time zone 'Asia/Riyadh','[)') then
  raise sqlstate 'PT400' using message='اختر ساعات خارج فترة الدوام من التاسعة إلى الخامسة';end if;
 perform pg_advisory_xact_lock(hashtextextended(new.employee_id::text,19));
 if exists(select 1 from public.wf_employee_requests r where r.employee_id=new.employee_id and r.id<>new.id and r.kind='overtime'
  and r.test_run_id is not distinct from new.test_run_id and r.status in ('pending','approved') and tstzrange(r.starts_at,r.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')) then
  raise sqlstate 'PT409' using message='توجد ساعات خارج دوام مطلوبة أو معتمدة للفترة نفسها';end if;
 select * into c from public.wf_compensation_versions where employee_id=new.employee_id and effective_from<=work_date order by effective_from desc,revision desc limit 1;
 if not found then raise sqlstate 'PT409' using message='أكمل الراتب الأساسي والبدلات أولًا';end if;
 actual:=c.basic_salary+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(c.allowances) a),0);
 rate:=(actual+c.basic_salary*.5)/30/8;hours:=extract(epoch from new.ends_at-new.starts_at)/3600;
 if rate<=0 then raise sqlstate 'PT400' using message='أجر الساعة غير معدّ';end if;
 payout:=greatest(date_trunc('month',work_date)::date,date_trunc('month',workforce_private.work_now() at time zone 'Asia/Riyadh')::date);
 if new.status='approved' and new.test_run_id is null and exists(select 1 from public.wf_monthly_payroll where employee_id=new.employee_id and month=payout and status='paid') then
  payout:=(payout+interval '1 month')::date;
 end if;
 new.amount:=round((actual+c.basic_salary*.5)*extract(epoch from new.ends_at-new.starts_at)/864000,2);
 new.overtime_details:=jsonb_build_object('hours',round(hours,6),'hourly_rate',round(rate,8)::text,'basic_salary',c.basic_salary::text,'actual_salary',actual::text,'payroll_month',payout,'work_day',work_date);
 return new;
end $$;
revoke all on function workforce_private.quote_overtime() from public,anon,authenticated;
create trigger wf_overtime_quote before insert or update on public.wf_employee_requests for each row execute function workforce_private.quote_overtime();

create function workforce_private.overtime_total(p_employee uuid,p_month date) returns numeric language sql stable security invoker set search_path='' as $$
 select coalesce(sum(amount),0) from public.wf_employee_requests where employee_id=p_employee and kind='overtime' and status='approved' and test_run_id is null and (overtime_details->>'payroll_month')::date=p_month
$$;
revoke all on function workforce_private.overtime_total(uuid,date) from public,anon,authenticated;
grant execute on function workforce_private.overtime_total(uuid,date) to service_role;

create function workforce_private.apply_overtime_payroll() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' and old.status='paid' then new.overtime_amount:=old.overtime_amount;new.gross_amount:=old.gross_amount;return new;end if;
 new.overtime_amount:=workforce_private.overtime_total(new.employee_id,new.month);
 new.gross_amount:=new.basic_amount+new.allowances_amount+coalesce((select sum((i->>'amount')::numeric) from jsonb_array_elements(new.items) i),0)+new.overtime_amount;
 return new;
end $$;
revoke all on function workforce_private.apply_overtime_payroll() from public,anon,authenticated;
create trigger wf_01_overtime_payroll before insert or update on public.wf_monthly_payroll for each row execute function workforce_private.apply_overtime_payroll();

create function workforce_private.post_overtime() returns trigger language plpgsql security invoker set search_path='' as $$
declare month date;
begin
 if new.kind='overtime' and new.status='approved' and old.status='pending' and new.test_run_id is null then
  month:=(new.overtime_details->>'payroll_month')::date;
  perform public.wf_attendance_payroll_snapshot(new.decided_by,new.employee_id,month);
  perform workforce_private.refresh_attendance_payroll(new.employee_id,month);
 end if;return new;
end $$;
revoke all on function workforce_private.post_overtime() from public,anon,authenticated;
create trigger wf_overtime_post after update on public.wf_employee_requests for each row execute function workforce_private.post_overtime();

create function public.wf_decide_overtime_request(p_id uuid,p_actor uuid,p_version integer,p_reason text,p_starts timestamptz,p_ends timestamptz) returns uuid
language plpgsql security invoker set search_path='' as $$
declare r public.wf_employee_requests;
begin
 if workforce_private.assert_task_actor(p_actor) is not null then raise insufficient_privilege;end if;
 select * into r from public.wf_employee_requests where id=p_id for update;
 if not found or r.kind<>'overtime' then raise sqlstate 'P0002' using message='طلب خارج الدوام غير متاح';end if;
 if r.status<>'pending' or p_version is distinct from r.version then raise sqlstate 'PT409' using message='تمت معالجة الطلب؛ حدّث القائمة';end if;
 if p_starts is null or p_ends is null then raise sqlstate 'PT400' using message='حدد فترة خارج الدوام';end if;
 update public.wf_employee_requests set starts_at=p_starts,ends_at=p_ends where id=p_id;
 return public.wf_decide_employee_request(p_id,p_actor,p_version,'approved',p_reason);
end $$;
revoke all on function public.wf_decide_overtime_request(uuid,uuid,integer,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.wf_decide_overtime_request(uuid,uuid,integer,text,timestamptz,timestamptz) to service_role;
create or replace function workforce_private.refresh_attendance_payroll(p_employee uuid,p_month date) returns void language plpgsql security invoker set search_path='' as $$
declare r public.wf_monthly_payroll; detail jsonb; insurance jsonb; actual jsonb;
begin
 select * into r from public.wf_monthly_payroll where employee_id=p_employee and month=p_month for update;
 if not found or r.status='paid' then return;end if;
 detail:=workforce_private.attendance_payroll(p_employee,p_month);insurance:=workforce_private.insurance_payroll(p_employee,p_month);
 select x into actual from jsonb_array_elements(r.deductions) x where x->>'kind'='insurance' limit 1;
 if r.overtime_amount is distinct from workforce_private.overtime_total(p_employee,p_month) or (r.attendance_details-'applied_amount'-'unapplied_amount') is distinct from detail
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
   if new.kind not in ('general','overtime') then raise sqlstate 'PT400' using message='استخدم طلبًا إداريًا في الاختبار؛ الطلبات المؤثرة على الحضور والمال متاحة في الوضع العادي'; end if;
  end if;
  new.title:=left('اختبار · '||new.title,case when TG_TABLE_NAME='wf_tasks' then 250 else 150 end);
 elsif new.title ~* '^(QA-LIVE-|WF-TEST:|wf-qa-|QA-profile-)' then
  raise sqlstate 'PT400' using message='ابدأ جولة اختبار قبل إنشاء بيانات الاختبار';
 end if;
 return new;
end $$;
revoke all on function workforce_private.mark_test_resource() from public,anon,authenticated;
create or replace function public.wf_payroll_command(p_actor uuid,p_id uuid,p_employee uuid,p_month date,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql set search_path='' as $$
declare previous jsonb; record public.wf_monthly_payroll; item jsonb; normalized jsonb:='[]'; normalized_deductions jsonb:='[]'; deducted numeric:=0; gross numeric;
  basic numeric; allowances numeric; amount numeric; base numeric; rate numeric; total numeric; recipient uuid; employee_start date; reason text; field text;
  receipt_payload jsonb:=jsonb_build_object('employee_id',p_employee,'month',p_month,'payload',p_payload);
begin
  if workforce_private.assert_task_actor(p_actor) is not null then raise exception 'المستحقات الشهرية للإدارة فقط' using errcode='42501'; end if;
  previous:=workforce_private.command_retry(p_actor,p_key,'payroll:'||p_command,p_id,receipt_payload);
  if previous is not null then return previous; end if;
  if p_month is null or extract(day from p_month)<>1 then raise exception 'الشهر غير صحيح' using errcode='PT400'; end if;
  reason:=btrim(p_payload->>'reason');
  if reason is null or length(reason) not between 3 and 2000 then raise exception 'سبب الإجراء مطلوب' using errcode='PT400'; end if;
  for field in select jsonb_object_keys(p_payload) loop
    if (p_command='save' and field<>all(array['basic_amount','allowances_amount','items','deductions','notes','reason'])) or
      (p_command in ('approve','reopen') and field<>'reason') or
      (p_command='pay' and field<>all(array['amount','reference','reason'])) then raise exception 'حقل غير مسموح' using errcode='PT400'; end if;
  end loop;
  select user_id,start_date into recipient,employee_start from public.wf_employees where id=p_employee for update;
  if not found then raise exception 'الموظفة غير متاحة' using errcode='P0002'; end if;
  if p_month<date_trunc('month',employee_start)::date then raise exception 'الشهر يسبق شهر انضمام الموظفة' using errcode='PT400'; end if;
  select * into record from public.wf_monthly_payroll where employee_id=p_employee and month=p_month for update;
  if record.id is not null and (record.id<>p_id or p_version is distinct from record.version) then raise exception 'تغير كشف الشهر؛ حدّث البيانات' using errcode='PT409'; end if;
  if record.id is null and (p_command<>'save' or p_version is distinct from 0) then raise exception 'أنشئ تقدير الشهر أولًا' using errcode='PT409'; end if;
  -- Reconcile before payment validation, in the same transaction and row lock.
  if record.id is not null and p_command='pay' then
    update public.wf_monthly_payroll set updated_at=clock_timestamp() where id=record.id returning * into record;
  end if;
  if p_command='save' then
    if record.id is not null and record.status<>'draft' then raise exception 'الكشف معتمد؛ أعد فتحه قبل التعديل' using errcode='PT409'; end if;
    foreach field in array array['basic_amount','allowances_amount'] loop
      if jsonb_typeof(p_payload->field) is distinct from 'string' or coalesce(p_payload->>field,'') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'المبلغ غير صحيح' using errcode='PT400'; end if;
    end loop;
    basic:=(p_payload->>'basic_amount')::numeric; allowances:=(p_payload->>'allowances_amount')::numeric;
    if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items')>100 then raise exception 'بنود الحوافز غير صحيحة' using errcode='PT400'; end if;
    total:=basic+allowances;
    for item in select value from jsonb_array_elements(p_payload->'items') loop
      if jsonb_typeof(item) is distinct from 'object' or coalesce(length(btrim(item->>'title')),0) not between 3 and 150 or coalesce(item->>'mode','') not in ('fixed','percent') then raise exception 'اسم الحافز أو طريقة احتسابه غير صحيحة' using errcode='PT400'; end if;
      for field in select jsonb_object_keys(item) loop
        if field<>all(array['title','mode','value','basis_amount','task_id','reference']) then raise exception 'حقل حافز غير مسموح' using errcode='PT400'; end if;
      end loop;
      if coalesce(length(item->>'reference'),0)>500 or ((nullif(item->>'task_id','') is null) and coalesce(length(btrim(item->>'reference')),0)<3) then raise exception 'اربط الحافز بمهمة أو اكتب مرجع الصفقة' using errcode='PT400'; end if;
      if nullif(item->>'task_id','') is not null and not exists(select 1 from public.wf_tasks where id=(item->>'task_id')::uuid and assignee_id=p_employee) then raise exception 'المهمة لا تخص الموظفة المحددة' using errcode='PT400'; end if;
      if jsonb_typeof(item->'value') is distinct from 'string' or (item->>'value') !~ (case when item->>'mode'='percent' then '^[0-9]{1,3}(\.[0-9]{1,4})?$' else '^[0-9]{1,9}(\.[0-9]{1,2})?$' end) then raise exception 'قيمة الحافز غير صحيحة' using errcode='PT400'; end if;
      if item->>'mode'='percent' then
        if jsonb_typeof(item->'basis_amount') is distinct from 'string' or (item->>'basis_amount') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'حدد مبلغ أساس النسبة' using errcode='PT400'; end if;
        rate:=(item->>'value')::numeric; base:=(item->>'basis_amount')::numeric;
        if rate>100 or base<=0 then raise exception 'النسبة من 0 إلى100 والأساس أكبر من صفر' using errcode='PT400'; end if;
        amount:=round(base*rate/100,2);
      else amount:=(item->>'value')::numeric; base:=null; end if;
      normalized:=normalized||jsonb_build_array(jsonb_build_object('title',btrim(item->>'title'),'mode',item->>'mode','value',item->>'value','basis_amount',base::text,'amount',amount::text,'task_id',nullif(item->>'task_id',''),'reference',coalesce(item->>'reference','')));
      total:=total+amount;
    end loop;
    gross:=total;
    if jsonb_typeof(coalesce(p_payload->'deductions','[]'::jsonb)) is distinct from 'array' or jsonb_array_length(coalesce(p_payload->'deductions','[]'::jsonb))>100 then raise exception 'بنود الحسومات غير صحيحة' using errcode='PT400';end if;
    for item in select value from jsonb_array_elements(coalesce(p_payload->'deductions','[]'::jsonb)) loop
      if jsonb_typeof(item) is distinct from 'object' or coalesce(length(btrim(item->>'title')),0) not between 3 and 150 or coalesce(item->>'kind','') not in ('insurance','other') or coalesce(length(btrim(item->>'reference')),0) not between 3 and 500 then raise exception 'بيانات الحسم غير صحيحة' using errcode='PT400';end if;
      for field in select jsonb_object_keys(item) loop
        if field<>all(array['title','kind','amount','reference']) then raise exception 'حقل حسم غير مسموح' using errcode='PT400';end if;
      end loop;
      if jsonb_typeof(item->'amount') is distinct from 'string' or coalesce(item->>'amount','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'مبلغ الحسم غير صحيح' using errcode='PT400';end if;
      amount:=(item->>'amount')::numeric;deducted:=deducted+amount;
      normalized_deductions:=normalized_deductions||jsonb_build_array(jsonb_build_object('title',btrim(item->>'title'),'kind',item->>'kind','amount',amount::text,'reference',btrim(item->>'reference')));
    end loop;
    gross:=gross+workforce_private.overtime_total(p_employee,p_month);
    if deducted>gross then raise exception 'الحسومات تتجاوز إجمالي المستحقات' using errcode='PT400';end if;
    total:=gross-deducted;
    if coalesce(length(p_payload->>'notes'),0)>2000 then raise exception 'الملاحظات طويلة جدًا' using errcode='PT400'; end if;
    if record.id is null then
      insert into public.wf_monthly_payroll(id,employee_id,month,basic_amount,allowances_amount,items,gross_amount,deductions,deductions_amount,total_amount,notes,updated_by)
      values(p_id,p_employee,p_month,basic,allowances,normalized,gross,normalized_deductions,deducted,total,coalesce(p_payload->>'notes',''),p_actor) returning * into record;
    else
      update public.wf_monthly_payroll set basic_amount=basic,allowances_amount=allowances,items=normalized,gross_amount=gross,deductions=normalized_deductions,deductions_amount=deducted,total_amount=total,notes=coalesce(p_payload->>'notes',''),version=version+1,updated_at=now(),updated_by=p_actor where id=p_id returning * into record;
    end if;
  elsif p_command='approve' then
    if record.status<>'draft' then raise exception 'الكشف معتمد بالفعل' using errcode='PT409'; end if;
    update public.wf_monthly_payroll set status='approved',approved_by=p_actor,approved_at=now(),version=version+1,updated_at=now(),updated_by=p_actor where id=p_id returning * into record;
  elsif p_command='reopen' then
    if record.status<>'approved' or record.paid_amount<>0 then raise exception 'لا يُعاد فتح كشف بعد تسجيل صرف عليه' using errcode='PT409'; end if;
    update public.wf_monthly_payroll set status='draft',approved_by=null,approved_at=null,version=version+1,updated_at=now(),updated_by=p_actor where id=p_id returning * into record;
  elsif p_command='pay' then
    if record.status<>'approved' then raise exception 'اعتمد الكشف قبل توثيق الصرف' using errcode='PT409'; end if;
    if jsonb_typeof(p_payload->'amount') is distinct from 'string' or coalesce(p_payload->>'amount','') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' or coalesce(length(btrim(p_payload->>'reference')),0) not between 3 and 500 then raise exception 'مبلغ الصرف ومرجعه مطلوبان' using errcode='PT400'; end if;
    amount:=(p_payload->>'amount')::numeric;
    if amount<=0 or amount>record.total_amount-record.paid_amount then raise exception 'المبلغ يتجاوز المستحق المتبقي أو يساوي صفرًا' using errcode='PT400'; end if;
    insert into public.wf_payroll_payments(payroll_id,amount,reference,recorded_by) values(p_id,amount,btrim(p_payload->>'reference'),p_actor);
    update public.wf_monthly_payroll set paid_amount=paid_amount+amount,status=case when paid_amount+amount=total_amount then 'paid' else 'approved' end,version=version+1,updated_at=now(),updated_by=p_actor where id=p_id returning * into record;
  else raise exception 'إجراء غير صحيح' using errcode='PT400'; end if;
  insert into public.wf_payroll_events(payroll_id,action,reason,snapshot,actor_id) values(p_id,p_command,reason,to_jsonb(record),p_actor);
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
  values(recipient,'payroll',case p_command when 'approve' then 'اعتماد مستحقات الشهر' when 'pay' then 'تسجيل صرف من مستحقاتك' when 'reopen' then 'إعادة فتح كشف الشهر للمراجعة' else 'تحديث مستحقاتك المتوقعة' end,
    'الشهر: '||to_char(p_month,'YYYY-MM')||'، الإجمالي: '||record.total_amount||' ر.س، المصروف المسجل: '||record.paid_amount||' ر.س',
    '/employee/finance/overview','payroll:'||record.id||':'||record.version);
  return workforce_private.save_command(p_actor,p_key,'payroll:'||p_command,p_id,receipt_payload,jsonb_build_object('id',record.id,'version',record.version));
end $$;
revoke all on function public.wf_payroll_command(uuid,uuid,uuid,date,integer,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.wf_payroll_command(uuid,uuid,uuid,date,integer,text,jsonb,uuid) to service_role;


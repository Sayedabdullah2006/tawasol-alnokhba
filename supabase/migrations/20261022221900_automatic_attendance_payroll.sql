-- October backfill explicitly approved by management. New cutoff is forward-only.
create table workforce_private.payroll_attendance_policy (
 id boolean primary key default true check(id),
 starts_on date not null default date '2026-10-01',
 cutoff_on date not null default ((clock_timestamp() at time zone 'Asia/Riyadh')::date+1)
);
insert into workforce_private.payroll_attendance_policy(id) values(true);
alter table workforce_private.payroll_attendance_policy enable row level security;
revoke all on workforce_private.payroll_attendance_policy from public,anon,authenticated;
grant select on workforce_private.payroll_attendance_policy to service_role;

-- Company calendar exceptions (including variable Eid dates); admin/service managed.
create table public.wf_paid_calendar_days (
 day date primary key, title text not null check(length(btrim(title)) between 2 and 150)
);
alter table public.wf_paid_calendar_days enable row level security;
revoke all on public.wf_paid_calendar_days from public,anon,authenticated;
grant select on public.wf_paid_calendar_days to authenticated;
grant select,insert,update,delete on public.wf_paid_calendar_days to service_role;
create policy wf_paid_calendar_days_read on public.wf_paid_calendar_days for select to authenticated using(true);

alter table public.wf_monthly_payroll
 add column attendance_amount numeric(15,2) not null default 0 check(attendance_amount>=0),
 add column attendance_details jsonb not null default '{}';

create function workforce_private.attendance_payroll(p_employee uuid,p_month date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare tick timestamptz:=workforce_private.work_now(); emp public.wf_employees; d date; first_day date; last_day date;
 workdays integer[]; daily integer; required numeric:=0; credited numeric:=0; missing numeric:=0;
 seconds numeric; gap numeric; fixed numeric; adjustment numeric:=0; day_rate numeric; last_rate numeric;
 covered_days integer:=0; missing_days jsonb:='[]'; term record; activated date; cutoff_on date; leave_day boolean;
begin
 select * into emp from public.wf_employees where id=p_employee;
 if not found then raise sqlstate 'P0002' using message='الموظفة غير متاحة';end if;
 select p.starts_on,p.cutoff_on into activated,cutoff_on from workforce_private.payroll_attendance_policy p where id;
 select s.workdays,s.daily_minutes into workdays,daily from public.wf_attendance_settings s where s.employee_id=p_employee;
 workdays:=coalesce(workdays,array[0,1,2,3,4,6]);daily:=coalesce(daily,480);
 first_day:=greatest(p_month,emp.start_date,activated);
 last_day:=least((p_month+interval '1 month - 1 day')::date,
   (tick at time zone 'Asia/Riyadh')::date-case when (tick at time zone 'Asia/Riyadh')::date>=cutoff_on and (tick at time zone 'Asia/Riyadh')::time>=time '17:00' then 0 else 1 end);
 for d in select generate_series(first_day::timestamp,last_day::timestamp,interval '1 day')::date loop
  if extract(dow from d)::integer<>all(workdays) then continue;end if;
  if to_char(d,'MM-DD') in ('02-22','09-23') or exists(select 1 from public.wf_paid_calendar_days h where h.day=d) then continue;end if;
  select exists(select 1 from public.wf_employee_requests q where q.employee_id=p_employee and q.test_run_id is null
    and q.kind='leave' and q.status='approved' and d between (q.starts_at at time zone 'Asia/Riyadh')::date and (q.ends_at at time zone 'Asia/Riyadh')::date) into leave_day;
  if leave_day then continue;end if;
  -- A missing salary version is not a zero-wage working day. Fail closed.
  select c.basic_salary+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(c.allowances) a),0) monthly
   into term from public.wf_compensation_versions c where c.employee_id=p_employee and c.effective_from<=d order by c.effective_from desc,c.revision desc limit 1;
  if not found then raise sqlstate 'PT409' using message='أكملي إعداد راتب الموظفة للفترة أولًا';end if;
  fixed:=term.monthly;day_rate:=fixed/30/8;last_rate:=day_rate;
  with ranges as (
   select greatest(lower(r),d::timestamp at time zone 'Asia/Riyadh') lo,
    least(upper(r),(case when d<cutoff_on then (d+1)::timestamp else d+time '17:00' end) at time zone 'Asia/Riyadh') hi
   from public.wf_attendance_sessions a cross join lateral workforce_private.work_credit_ranges(a,tick) r
   where a.employee_id=p_employee and a.checked_in<((d+1)::timestamp at time zone 'Asia/Riyadh')
    and (a.checked_out>=(d::timestamp at time zone 'Asia/Riyadh') or a.checked_out is null)
   union all
   select greatest(q.starts_at,(d+time '09:00') at time zone 'Asia/Riyadh'),least(q.ends_at,(d+time '17:00') at time zone 'Asia/Riyadh')
   from public.wf_employee_requests q where q.employee_id=p_employee and q.test_run_id is null and q.kind='permission' and q.status='approved'
    and q.starts_at<((d+1)::timestamp at time zone 'Asia/Riyadh') and q.ends_at>(d::timestamp at time zone 'Asia/Riyadh')
  ), merged as(select range_agg(tstzrange(lo,hi,'[)')) rr from ranges where hi>lo)
  select least(daily*60,coalesce(sum(extract(epoch from upper(r)-lower(r))),0)) into seconds from merged cross join lateral unnest(rr) r;
  gap:=greatest(0,daily*60-seconds);required:=required+daily*60;credited:=credited+seconds;missing:=missing+gap;
  adjustment:=adjustment+day_rate*gap/3600;covered_days:=covered_days+1;
  if gap>0 then missing_days:=missing_days||jsonb_build_array(jsonb_build_object('day',d,'required_seconds',daily*60,'credited_seconds',seconds,'missing_seconds',gap,'hourly_rate',round(day_rate,6)::text));end if;
 end loop;
 if last_rate is null then
  select (c.basic_salary+coalesce((select sum((a->>'amount')::numeric) from jsonb_array_elements(c.allowances) a),0))/30/8 into last_rate
   from public.wf_compensation_versions c where c.employee_id=p_employee and c.effective_from<=least((p_month+interval '1 month - 1 day')::date,(tick at time zone 'Asia/Riyadh')::date)
   order by c.effective_from desc,c.revision desc limit 1;
 end if;
 return jsonb_build_object('starts_on',activated,'through',case when last_day>=first_day then last_day else null end,
  'required_seconds',required,'credited_seconds',credited,'missing_seconds',missing,'days',covered_days,
  'hourly_rate',round(last_rate,6)::text,'calculated_amount',round(adjustment,2)::text,'missing_days',missing_days);
end $$;
revoke all on function workforce_private.attendance_payroll(uuid,date) from public,anon,authenticated;
grant execute on function workforce_private.attendance_payroll(uuid,date) to service_role;

create function workforce_private.apply_attendance_payroll() returns trigger
language plpgsql security invoker set search_path='' as $$
declare detail jsonb; manual numeric; applied numeric;
begin
 -- Fully paid snapshots remain historical records.
 if TG_OP='UPDATE' and old.status='paid' then
  new.attendance_amount:=old.attendance_amount;new.attendance_details:=old.attendance_details;return new;
 end if;
 detail:=workforce_private.attendance_payroll(new.employee_id,new.month);
 select coalesce(sum((x->>'amount')::numeric),0) into manual from jsonb_array_elements(new.deductions) x;
 applied:=least((detail->>'calculated_amount')::numeric,greatest(0,new.gross_amount-manual-new.paid_amount));
 new.attendance_amount:=applied;
 new.attendance_details:=detail||jsonb_build_object('applied_amount',applied::text,'unapplied_amount',greatest(0,(detail->>'calculated_amount')::numeric-applied)::text);
 new.deductions_amount:=manual+applied;
 new.total_amount:=new.gross_amount-new.deductions_amount;
 return new;
end $$;
revoke all on function workforce_private.apply_attendance_payroll() from public,anon,authenticated;
grant execute on function workforce_private.apply_attendance_payroll() to service_role;
create trigger wf_apply_attendance_payroll before insert or update on public.wf_monthly_payroll for each row execute function workforce_private.apply_attendance_payroll();

create table public.wf_payroll_attendance_audit (
 id bigint generated always as identity primary key,payroll_id uuid not null references public.wf_monthly_payroll(id),
 previous_amount numeric(15,2) not null,current_amount numeric(15,2) not null,details jsonb not null,created_at timestamptz not null default clock_timestamp()
);
alter table public.wf_payroll_attendance_audit enable row level security;
revoke all on public.wf_payroll_attendance_audit from public,anon,authenticated;
grant select on public.wf_payroll_attendance_audit to authenticated;
grant select,insert on public.wf_payroll_attendance_audit to service_role;
grant usage,select on sequence public.wf_payroll_attendance_audit_id_seq to service_role;
create policy wf_payroll_attendance_audit_read on public.wf_payroll_attendance_audit for select to authenticated
 using(exists(select 1 from public.wf_monthly_payroll p where p.id=payroll_id));
create function workforce_private.audit_attendance_payroll() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (TG_OP='INSERT' and new.attendance_amount<>0) or (TG_OP='UPDATE' and (old.attendance_amount,old.attendance_details) is distinct from (new.attendance_amount,new.attendance_details)) then
  insert into public.wf_payroll_attendance_audit(payroll_id,previous_amount,current_amount,details) values(new.id,case when TG_OP='UPDATE' then old.attendance_amount else 0 end,new.attendance_amount,new.attendance_details);
 end if;return new;
end $$;
revoke all on function workforce_private.audit_attendance_payroll() from public,anon,authenticated;
grant execute on function workforce_private.audit_attendance_payroll() to service_role;
create trigger wf_audit_attendance_payroll after insert or update on public.wf_monthly_payroll for each row execute function workforce_private.audit_attendance_payroll();

create function workforce_private.refresh_attendance_payroll(p_employee uuid,p_month date) returns void language plpgsql security invoker set search_path='' as $$
declare r public.wf_monthly_payroll; detail jsonb;
begin
 select * into r from public.wf_monthly_payroll where employee_id=p_employee and month=p_month for update;
 if not found or r.status='paid' then return;end if;
 detail:=workforce_private.attendance_payroll(p_employee,p_month);
 if (r.attendance_details-'applied_amount'-'unapplied_amount') is distinct from detail then
  update public.wf_monthly_payroll set version=version+1,updated_at=clock_timestamp() where id=r.id;
 end if;
end $$;
revoke all on function workforce_private.refresh_attendance_payroll(uuid,date) from public,anon,authenticated;
grant execute on function workforce_private.refresh_attendance_payroll(uuid,date) to service_role;

create function public.wf_attendance_payroll_snapshot(p_actor uuid,p_employee uuid,p_month date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor_employee uuid; result jsonb; emp_start date; term record; factor numeric;
begin
 actor_employee:=workforce_private.assert_task_actor(p_actor);
 if actor_employee is not null and actor_employee<>p_employee then raise insufficient_privilege;end if;
 if p_month is null or extract(day from p_month)<>1 then raise sqlstate 'PT400' using message='الشهر غير صحيح';end if;
 if not exists(select 1 from public.wf_monthly_payroll where employee_id=p_employee and month=p_month) then
  select start_date into emp_start from public.wf_employees where id=p_employee for update;
  if p_month>=date_trunc('month',emp_start)::date and p_month<=date_trunc('month',workforce_private.work_now() at time zone 'Asia/Riyadh')::date then
   select * into term from public.wf_compensation_versions c where c.employee_id=p_employee
    and c.effective_from<=least((p_month+interval '1 month - 1 day')::date,(workforce_private.work_now() at time zone 'Asia/Riyadh')::date)
    order by c.effective_from desc,c.revision desc limit 1;
   if found then
    factor:=case when emp_start>p_month then least(30,(p_month+interval '1 month - 1 day')::date-emp_start+1)/30.0 else 1 end;
    insert into public.wf_monthly_payroll(employee_id,month,basic_amount,allowances_amount,gross_amount,total_amount,updated_by)
     select p_employee,p_month,round(term.basic_salary*factor,2),round(coalesce(sum((a->>'amount')::numeric),0)*factor,2),
      round(term.basic_salary*factor,2)+round(coalesce(sum((a->>'amount')::numeric),0)*factor,2),round(term.basic_salary*factor,2)+round(coalesce(sum((a->>'amount')::numeric),0)*factor,2),p_actor
     from jsonb_array_elements(term.allowances) a on conflict(employee_id,month) do nothing;
   end if;
  end if;
 end if;
 perform workforce_private.refresh_attendance_payroll(p_employee,p_month);
 select to_jsonb(p) into result from public.wf_monthly_payroll p where employee_id=p_employee and month=p_month;
 return jsonb_build_object('statement',result,'attendance',case when result is not null then result->'attendance_details' else workforce_private.attendance_payroll(p_employee,p_month) end);
end $$;
revoke all on function public.wf_attendance_payroll_snapshot(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.wf_attendance_payroll_snapshot(uuid,uuid,date) to service_role;

create function public.wf_refresh_attendance_payroll() returns void language plpgsql security invoker set search_path='' as $$
declare r record;
begin
 for r in select employee_id,month from public.wf_monthly_payroll where status<>'paid' and month>=date_trunc('month',(select starts_on from workforce_private.payroll_attendance_policy))::date order by employee_id,month loop
  perform workforce_private.refresh_attendance_payroll(r.employee_id,r.month);
 end loop;
end $$;
revoke all on function public.wf_refresh_attendance_payroll() from public,anon,authenticated;
grant execute on function public.wf_refresh_attendance_payroll() to service_role;
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('workforce-attendance-payroll','* * * * *','select public.wf_refresh_attendance_payroll()');
 end if;
end $$;

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

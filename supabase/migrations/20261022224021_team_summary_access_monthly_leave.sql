-- Explicit read-only delegation; task management alone never implies financial access.
alter table public.wf_employees add column can_view_team_summaries boolean not null default false;
create or replace function workforce_private.notify_workforce_changes() returns trigger
language plpgsql security invoker set search_path='' as $$
declare recipient uuid; actor uuid; emp uuid; heading text; category text; route text; key text;
begin
 if TG_TABLE_NAME='wf_employee_documents' then
  emp:=new.employee_id;actor:=new.created_by;category:='document';heading:='تحديث في مستنداتك الوظيفية';route:='/employee/profile/documents';
  if TG_OP='UPDATE' and new.archived_at is not distinct from old.archived_at and new.employee_visible is not distinct from old.employee_visible and new.expires_on is not distinct from old.expires_on and new.title is not distinct from old.title then return new; end if;
  key:='document:'||new.id||':'||md5(to_jsonb(new)::text);
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
  select p.id,'document','تحديث مستندات موظفة','راجعي المستندات في الملف الوظيفي.','/admin/workforce/employees/'||emp,key
  from public.profiles p where p.role='admin' and p.id<>actor and workforce_private.notification_recipient_active(p.id) on conflict(recipient_id,event_key) do nothing;
  if not new.employee_visible then return new; end if;
 elsif TG_TABLE_NAME='wf_compensation_versions' then
  emp:=new.employee_id;actor:=new.created_by;category:='compensation';heading:='تحديث بيانات الراتب والحوافز';route:='/employee/profile/compensation';key:='compensation:'||new.id;
 elsif TG_TABLE_NAME='wf_attendance_settings' then
  emp:=new.employee_id;actor:=new.updated_by;category:='attendance_settings';heading:='تحديث إعدادات دوامك';route:='/employee/attendance/schedule';
  if TG_OP='UPDATE' and new.workdays=old.workdays and new.schedule_mode=old.schedule_mode and new.daily_minutes=old.daily_minutes and new.starts_at=old.starts_at and new.ends_at=old.ends_at then return new; end if;
  key:='attendance-settings:'||emp||':'||md5(to_jsonb(new)::text);
 elsif TG_TABLE_NAME='wf_leave_entitlements' then
  emp:=new.employee_id;actor:=new.updated_by;category:='leave_balance';heading:='تحديث رصيد إجازتك';route:='/employee/attendance/leave-balances';key:='leave-balance:'||emp||':'||new.year||':'||md5(to_jsonb(new)::text);
 elsif TG_TABLE_NAME='wf_attendance_sessions' then
  if new.source='clock' then return new; end if;
  emp:=new.employee_id;actor:=new.updated_by;category:='attendance_correction';heading:='تحديث سجل حضورك';route:='/employee/attendance/overview';key:='attendance:'||new.id||':'||new.version;
 elsif TG_TABLE_NAME='wf_employees' then
  -- Internal summary-access flags alone do not change the employment profile.
  if (to_jsonb(new)-array['can_view_team_summaries','version','updated_at']) is not distinct from (to_jsonb(old)-array['can_view_team_summaries','version','updated_at']) then return new;end if;
  if new.status<>'active' then return new; end if;
  emp:=new.id;actor:=new.updated_by;category:='employment';heading:='تحديث ملفك الوظيفي';route:='/employee/profile/contract';key:='employment:'||new.id||':'||new.version;
 else return new;
 end if;
 select user_id into recipient from public.wf_employees where id=emp and status='active';
 if recipient is not null and recipient is distinct from actor then
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key) values(recipient,category,heading,'راجعي التفاصيل في بوابتك الوظيفية.',route,key) on conflict(recipient_id,event_key) do nothing;
 end if;
 return new;
end $$;

update public.wf_employees set can_view_team_summaries=true where id='a4e79fa0-d078-4a7e-8650-196342a0dec3';

create function workforce_private.can_read_team_summary(p_actor uuid,p_employee uuid) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare own uuid;
begin
 own:=workforce_private.assert_task_actor(p_actor);
 return own is null or own=p_employee or exists(select 1 from public.wf_employees e where e.id=own and e.can_view_team_summaries and e.status='active')
  and exists(select 1 from public.wf_employees e where e.id=p_employee and e.status='active');
end $$;
revoke all on function workforce_private.can_read_team_summary(uuid,uuid) from public,anon,authenticated;
grant execute on function workforce_private.can_read_team_summary(uuid,uuid) to service_role;

-- Calendar-month accrual, posted logically only after the month closes in Riyadh.
-- 21 working days is company policy; the statutory increase after 5 years is retained.
create function workforce_private.leave_accrual(p_employee uuid,p_asof date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare started date; m date; finish date; d date; month_days integer; amount numeric; accrued numeric:=0;
 pending numeric:=0; annual numeric; current_month date:=date_trunc('month',p_asof)::date; detail jsonb:='[]';
 opening numeric; used numeric; current_opening numeric;
begin
 select start_date into started from public.wf_employees where id=p_employee;
 if not found then raise sqlstate 'P0002' using message='الموظفة غير متاحة';end if;
 for m in select generate_series(date_trunc('month',started)::timestamp,current_month::timestamp,interval '1 month')::date loop
  finish:=(m+interval '1 month - 1 day')::date;month_days:=extract(day from finish);amount:=0;
  for d in select generate_series(greatest(m,started)::timestamp,finish::timestamp,interval '1 day')::date loop
   amount:=amount+(case when d>=(started+interval '5 years')::date then 30 else 21 end)/12.0/month_days;
  end loop;
  if m<current_month then accrued:=accrued+amount;
   detail:=detail||jsonb_build_array(jsonb_build_object('month',m,'days',round(amount,6)));
  else pending:=amount;end if;
 end loop;
 select coalesce(sum(days),0) into opening from public.wf_leave_entitlements where employee_id=p_employee and year<=extract(year from p_asof);
 select coalesce(sum(days),0) into used from public.wf_leave_movements where employee_id=p_employee;
 select coalesce(sum(days),0) into current_opening from public.wf_leave_entitlements where employee_id=p_employee and year=extract(year from p_asof);
 annual:=case when p_asof>=(started+interval '5 years')::date then 30 else 21 end;
 return jsonb_build_object('year',extract(year from p_asof),'annual_days',annual,'monthly_days',annual/12,'accrued',round(accrued,2),
  'opening',opening,'current_year_opening',current_opening,'granted',round(accrued+opening,2),'used',used,'available',round(accrued+opening-used,2),
  'pending_days',round(pending,2),'pending_until',(current_month+interval '1 month - 1 day')::date,'months',detail);
end $$;
revoke all on function workforce_private.leave_accrual(uuid,date) from public,anon,authenticated;
grant execute on function workforce_private.leave_accrual(uuid,date) to service_role;

create function public.wf_leave_balance(p_actor uuid,p_employee uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not workforce_private.can_read_team_summary(p_actor,p_employee) then raise insufficient_privilege;end if;
 return workforce_private.leave_accrual(p_employee,(workforce_private.work_now() at time zone 'Asia/Riyadh')::date);
end $$;
revoke all on function public.wf_leave_balance(uuid,uuid) from public,anon,authenticated;
grant execute on function public.wf_leave_balance(uuid,uuid) to service_role;

create or replace function public.wf_attendance_payroll_snapshot(p_actor uuid,p_employee uuid,p_month date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; emp_start date; term record; factor numeric;
begin

 if not workforce_private.can_read_team_summary(p_actor,p_employee) then raise insufficient_privilege;end if;
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


create or replace function public.wf_decide_employee_request(p_id uuid,p_actor uuid,p_version integer,p_decision text,p_reason text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.wf_employee_requests; admin_actor boolean; configured_days integer[]; slice record; remaining numeric; session_id uuid;
begin
 select * into r from public.wf_employee_requests where id=p_id for update;
 if not found then raise exception 'الطلب غير متاح' using errcode='P0002';end if;
 select exists(select 1 from public.profiles p where p.id=p_actor and p.role='admin' and workforce_private.task_actor_unbanned(p_actor)) into admin_actor;
 if p_decision='cancelled' then
  if not exists(select 1 from public.wf_employees e join public.profiles p on p.id=e.user_id where e.id=r.employee_id and e.user_id=p_actor and e.status='active' and p.role='employee') then raise insufficient_privilege;end if;
 elsif not admin_actor or p_decision not in ('approved','rejected') then raise insufficient_privilege;end if;
 if p_version is null or r.version<>p_version or r.status<>'pending' then raise exception 'تمت معالجة الطلب؛ حدّث القائمة' using errcode='PT409';end if;
 if p_decision<>'cancelled' and length(btrim(coalesce(p_reason,''))) not between 3 and 2000 then raise exception 'أدخل سبب القرار' using errcode='PT400';end if;
 if p_decision='approved' then
  if not exists(select 1 from public.wf_employees where id=r.employee_id and status='active') then raise exception 'الموظفة غير نشطة' using errcode='PT400';end if;
  perform pg_advisory_xact_lock(hashtextextended(r.employee_id::text,19));
  if r.kind='attendance-correction' then
   if r.starts_at>now() or r.ends_at>now() or r.ends_at>r.starts_at+interval '24 hours' then raise exception 'تصحيح الحضور لفترة سابقة حتى 24 ساعة' using errcode='PT400';end if;
   if r.attendance_session_id is not null and not exists(select 1 from public.wf_attendance_sessions where id=r.attendance_session_id and employee_id=r.employee_id) then raise exception 'سجل الحضور غير متاح' using errcode='PT400';end if;
   if exists(select 1 from public.wf_attendance_sessions where employee_id=r.employee_id and id is distinct from r.attendance_session_id and tstzrange(checked_in,coalesce(checked_out,now()),'[)') && tstzrange(r.starts_at,r.ends_at,'[)')) then raise exception 'الفترة تتداخل مع سجل حضور آخر' using errcode='PT409';end if;
   session_id:=coalesce(r.attendance_session_id,gen_random_uuid());
   insert into public.wf_attendance_sessions(id,employee_id,business_date,checked_in,checked_out,source,note,updated_by)
   values(session_id,r.employee_id,(r.starts_at at time zone 'Asia/Riyadh')::date,r.starts_at,r.ends_at,'correction',p_reason,p_actor)
   on conflict(id) do update set business_date=excluded.business_date,checked_in=excluded.checked_in,checked_out=excluded.checked_out,source='correction',note=excluded.note,updated_by=p_actor,updated_at=now(),version=wf_attendance_sessions.version+1;
   insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields) values('wf_attendance_sessions',session_id::text,'correction',p_actor,array['checked_in','checked_out']);
  elsif r.kind='leave' then
   if exists(select 1 from public.wf_employee_requests where employee_id=r.employee_id and id<>r.id and kind='leave' and status='approved' and daterange((starts_at at time zone 'Asia/Riyadh')::date,(ends_at at time zone 'Asia/Riyadh')::date,'[]') && daterange((r.starts_at at time zone 'Asia/Riyadh')::date,(r.ends_at at time zone 'Asia/Riyadh')::date,'[]')) then raise exception 'توجد إجازة معتمدة في الفترة' using errcode='PT409';end if;
   if r.leave_type='paid' then
    select workdays into configured_days from public.wf_attendance_settings where employee_id=r.employee_id;
    configured_days:=coalesce(configured_days,array[0,1,2,3,4,6]);
    for slice in select extract(year from day)::integer as leave_year,count(*) as leave_days from generate_series((r.starts_at at time zone 'Asia/Riyadh')::date::timestamp,(r.ends_at at time zone 'Asia/Riyadh')::date::timestamp,interval '1 day') day where extract(dow from day)::integer=any(configured_days) and to_char(day,'MM-DD') not in ('02-22','09-23') and not exists(select 1 from public.wf_paid_calendar_days h where h.day=day::date) group by 1 loop
     remaining:=(workforce_private.leave_accrual(r.employee_id,(workforce_private.work_now() at time zone 'Asia/Riyadh')::date)->>'available')::numeric;
     if remaining<slice.leave_days then raise exception 'رصيد الإجازة غير كافٍ؛ حدّثي الاستحقاق قبل الاعتماد' using errcode='PT400';end if;
     insert into public.wf_leave_movements(request_id,employee_id,year,days) values(r.id,r.employee_id,slice.leave_year,slice.leave_days);
    end loop;
   end if;
  end if;
 end if;
 update public.wf_employee_requests set status=p_decision,decision_reason=left(p_reason,2000),decided_by=p_actor,decided_at=now(),version=version+1 where id=p_id;
 insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields) values('wf_employee_requests',p_id::text,p_decision,p_actor,array['status','decision_reason']);
 return p_id;
end $$;


create or replace function public.wf_save_attendance_settings(p_actor uuid,p_employee uuid,p_workdays integer[],p_start time,p_end time,p_year integer,p_days numeric,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p where p.id=p_actor and p.role='admin' and workforce_private.task_actor_unbanned(p_actor)) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtextextended(p_employee::text,19));
 if (workforce_private.leave_accrual(p_employee,(workforce_private.work_now() at time zone 'Asia/Riyadh')::date)->>'available')::numeric-coalesce((select days from public.wf_leave_entitlements where employee_id=p_employee and year=p_year),0)+p_days<0 then raise exception 'الاستحقاق أقل من الإجازات المعتمدة' using errcode='PT400';end if;
 insert into public.wf_attendance_settings(employee_id,workdays,starts_at,ends_at,updated_by) values(p_employee,p_workdays,p_start,p_end,p_actor)
 on conflict(employee_id) do update set workdays=excluded.workdays,starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_by=p_actor,updated_at=now();
 insert into public.wf_leave_entitlements(employee_id,year,days,reason,updated_by) values(p_employee,p_year,p_days,p_reason,p_actor)
 on conflict(employee_id,year) do update set days=p_days,reason=p_reason,updated_by=p_actor,updated_at=now();
 insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields) values('wf_attendance_settings',p_employee::text,'settings',p_actor,array['workdays','starts_at','ends_at','leave_entitlement']);
end $$;
revoke all on function public.wf_save_attendance_settings(uuid,uuid,integer[],time,time,integer,numeric,text) from public,anon,authenticated;
grant execute on function public.wf_save_attendance_settings(uuid,uuid,integer[],time,time,integer,numeric,text) to service_role;

create or replace function workforce_private.attendance_payroll(p_employee uuid,p_month date)
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
    and q.kind='leave' and q.leave_type='paid' and q.status='approved' and d between (q.starts_at at time zone 'Asia/Riyadh')::date and (q.ends_at at time zone 'Asia/Riyadh')::date) into leave_day;
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


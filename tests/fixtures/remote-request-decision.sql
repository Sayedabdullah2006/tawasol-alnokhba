CREATE OR REPLACE FUNCTION public.wf_decide_employee_request(p_id uuid, p_actor uuid, p_version integer, p_decision text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
   r.attendance_session_id:=workforce_private.attendance_correction_target(r.employee_id,r.attendance_session_id,r.starts_at,r.ends_at);
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
 update public.wf_employee_requests set attendance_session_id=r.attendance_session_id,status=p_decision,decision_reason=left(p_reason,2000),decided_by=p_actor,decided_at=now(),version=version+1 where id=p_id;
 insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields) values('wf_employee_requests',p_id::text,p_decision,p_actor,array['status','decision_reason']);
 return p_id;
end $function$


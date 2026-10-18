alter table public.wf_attendance_settings
 add column schedule_mode text not null default 'fixed' check(schedule_mode in ('fixed','flexible')),
 add column daily_minutes integer not null default 480 check(daily_minutes between 60 and 960);

-- Keep the existing eight-argument command for older app instances. Both writes
-- execute within this transaction and reuse its role check and employee lock.
create function public.wf_save_attendance_settings(
 p_actor uuid,p_employee uuid,p_workdays integer[],p_start time,p_end time,
 p_year integer,p_days numeric,p_reason text,p_mode text,p_minutes integer
) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_mode is null or p_mode not in ('fixed','flexible') or p_minutes is null or p_minutes not between 60 and 960 then
  raise exception 'حدد نوع الدوام وساعات العمل اليومية' using errcode='PT400';
 end if;
 perform public.wf_save_attendance_settings(p_actor,p_employee,p_workdays,p_start,p_end,p_year,p_days,p_reason);
 update public.wf_attendance_settings set schedule_mode=p_mode,daily_minutes=p_minutes where employee_id=p_employee;
 insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields)
 values('wf_attendance_settings',p_employee::text,'schedule',p_actor,array['schedule_mode','daily_minutes']);
end $$;
revoke all on function public.wf_save_attendance_settings(uuid,uuid,integer[],time,time,integer,numeric,text,text,integer) from public,anon,authenticated;
grant execute on function public.wf_save_attendance_settings(uuid,uuid,integer[],time,time,integer,numeric,text,text,integer) to service_role;

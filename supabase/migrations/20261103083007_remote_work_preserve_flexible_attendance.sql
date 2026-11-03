-- A remote agreement must not override an existing flexible-day exception.
-- Signed agreement snapshots and the required daily minutes stay unchanged.
create or replace function workforce_private.employee_work_start(p_employee uuid,p_day date)
returns time language sql stable security definer set search_path='' as $$
 select case when workforce_private.employee_work_end_before_remote(p_employee,p_day)=time '24:00'
 then workforce_private.employee_work_start_before_remote(p_employee,p_day)
 else coalesce((workforce_private.remote_day(p_employee,p_day)->>'starts_time')::time,workforce_private.employee_work_start_before_remote(p_employee,p_day)) end
$$;
create or replace function workforce_private.employee_work_end(p_employee uuid,p_day date)
returns time language sql stable security definer set search_path='' as $$
 select case when workforce_private.employee_work_end_before_remote(p_employee,p_day)=time '24:00'
 then time '24:00'
 else coalesce((workforce_private.remote_day(p_employee,p_day)->>'ends_time')::time,workforce_private.employee_work_end_before_remote(p_employee,p_day)) end
$$;
do $patch$
declare f oid;body text;previous text;
begin
 f:='public.wf_work_snapshot(uuid,uuid)'::regprocedure;
 select prosrc into body from pg_proc where oid=f;previous:=body;
 body:=replace(body,'''flexibleDay'',false,''remote'',true',
 '''flexibleDay'',workforce_private.employee_work_end(employee,day)=time ''24:00'',''remote'',true');
 body:=replace(body,'''startsAt'',v->>''starts_time'',''endsAt'',v->>''ends_time''',
 '''startsAt'',workforce_private.employee_work_start(employee,day)::text,''endsAt'',workforce_private.employee_work_end(employee,day)::text');
 if body=previous then raise exception 'Missing remote-work snapshot policy seam';end if;
 execute replace(pg_get_functiondef(f),previous,body);
end $patch$;
revoke all on function workforce_private.employee_work_start(uuid,date),workforce_private.employee_work_end(uuid,date),public.wf_work_snapshot(uuid,uuid) from public,anon,authenticated;
grant execute on function workforce_private.employee_work_start(uuid,date),workforce_private.employee_work_end(uuid,date),public.wf_work_snapshot(uuid,uuid) to service_role;

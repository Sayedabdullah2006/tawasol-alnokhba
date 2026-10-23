-- Employee work actions need a live, connected, non-break attendance session.
-- Identity checks and existing task/financial permissions are retained.
alter table public.wf_attendance_sessions add column overtime_request_id uuid references public.wf_employee_requests(id);
create index wf_attendance_overtime_request on public.wf_attendance_sessions(overtime_request_id) where overtime_request_id is not null;

create function public.wf_work_action_access(p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare employee uuid; s public.wf_attendance_sessions; tick timestamptz:=workforce_private.work_now(); expired jsonb;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 if employee is null then return jsonb_build_object('allowed',true,'state','admin');end if;
 select * into s from public.wf_attendance_sessions where employee_id=employee and checked_out is null for update;
 if s.id is null then return jsonb_build_object('allowed',false,'state','off','reason','سجلي الحضور لبدء العمل');end if;
 expired:=workforce_private.work_expiry(s,tick);
 if expired is not null then
  perform workforce_private.close_work_session(s.id,(expired->>'at')::timestamptz,expired->>'reason');
  return jsonb_build_object('allowed',false,'state','off','reason','انتهت جلسة الدوام؛ سجلي الحضور مجددًا');
 end if;
 if s.policy_version<>1 or s.business_date<>(tick at time zone 'Asia/Riyadh')::date or s.cutoff_at is null or tick>=s.cutoff_at then
  return jsonb_build_object('allowed',false,'state','off','reason','أغلقي فترة الحضور السابقة وسجلي الحضور مجددًا');end if;
 if s.overtime_request_id is not null and not exists(select 1 from public.wf_employee_requests r where r.id=s.overtime_request_id and r.employee_id=employee and r.kind='overtime' and r.status='approved' and r.test_run_id is null and tick>=r.starts_at and tick<r.ends_at) then
  return jsonb_build_object('allowed',false,'state','off','reason','فترة خارج الدوام غير معتمدة');end if;
 if s.break_started_at is not null then return jsonb_build_object('allowed',false,'state','break','reason','استأنفي العمل لإنهاء الاستراحة');end if;
 if tick>=s.next_confirmation_at then return jsonb_build_object('allowed',false,'state','confirmation','reason','أكدي استمرار العمل أولًا');end if;
 return jsonb_build_object('allowed',true,'state','working','sessionId',s.id,'deviceHash',s.device_hash);
end $$;
revoke all on function public.wf_work_action_access(uuid) from public,anon,authenticated;
grant execute on function public.wf_work_action_access(uuid) to service_role;

create function workforce_private.assert_work_action(p_actor uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare access jsonb;
begin
 access:=public.wf_work_action_access(p_actor);
 if not coalesce((access->>'allowed')::boolean,false) then raise sqlstate 'PT409' using message=access->>'reason';end if;
end $$;
revoke all on function workforce_private.assert_work_action(uuid) from public,anon,authenticated;
grant execute on function workforce_private.assert_work_action(uuid) to service_role;

-- Backstop the operational RPCs as well as the HTTP guard. Read-only snapshots,
-- personal requests, check-in/out, heartbeat, resume and password are not gated.
do $$
declare f record; definition text; body text;
begin
 for f in select oid,proname,prosrc from pg_proc where pronamespace='public'::regnamespace and proname=any(array[
 'wf_task_command','wf_evaluated_task_command','wf_checklist_command','wf_comments_command','wf_columns_command',
 'wf_members_command','wf_board_command','wf_time_command','wf_attachment_command','wf_performance_command',
 'wf_knowledge_command','wf_knowledge_file_create','wf_knowledge_file_create_notified','wf_knowledge_file_notify',
 'wf_business_card_command','wf_hr_command']) loop
  body:=regexp_replace(f.prosrc,'\mbegin\M',E'begin\n perform workforce_private.assert_work_action(p_actor);','i');
  if body=f.prosrc then raise exception 'Missing command entry: %',f.proname;end if;
  definition:=replace(pg_get_functiondef(f.oid),f.prosrc,body);execute definition;
 end loop;
end $$;

-- Approved overtime can open its own bounded attendance session after 17:00.
-- It is recorded for work access/task timing, not paid again as ordinary hours.
do $$
declare f oid:='public.wf_work_command(uuid,text,uuid,uuid,text,uuid,text)'::regprocedure; old_body text; body text;
begin
 select prosrc into old_body from pg_proc where oid=f;body:=old_body;
 body:=replace(body,' day date;',' day date; overtime public.wf_employee_requests;');
 body:=replace(body,$s$ day:=(tick at time zone 'Asia/Riyadh')::date;$s$,$s$ day:=(tick at time zone 'Asia/Riyadh')::date;
 select r.* into overtime from public.wf_employee_requests r where r.employee_id=employee and r.kind='overtime' and r.status='approved' and r.test_run_id is null and tick>=r.starts_at and tick<r.ends_at order by r.starts_at limit 1;$s$);
 body:=replace(body,$s$if (tick at time zone 'Asia/Riyadh')::time>=time '17:00' then$s$,$s$if (tick at time zone 'Asia/Riyadh')::time>=time '17:00' and overtime.id is null then$s$);
 body:=replace(body,'next_confirmation_at,device_hash)','next_confirmation_at,device_hash,overtime_request_id)');
 body:=replace(body,$s$elsif p_command in ('task','activity','break','resume') then$s$,$s$elsif p_command in ('task','activity','break','resume') then
   if p_command in ('task','activity') and s.break_started_at is not null then raise sqlstate 'PT409' using message='استأنفي العمل لإنهاء الاستراحة';end if;$s$);
 body:=replace(body,$s$(day+time '17:00') at time zone 'Asia/Riyadh',tick,workforce_private.next_daily_work_confirmation(day,tick),p_device)$s$,$s$coalesce(overtime.ends_at,(day+time '17:00') at time zone 'Asia/Riyadh'),tick,case when overtime.id is not null then overtime.ends_at else workforce_private.next_daily_work_confirmation(day,tick) end,p_device,overtime.id)$s$);
 if body=old_body or position('overtime.id) returning' in body)=0 then raise exception 'Work command changed; review overtime patch';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
end $$;

do $$
declare f oid:='workforce_private.work_credit_ranges(public.wf_attendance_sessions,timestamptz)'::regprocedure; body text;
begin
 select prosrc into body from pg_proc where oid=f;
 execute replace(pg_get_functiondef(f),body,regexp_replace(body,'\mbegin\M',E'begin\n if a.overtime_request_id is not null then return;end if;','i'));
end $$;

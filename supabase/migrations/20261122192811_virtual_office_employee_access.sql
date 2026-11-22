-- Availability is a preference for ONE attendance session. It never clocks anyone in.
create table public.vo_staff_availability (
 employee_id uuid primary key references public.wf_employees(id) on delete cascade,
 session_id uuid not null references public.wf_attendance_sessions(id) on delete cascade,
 state text not null check (state in ('available','busy')),
 updated_at timestamptz not null default clock_timestamp()
);
create index vo_staff_availability_session on public.vo_staff_availability(session_id);
alter table public.vo_staff_availability enable row level security;
alter table public.vo_staff_availability force row level security;
revoke all on public.vo_staff_availability from public,anon,authenticated;
grant all on public.vo_staff_availability to service_role;
create policy vo_availability_service on public.vo_staff_availability for all to service_role using (true) with check (true);

-- Service-only, security INVOKER. The API passes the verified actor, never a body ID.
-- Only directory fields and a coarse work status leave this boundary. No HR,
-- contact details, attendance device hashes, meeting titles or private task titles.
create function public.vo_staff_directory(p_actor uuid,p_workspace text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare tick timestamptz:=workforce_private.work_now(); result jsonb;
begin
 perform workforce_private.assert_task_actor(p_actor);
 with roster as (
  select e.id,e.user_id,e.full_name,e.job_title,d.name department,
   coalesce(v.preset,'unset') preset,s.id session_id,s.break_started_at,s.meeting_id,s.meeting_until,s.next_confirmation_at,
   a.state manual_state,
   (s.id is not null and s.policy_version=1 and s.checked_in<=tick
    and s.business_date=(tick at time zone 'Asia/Riyadh')::date and s.cutoff_at>tick
    and workforce_private.work_expiry(s,tick) is null
    and (s.overtime_request_id is null or exists(select 1 from public.wf_employee_requests r where r.id=s.overtime_request_id and r.employee_id=e.id and r.kind='overtime' and r.status='approved' and r.test_run_id is null and tick>=r.starts_at and tick<r.ends_at))) online,
   exists(select 1 from public.wf_work_segments seg where seg.session_id=s.id and seg.ends_at is null and seg.starts_at<=tick and seg.kind in ('task','activity')) working
  from public.wf_employees e
  left join public.wf_departments d on d.id=e.department_id
  left join public.vo_staff_avatars v on v.employee_id=e.id and v.workspace_id=p_workspace
  left join lateral (select x.* from public.wf_attendance_sessions x where x.employee_id=e.id and x.checked_out is null order by x.checked_in desc limit 1) s on true
  left join public.vo_staff_availability a on a.employee_id=e.id and a.session_id=s.id
  where e.status='active'
 ), states as (
  select *,case when not online then 'offline' when break_started_at is not null then 'break'
   when meeting_id is not null and meeting_until>tick then 'busy'
   when next_confirmation_at<=tick or working or manual_state='busy' then 'busy' else 'available' end state,
   case when not online then 'attendance' when break_started_at is not null then 'break'
   when meeting_id is not null and meeting_until>tick then 'meeting'
   when next_confirmation_at<=tick then 'confirmation' when working then 'task'
   when manual_state='busy' then 'manual' else 'attendance' end detail
  from roster
 ) select coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'name',full_name,'jobTitle',coalesce(job_title,''),'registeredDepartment',coalesce(department,''),'appearance',preset,
  'presence',jsonb_build_object('online',online,'state',state,'detail',detail,'observedAt',tick),
  'ownSessionId',case when user_id=p_actor and online then session_id else null end,
  'manualState',case when user_id=p_actor then coalesce(manual_state,'available') else null end
 ) order by full_name,id),'[]'::jsonb) into result from states;
 return jsonb_build_object('now',tick,'staff',result);
end $$;

create function public.vo_set_availability(p_actor uuid,p_session uuid,p_state text) returns void
language plpgsql security invoker set search_path='' as $$
declare employee uuid; access jsonb;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 if employee is null then raise insufficient_privilege;end if;
 if p_state is null or p_state not in ('available','busy') then raise sqlstate 'PT400' using message='اختر متاح أو مشغول';end if;
 access:=public.wf_work_action_access(p_actor);
 if not coalesce((access->>'allowed')::boolean,false) or (access->>'sessionId')::uuid is distinct from p_session then
  raise sqlstate 'PT409' using message='تغيرت جلسة الدوام؛ حدّث المكتب وتحقق من الحضور';
 end if;
 insert into public.vo_staff_availability(employee_id,session_id,state) values(employee,p_session,p_state)
 on conflict(employee_id) do update set session_id=excluded.session_id,state=excluded.state,updated_at=clock_timestamp();
end $$;
revoke all on function public.vo_staff_directory(uuid,text),public.vo_set_availability(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.vo_staff_directory(uuid,text),public.vo_set_availability(uuid,uuid,text) to service_role;

-- Bounded recurring appointments are separate occurrences, with independent
-- Google identity, task linkage, reminders and attendance protection.
alter table public.wf_meetings add column series_id uuid, add column series_frequency text check(series_frequency in ('daily','weekly','monthly'));
create index wf_meetings_series on public.wf_meetings(series_id,starts_at) where series_id is not null;
create table workforce_private.meeting_series_requests(id uuid primary key,created_by uuid not null references public.profiles(id),payload jsonb not null);
alter table workforce_private.meeting_series_requests enable row level security;
revoke all on workforce_private.meeting_series_requests from public,anon,authenticated;
grant select,insert on workforce_private.meeting_series_requests to service_role;

create function public.wf_meeting_series(p_actor uuid,p_id uuid,p_payload jsonb,p_frequency text,p_count integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare request jsonb; existing workforce_private.meeting_series_requests; first_start timestamp; duration interval; occurrence timestamp; mid uuid; result jsonb; i integer;
begin
 perform workforce_private.assert_task_actor(p_actor);
 if not workforce_private.meeting_manager(p_actor) then raise insufficient_privilege;end if;
 perform workforce_private.assert_work_action(p_actor);
 if p_frequency is null or p_frequency not in ('daily','weekly','monthly') or p_count is null or p_count<2 or p_count>24 then raise sqlstate 'PT400' using message='اختاري التكرار وعدد المواعيد من 2 إلى 24';end if;
 request:=jsonb_build_object('data',p_payload,'frequency',p_frequency,'count',p_count);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,71));
 select * into existing from workforce_private.meeting_series_requests where id=p_id;
 if existing.id is not null then
  if existing.created_by<>p_actor then raise insufficient_privilege;end if;
  if existing.payload<>request then raise sqlstate 'PT409' using message='السلسلة محفوظة؛ حدّثي قائمة الاجتماعات';end if;
 else
  if exists(select 1 from public.wf_meetings where id=p_id) then raise sqlstate 'PT409' using message='معرف الاجتماع مستخدم';end if;
  first_start:=(p_payload->>'starts_at')::timestamptz at time zone 'Asia/Riyadh';
  duration:=(p_payload->>'ends_at')::timestamptz-(p_payload->>'starts_at')::timestamptz;
  insert into workforce_private.meeting_series_requests values(p_id,p_actor,request);
  for i in 0..p_count-1 loop
   occurrence:=first_start+case p_frequency when 'monthly' then make_interval(months=>i) when 'weekly' then make_interval(days=>7*i) else make_interval(days=>i) end;
   mid:=case when i=0 then p_id else gen_random_uuid() end;
   result:=public.wf_meeting_command(p_actor,mid,0,'save',p_payload||jsonb_build_object('starts_at',occurrence at time zone 'Asia/Riyadh','ends_at',(occurrence at time zone 'Asia/Riyadh')+duration));
   update public.wf_meetings set series_id=p_id,series_frequency=p_frequency where id=mid;
  end loop;
 end if;
 return (select jsonb_agg(to_jsonb(m) order by starts_at,id) from public.wf_meetings m where series_id=p_id);
end $$;
revoke all on function public.wf_meeting_series(uuid,uuid,jsonb,text,integer) from public,anon,authenticated;
grant execute on function public.wf_meeting_series(uuid,uuid,jsonb,text,integer) to service_role;

-- Admin participation is tracked too. Joining is recorded by this website;
-- it is not a Google Meet presence attestation and never changes payroll.
do $$
declare f oid:='public.wf_meeting_presence(uuid,uuid,text,text)'::regprocedure; original text; patched text;
begin
 select prosrc into original from pg_proc where oid=f;
 patched:=replace(original,$s$if employee is null then return jsonb_build_object('url',m.meet_url,'protected_until',null);end if;$s$,$s$if employee is null then
  if tick<m.starts_at or tick>=m.ends_at or p_command not in ('join','leave') then raise sqlstate 'PT409' using message='الانضمام متاح خلال موعد الاجتماع';end if;
  if p_command='join' then
   insert into public.wf_meeting_attendance(meeting_id,user_id,joined_at) values(m.id,p_actor,tick)
   on conflict(meeting_id,user_id) do nothing;
  else update public.wf_meeting_attendance set left_at=tick where meeting_id=m.id and user_id=p_actor;end if;
  return jsonb_build_object('url',m.meet_url,'protected_until',null);
 end if;$s$);
 if patched=original then raise exception 'Review meeting presence function before applying';end if;
 patched:=replace(patched,'joined_at=excluded.joined_at,left_at=null','joined_at=least(public.wf_meeting_attendance.joined_at,excluded.joined_at),left_at=null');
 execute replace(pg_get_functiondef(f),original,patched);
end $$;

-- Keep a direct entry into the scheduled appointment in inbox and reminder email.
do $$
declare f oid; original text; patched text;
begin
 foreach f in array array['public.wf_meeting_command(uuid,uuid,integer,text,jsonb)'::regprocedure::oid,'public.wf_generate_meeting_reminders(timestamptz)'::regprocedure::oid] loop
  select prosrc into original from pg_proc where oid=f;
  patched:=replace(original,$s$'/admin/workforce/meetings' else '/employee/meetings' end$s$,$s$'/admin/workforce/meetings?meeting='||m.id else '/employee/meetings?meeting='||m.id end$s$);
  if patched=original then raise exception 'Review meeting notification link before applying';end if;
  execute replace(pg_get_functiondef(f),original,patched);
 end loop;
end $$;

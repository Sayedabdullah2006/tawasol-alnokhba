create table workforce_private.meeting_managers(user_id uuid primary key references public.profiles(id));
insert into workforce_private.meeting_managers select user_id from public.wf_employees where status='active' and can_manage_tasks;
create table workforce_private.google_meeting_connection(
 id boolean primary key default true check(id), client_id text, client_secret_cipher text,
 refresh_token_cipher text, expected_email text not null default 'elitecnnct@gmail.com',
 organizer_email text, google_subject text, connected_at timestamptz, updated_at timestamptz not null default now()
);
insert into workforce_private.google_meeting_connection(id) values(true);
alter table workforce_private.meeting_managers enable row level security;
alter table workforce_private.google_meeting_connection enable row level security;
revoke all on workforce_private.meeting_managers,workforce_private.google_meeting_connection from public,anon,authenticated;
grant select,insert,update,delete on workforce_private.meeting_managers,workforce_private.google_meeting_connection to service_role;

create table public.wf_meetings(
 id uuid primary key, title text not null check(length(title) between 3 and 200), description text not null default '' check(length(description)<=10000),
 starts_at timestamptz not null, ends_at timestamptz not null, task_id uuid references public.wf_tasks(id),
 participant_ids uuid[] not null, external_attendees text[] not null default '{}', reminder_minutes integer not null default 15 check(reminder_minutes in (5,15,30,60)),
 created_by uuid not null references public.profiles(id), status text not null default 'draft' check(status in ('draft','scheduled','cancelled')),
 meet_url text, google_event_id text, google_etag text, proposed_data jsonb,
 sync_state text not null default 'idle' check(sync_state in ('idle','syncing','error')), sync_error text,
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '8 hours'),
 check(cardinality(participant_ids) between 1 and 50),check(cardinality(external_attendees)<=50),
 check(meet_url is null or meet_url ~ '^https://meet[.]google[.]com/[a-z]{3}-[a-z]{4}-[a-z]{3}$')
);
create index wf_meetings_time on public.wf_meetings(starts_at,id) where status='scheduled';
create index wf_meetings_participants on public.wf_meetings using gin(participant_ids);
create index wf_meetings_task on public.wf_meetings(task_id) where task_id is not null;
create table workforce_private.meeting_sync_leases(meeting_id uuid primary key references public.wf_meetings(id),token uuid not null,version integer not null,action text not null,expires_at timestamptz not null);
alter table workforce_private.meeting_sync_leases enable row level security;
revoke all on workforce_private.meeting_sync_leases from public,anon,authenticated;
grant select,insert,update,delete on workforce_private.meeting_sync_leases to service_role;
create table public.wf_meeting_attendance(
 meeting_id uuid not null references public.wf_meetings(id),user_id uuid not null references public.profiles(id),
 session_id uuid references public.wf_attendance_sessions(id),joined_at timestamptz not null, left_at timestamptz,
 primary key(meeting_id,user_id)
);
create index wf_meeting_attendance_session on public.wf_meeting_attendance(session_id) where left_at is null;
create table public.wf_meeting_events(id uuid primary key default gen_random_uuid(),meeting_id uuid not null references public.wf_meetings(id),actor_id uuid references public.profiles(id),action text not null,created_at timestamptz not null default now());
create index wf_meeting_events_parent on public.wf_meeting_events(meeting_id,created_at);
alter table public.wf_attendance_sessions add column meeting_id uuid references public.wf_meetings(id),add column meeting_until timestamptz;

create function workforce_private.meeting_manager(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=p_user and role='admin') or exists(
 select 1 from workforce_private.meeting_managers m join public.wf_employees e on e.user_id=m.user_id where m.user_id=p_user and e.status='active');
$$;
create function workforce_private.meeting_readable(p_meeting uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=p_user and role='admin') or exists(
 select 1 from public.wf_meetings m join public.wf_employees e on e.user_id=p_user and e.status='active'
 where m.id=p_meeting and (m.created_by=p_user or p_user=any(m.participant_ids)));
$$;
revoke all on function workforce_private.meeting_manager(uuid),workforce_private.meeting_readable(uuid,uuid) from public,anon;
grant execute on function workforce_private.meeting_manager(uuid),workforce_private.meeting_readable(uuid,uuid) to authenticated,service_role;
alter table public.wf_meetings enable row level security;
alter table public.wf_meeting_attendance enable row level security;
alter table public.wf_meeting_events enable row level security;
revoke all on public.wf_meetings,public.wf_meeting_attendance,public.wf_meeting_events from public,anon,authenticated;
grant select on public.wf_meetings,public.wf_meeting_attendance,public.wf_meeting_events to authenticated;
grant all on public.wf_meetings,public.wf_meeting_attendance,public.wf_meeting_events to service_role;
create policy wf_meetings_read on public.wf_meetings for select to authenticated using(workforce_private.meeting_readable(id,(select auth.uid())));
create policy wf_meeting_attendance_read on public.wf_meeting_attendance for select to authenticated using(workforce_private.meeting_readable(meeting_id,(select auth.uid())));
create policy wf_meeting_events_read on public.wf_meeting_events for select to authenticated using(workforce_private.meeting_readable(meeting_id,(select auth.uid())));

create function public.wf_meeting_directory(p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform workforce_private.assert_task_actor(p_actor);
 return jsonb_build_object('can_manage',workforce_private.meeting_manager(p_actor),'people',(
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'full_name',full_name) order by full_name),'[]') from (
 select e.user_id id,e.full_name from public.wf_employees e where e.status='active'
 union select p.id,coalesce(p.full_name,'مدير الشركة') from public.profiles p where p.role='admin') q));
end $$;
revoke all on function public.wf_meeting_directory(uuid) from public,anon,authenticated;
grant execute on function public.wf_meeting_directory(uuid) to service_role;

create function public.wf_meeting_google(p_actor uuid,p_command text,p_payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare employee uuid; c workforce_private.google_meeting_connection;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 if not workforce_private.meeting_manager(p_actor) then raise insufficient_privilege;end if;
 if p_command<>'read' and employee is not null then raise insufficient_privilege;end if;
 if p_command='configure' then
  if coalesce(p_payload->>'client_id','') !~ '^[A-Za-z0-9._-]+[.]apps[.]googleusercontent[.]com$' or length(coalesce(p_payload->>'client_secret_cipher',''))<30 then raise sqlstate 'PT400' using message='بيانات ربط Google غير صحيحة';end if;
  update workforce_private.google_meeting_connection set client_id=p_payload->>'client_id',client_secret_cipher=p_payload->>'client_secret_cipher',refresh_token_cipher=null,organizer_email=null,google_subject=null,connected_at=null,updated_at=now() where id;
 elsif p_command='connect' then
  select * into c from workforce_private.google_meeting_connection where id for update;
  if lower(p_payload->>'email') is distinct from lower(c.expected_email) or length(coalesce(p_payload->>'refresh_token_cipher',''))<30 or coalesce(p_payload->>'subject','')='' then raise sqlstate 'PT400' using message='اختاري حساب Google المنظّم المعتمد';end if;
  update workforce_private.google_meeting_connection set refresh_token_cipher=p_payload->>'refresh_token_cipher',organizer_email=p_payload->>'email',google_subject=p_payload->>'subject',connected_at=now(),updated_at=now() where id;
 elsif p_command='disconnect' then
  update workforce_private.google_meeting_connection set refresh_token_cipher=null,organizer_email=null,google_subject=null,connected_at=null,updated_at=now() where id;
 elsif p_command<>'read' then raise sqlstate 'PT400' using message='إجراء غير صحيح';end if;
 select * into c from workforce_private.google_meeting_connection where id;
 return to_jsonb(c);
end $$;
revoke all on function public.wf_meeting_google(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.wf_meeting_google(uuid,text,jsonb) to service_role;

create function public.wf_meeting_command(p_actor uuid,p_id uuid,p_version integer,p_command text,p_payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare employee uuid; m public.wf_meetings; data jsonb; title text; description text; starts timestamptz; ends timestamptz; task uuid; participants uuid[]; guests text[]; reminder integer; lease workforce_private.meeting_sync_leases; tick timestamptz:=workforce_private.work_now(); url text; changed boolean;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 if not workforce_private.meeting_manager(p_actor) then raise insufficient_privilege;end if;
 select * into m from public.wf_meetings where id=p_id for update;
 perform workforce_private.assert_work_action(p_actor);
 if m.id is null and p_command<>'save' then raise no_data_found;end if;
 if m.id is not null then
  if not workforce_private.meeting_readable(p_id,p_actor) then raise insufficient_privilege;end if;
  if m.version<>p_version then raise sqlstate 'PT409' using message='تغير الاجتماع؛ حدّثي الصفحة';end if;
 end if;
 if p_command='save' then
  if m.status='cancelled' then raise sqlstate 'PT409' using message='الاجتماع ملغى';end if;
  if exists(select 1 from workforce_private.meeting_sync_leases where meeting_id=p_id and expires_at>tick) then raise sqlstate 'PT409' using message='انتظري اكتمال مزامنة الاجتماع';end if;
  if p_payload-array['title','description','starts_at','ends_at','task_id','participant_ids','external_attendees','reminder_minutes']<>'{}'::jsonb then raise sqlstate 'PT400' using message='حقول الاجتماع غير صحيحة';end if;
  title:=btrim(p_payload->>'title');description:=coalesce(p_payload->>'description','');starts:=(p_payload->>'starts_at')::timestamptz;ends:=(p_payload->>'ends_at')::timestamptz;task:=nullif(p_payload->>'task_id','')::uuid;reminder:=coalesce((p_payload->>'reminder_minutes')::integer,15);
  if title is null or length(title)<3 or length(title)>200 or length(description)>10000 or starts is null or ends is null or ends<=starts or ends>starts+interval '8 hours' or reminder not in (5,15,30,60) then raise sqlstate 'PT400' using message='راجعي عنوان الاجتماع ومدته والتذكير';end if;
  select array_agg(distinct value::uuid) into participants from jsonb_array_elements_text(p_payload->'participant_ids');
  if participants is null or cardinality(participants)>50 or exists(select 1 from unnest(participants) x left join public.profiles p on p.id=x left join public.wf_employees e on e.user_id=p.id and e.status='active' where p.id is null or p.role not in ('admin','employee') or (p.role='employee' and e.id is null)) then raise sqlstate 'PT400' using message='المشاركون غير متاحين';end if;
  select coalesce(array_agg(distinct lower(btrim(value))),'{}') into guests from jsonb_array_elements_text(coalesce(p_payload->'external_attendees','[]'));
  if cardinality(guests)>50 or exists(select 1 from unnest(guests) x where length(x)>254 or x !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then raise sqlstate 'PT400' using message='راجعي عناوين المشاركين الخارجيين';end if;
  if task is not null and not exists(select 1 from public.wf_tasks where id=task and archived_at is null and test_run_id is null) then raise sqlstate 'PT400' using message='المهمة المرتبطة غير متاحة';end if;
  data:=jsonb_build_object('title',title,'description',description,'starts_at',starts,'ends_at',ends,'task_id',task,'participant_ids',participants,'external_attendees',guests,'reminder_minutes',reminder);
  if m.id is null then
   insert into public.wf_meetings(id,title,description,starts_at,ends_at,task_id,participant_ids,external_attendees,reminder_minutes,created_by)
   values(p_id,title,description,starts,ends,task,participants,guests,reminder,p_actor) returning * into m;
  elsif m.status='draft' then
   update public.wf_meetings set title=data->>'title',description=data->>'description',starts_at=starts,ends_at=ends,task_id=task,participant_ids=participants,external_attendees=guests,reminder_minutes=reminder,version=version+1,updated_at=tick,sync_state=case when sync_state in ('error','syncing') then 'error' else 'idle' end,sync_error=null where id=p_id returning * into m;
  else update public.wf_meetings set proposed_data=data,version=version+1,updated_at=tick,sync_state=case when sync_state in ('error','syncing') then 'error' else 'idle' end,sync_error=null where id=p_id returning * into m;
  end if;
 elsif p_command in ('prepare','prepare_cancel') then
  if m.id is null or m.status='cancelled' then raise sqlstate 'PT409' using message='الاجتماع غير متاح';end if;
  if not exists(select 1 from workforce_private.google_meeting_connection where id and refresh_token_cipher is not null) then raise sqlstate 'PT409' using message='اربطي تقويم Google أولًا';end if;
  select * into lease from workforce_private.meeting_sync_leases where meeting_id=p_id;
  if lease.expires_at>tick then raise sqlstate 'PT409' using message='المزامنة جارية؛ انتظري قليلًا';end if;
  insert into workforce_private.meeting_sync_leases values(p_id,gen_random_uuid(),m.version,case when p_command='prepare_cancel' then 'cancel' else 'publish' end,tick+interval '2 minutes')
  on conflict(meeting_id) do update set token=excluded.token,version=excluded.version,action=excluded.action,expires_at=excluded.expires_at returning * into lease;
  update public.wf_meetings set sync_state='syncing',sync_error=null where id=p_id returning * into m;
  data:=coalesce(m.proposed_data,to_jsonb(m));
  select coalesce(jsonb_agg(email),'[]') into data from (
   select lower(u.email) email from auth.users u where u.id in(select value::uuid from jsonb_array_elements_text(data->'participant_ids')) and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
   union select lower(value) from jsonb_array_elements_text(coalesce(data->'external_attendees','[]'))
  ) q;
  return jsonb_build_object('meeting',m,'data',coalesce(m.proposed_data,to_jsonb(m)),'emails',data,'lease',lease.token,'action',lease.action);
 elsif p_command in ('finish','fail') then
  select * into lease from workforce_private.meeting_sync_leases where meeting_id=p_id;
  if lease.meeting_id is null or lease.token is distinct from (p_payload->>'lease')::uuid or lease.version<>m.version then raise sqlstate 'PT409' using message='انتهت محاولة المزامنة؛ حدّثي الاجتماع';end if;
  if p_command='fail' then
   update public.wf_meetings set sync_state='error',sync_error='تعذرت مزامنة Google؛ أعيدي المحاولة' where id=p_id returning * into m;
  elsif lease.action='cancel' then
   update public.wf_meetings set status='cancelled',sync_state='idle',sync_error=null,proposed_data=null,version=version+1,updated_at=tick where id=p_id returning * into m;
  else
   url:=nullif(p_payload->>'meet_url','');
   if url is not null and url !~ '^https://meet[.]google[.]com/[a-z]{3}-[a-z]{4}-[a-z]{3}$' then raise sqlstate 'PT400' using message='رابط Google Meet غير صالح';end if;
   data:=coalesce(m.proposed_data,to_jsonb(m));
   update public.wf_meetings set title=data->>'title',description=data->>'description',starts_at=(data->>'starts_at')::timestamptz,ends_at=(data->>'ends_at')::timestamptz,task_id=nullif(data->>'task_id','')::uuid,
    participant_ids=array(select value::uuid from jsonb_array_elements_text(data->'participant_ids')),external_attendees=array(select value from jsonb_array_elements_text(data->'external_attendees')),reminder_minutes=(data->>'reminder_minutes')::integer,
    status='scheduled',meet_url=url,google_event_id=p_payload->>'event_id',google_etag=p_payload->>'etag',sync_state='idle',sync_error=null,proposed_data=null,updated_at=tick where id=p_id returning * into m;
  end if;
  delete from workforce_private.meeting_sync_leases where meeting_id=p_id;
  if p_command='finish' then
   -- Updating/cancelling an ongoing meeting releases or bounds existing protection.
   update public.wf_attendance_sessions a set meeting_until=least(a.cutoff_at,greatest(tick,case when m.status='cancelled' or not exists(select 1 from public.wf_employees e where e.id=a.employee_id and e.user_id=any(m.participant_ids)) or m.starts_at>tick then tick else m.ends_at end)),
    last_seen_at=greatest(a.last_seen_at,tick),next_confirmation_at=least(a.cutoff_at,greatest(tick,case when m.status='cancelled' or not exists(select 1 from public.wf_employees e where e.id=a.employee_id and e.user_id=any(m.participant_ids)) or m.starts_at>tick then tick else greatest(a.next_confirmation_at,m.ends_at) end))
   where a.meeting_id=p_id and a.checked_out is null and a.meeting_until>tick;
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   select distinct u,'meeting_event',case when m.status='cancelled' then 'ألغي الاجتماع' else 'تحديث موعد اجتماع' end,m.title||E'\n'||to_char(m.starts_at at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI'),
    case when p.role='admin' then '/admin/workforce/meetings' else '/employee/meetings' end,'meeting-event:'||m.id||':'||m.version
   from unnest(m.participant_ids) u join public.profiles p on p.id=u where workforce_private.notification_recipient_active(u)
   on conflict(recipient_id,event_key) do nothing;
  end if;
 elsif p_command='cancel_draft' then
  if m.status<>'draft' or m.sync_state<>'idle' or exists(select 1 from public.wf_meeting_events where meeting_id=p_id and action='prepare') then raise sqlstate 'PT409' using message='إلغاء الاجتماع المجدول يحتاج مزامنة Google';end if;
  update public.wf_meetings set status='cancelled',version=version+1,updated_at=tick where id=p_id returning * into m;
 else raise sqlstate 'PT400' using message='إجراء غير صحيح';end if;
 insert into public.wf_meeting_events(meeting_id,actor_id,action) values(p_id,p_actor,p_command);
 return to_jsonb(m);
end $$;
revoke all on function public.wf_meeting_command(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.wf_meeting_command(uuid,uuid,integer,text,jsonb) to service_role;

create function public.wf_meeting_presence(p_actor uuid,p_meeting uuid,p_command text,p_device text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare employee uuid; m public.wf_meetings; s public.wf_attendance_sessions; tick timestamptz:=workforce_private.work_now(); until_time timestamptz;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 select * into m from public.wf_meetings where id=p_meeting for share;
 if employee is not null then perform pg_advisory_xact_lock(hashtextextended(employee::text,19));end if;
 if m.id is null or not(p_actor=any(m.participant_ids)) or m.status<>'scheduled' or m.meet_url is null then raise insufficient_privilege;end if;
 if employee is null then return jsonb_build_object('url',m.meet_url,'protected_until',null);end if;
 select * into s from public.wf_attendance_sessions where employee_id=employee and checked_out is null for update;
 if s.id is null or s.policy_version<>1 or s.device_hash is distinct from p_device then raise sqlstate 'PT409' using message='انضمي من جهاز تسجيل الحضور بعد فتح الدوام';end if;
 if workforce_private.work_expiry(s,tick) is not null then raise sqlstate 'PT409' using message='انتهت جلسة الدوام؛ سجّلي الحضور مجددًا';end if;
 if p_command='join' then
  if tick>=s.next_confirmation_at and coalesce(s.meeting_until,tick)<=tick then raise sqlstate 'PT409' using message='أكدي استمرار العمل قبل الانضمام';end if;
  if tick<m.starts_at or tick>=m.ends_at or tick>=s.cutoff_at then raise sqlstate 'PT409' using message='الانضمام متاح خلال موعد الاجتماع والدوام';end if;
  if s.break_started_at is not null then raise sqlstate 'PT409' using message='استأنفي العمل قبل الانضمام للاجتماع';end if;
  until_time:=least(m.ends_at,s.cutoff_at);
  if s.meeting_id=m.id and s.meeting_until=until_time and exists(select 1 from public.wf_meeting_attendance where meeting_id=m.id and user_id=p_actor and session_id=s.id and left_at is null) then return jsonb_build_object('url',m.meet_url,'protected_until',until_time);end if;
  perform workforce_private.end_work_segment(s.id,tick);
  insert into public.wf_work_segments(session_id,employee_id,kind,title,starts_at) values(s.id,employee,'activity','اجتماع: '||m.title,tick);
  update public.wf_attendance_sessions set meeting_id=m.id,meeting_until=until_time,next_confirmation_at=greatest(next_confirmation_at,until_time),last_seen_at=tick where id=s.id;
  insert into public.wf_meeting_attendance(meeting_id,user_id,session_id,joined_at,left_at) values(m.id,p_actor,s.id,tick,null)
  on conflict(meeting_id,user_id) do update set session_id=excluded.session_id,joined_at=excluded.joined_at,left_at=null;
 elsif p_command='leave' then
  if s.meeting_id is distinct from m.id then raise sqlstate 'PT409' using message='لا توجد مشاركة اجتماع جارية';end if;
  if not exists(select 1 from public.wf_meeting_attendance where meeting_id=m.id and user_id=p_actor and session_id=s.id and left_at is null) then return jsonb_build_object('url',m.meet_url,'protected_until',null);end if;
  perform workforce_private.end_work_segment(s.id,tick);
  insert into public.wf_work_segments(session_id,employee_id,kind,title,starts_at) values(s.id,employee,'unallocated','وقت غير مرتبط بمهمة',tick);
  update public.wf_attendance_sessions set meeting_until=tick,last_seen_at=tick,next_confirmation_at=least(next_confirmation_at,greatest(tick,workforce_private.next_daily_work_confirmation(s.business_date,tick))) where id=s.id;
  update public.wf_meeting_attendance set left_at=tick where meeting_id=m.id and user_id=p_actor;
 else raise sqlstate 'PT400' using message='إجراء غير صحيح';end if;
 insert into public.wf_meeting_events(meeting_id,actor_id,action) values(m.id,p_actor,p_command);
 return jsonb_build_object('url',m.meet_url,'protected_until',until_time);
end $$;
revoke all on function public.wf_meeting_presence(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.wf_meeting_presence(uuid,uuid,text,text) to service_role;

-- A bounded meeting interval substitutes for heartbeat while the participant
-- works in the Meet window. Device ownership and the normal cutoff remain intact.
do $$
declare f oid:='workforce_private.work_expiry(public.wf_attendance_sessions,timestamptz)'::regprocedure; old_body text; body text;
begin
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,$s$if tick>=seen+interval '5 minutes'$s$,$s$if s.meeting_until is not null then seen:=greatest(seen,least(s.meeting_until,s.cutoff_at));end if;
 if tick>=seen+interval '5 minutes'$s$);
 if body=old_body then raise exception 'Work expiry changed; review meeting protection';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
end $$;

-- Google sends the invitation/update once. This separate event is inbox-only.
do $$
declare f oid:='workforce_private.queue_notification_email()'::regprocedure; old_body text; body text;
begin
 select prosrc into old_body from pg_proc where oid=f;
 body:=regexp_replace(old_body,'\mbegin\M',$s$begin
 if new.kind='meeting_event' then return new;end if;$s$,'i');
 execute replace(pg_get_functiondef(f),old_body,body);
end $$;

create function workforce_private.meeting_reminder_current(p_user uuid,p_key text,p_now timestamptz) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.wf_meetings m where m.status='scheduled' and m.meet_url is not null and p_user=any(m.participant_ids)
 and p_now>=m.starts_at-m.reminder_minutes*interval '1 minute' and p_now<m.starts_at
 and p_key='meeting-reminder:'||m.id||':'||extract(epoch from m.starts_at)::bigint);
$$;
revoke all on function workforce_private.meeting_reminder_current(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function workforce_private.meeting_reminder_current(uuid,text,timestamptz) to service_role;
create function public.wf_generate_meeting_reminders(p_now timestamptz default now()) returns integer language plpgsql security invoker set search_path='' as $$
declare added integer;
begin
 insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
 select distinct u,'meeting_reminder','تذكير باجتماع قادم',m.title||E'\nالموعد بتوقيت الرياض: '||to_char(m.starts_at at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI'),
 case when p.role='admin' then '/admin/workforce/meetings' else '/employee/meetings' end,'meeting-reminder:'||m.id||':'||extract(epoch from m.starts_at)::bigint
 from public.wf_meetings m cross join lateral unnest(m.participant_ids) u join public.profiles p on p.id=u
 where m.status='scheduled' and m.meet_url is not null and p_now>=m.starts_at-m.reminder_minutes*interval '1 minute' and p_now<m.starts_at
 and workforce_private.notification_recipient_active(u) and exists(select 1 from public.wf_notification_delivery_settings where id and enabled)
 on conflict(recipient_id,event_key) do nothing;
 get diagnostics added=row_count;return added;
end $$;
revoke all on function public.wf_generate_meeting_reminders(timestamptz) from public,anon,authenticated;
grant execute on function public.wf_generate_meeting_reminders(timestamptz) to service_role;
do $$
declare f oid; old_body text; body text;
begin
 f:='public.wf_generate_notification_reminders(timestamptz)'::regprocedure;
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,'added:=added+public.wf_generate_work_confirmation_reminders(p_now);','added:=added+public.wf_generate_meeting_reminders(p_now); added:=added+public.wf_generate_work_confirmation_reminders(p_now);');
 if body=old_body then raise exception 'Reminder generator changed; review meeting hook';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
 f:='public.wf_claim_notification_deliveries(integer)'::regprocedure;
 select prosrc into old_body from pg_proc where oid=f;
 body:=regexp_replace(old_body,'\mbegin\M',$s$begin
 update public.wf_notification_deliveries d set status='cancelled',last_error='لم يعد تذكير الاجتماع مطلوبًا'
 from public.wf_notifications n where n.id=d.notification_id and d.status='pending' and n.kind='meeting_reminder'
 and not workforce_private.meeting_reminder_current(n.recipient_id,n.event_key,workforce_private.work_now());$s$,'i');
 execute replace(pg_get_functiondef(f),old_body,body);
end $$;

-- Leave meeting mode explicitly before starting another activity or break.
do $$
declare f oid:='public.wf_work_command(uuid,text,uuid,uuid,text,uuid,text)'::regprocedure; original text; patched text;
begin
 select prosrc into original from pg_proc where oid=f;
 patched:=replace(original,$s$elsif p_command in ('task','activity','break','resume') then$s$,$s$elsif p_command in ('task','activity','break','resume') then
 if s.meeting_until>tick then raise sqlstate 'PT409' using message='اختاري عدت للعمل من الاجتماع أولًا';end if;$s$);
 if patched=original then raise exception 'Work command changed; review meeting activity guard';end if;
 execute replace(pg_get_functiondef(f),original,patched);
end $$;

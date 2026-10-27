-- Old meetings retain their provider and resource identity. Only new drafts use Zoom.
alter table public.wf_meetings add column provider text not null default 'google' check(provider in ('google','zoom')),
 add column zoom_meeting_id text check(zoom_meeting_id ~ '^[0-9]{9,11}$');
alter table public.wf_meetings alter column provider set default 'zoom';
do $$declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.wf_meetings'::regclass and contype='c' and pg_get_constraintdef(oid) like '%meet_url%' loop
  execute format('alter table public.wf_meetings drop constraint %I',c.conname);
 end loop;
end$$;

-- External guests have no workforce user. Keep their invitation queue private,
-- with the same worker lease, retry window and provider idempotency discipline.
create table workforce_private.meeting_guest_deliveries(
 id uuid primary key default gen_random_uuid(),meeting_id uuid not null references public.wf_meetings(id),version integer not null,email text not null,snapshot jsonb not null,
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','cancelled')),attempts integer not null default 0,
 available_at timestamptz not null default now(),first_attempt_at timestamptz,lease_token uuid,lease_until timestamptz,sent_at timestamptz,provider_id text,last_error text,
 unique(meeting_id,version,email)
);
alter table workforce_private.meeting_guest_deliveries enable row level security;
revoke all on workforce_private.meeting_guest_deliveries from public,anon,authenticated;
grant select,insert,update on workforce_private.meeting_guest_deliveries to service_role;
create function workforce_private.queue_meeting_guests() returns trigger language plpgsql security definer set search_path='' as $$
declare guest text;
begin
 if new.provider<>'zoom' or new.status not in ('scheduled','cancelled') or old.sync_state<>'syncing' or new.sync_state<>'idle' or new.proposed_data is not null or new.meet_url is null then return new;end if;
 if not exists(select 1 from public.wf_notification_delivery_settings where id and enabled) then return new;end if;
 for guest in select distinct lower(x) from unnest(new.external_attendees||old.external_attendees) x
  where not exists(select 1 from auth.users u left join workforce_private.notification_email_routes r on r.user_id=u.id where u.id=any(new.participant_ids) and lower(x)=lower(coalesce(r.email,u.email))) loop
  insert into workforce_private.meeting_guest_deliveries(meeting_id,version,email,snapshot) values(new.id,new.version,guest,
   jsonb_build_object('email',guest,'name','ضيفنا الكريم','kind','meeting_guest','title',case when new.status='cancelled' or not guest=any(new.external_attendees) then 'إلغاء موعد اجتماع' else 'موعد اجتماع' end,
    'body',new.title||E'\nالموعد — الرياض: '||to_char(new.starts_at at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI'),
    'href',case when new.status='cancelled' or not guest=any(new.external_attendees) then '/meetings' else new.meet_url end,'createdAt',now()))
  on conflict(meeting_id,version,email) do nothing;
 end loop;
 return new;
end$$;
revoke all on function workforce_private.queue_meeting_guests() from public,anon,authenticated;
create trigger wf_zoom_guest_queue after update on public.wf_meetings for each row execute function workforce_private.queue_meeting_guests();
create function public.wf_claim_meeting_guest_deliveries(p_token uuid,p_limit integer default 4) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.wf_notification_delivery_settings where id and enabled and worker_token=p_token and worker_until>now()) then return '[]'::jsonb;end if;
 update workforce_private.meeting_guest_deliveries set status=case when attempts>=6 then 'failed' else 'pending' end,lease_token=null,lease_until=null where status='processing' and lease_until<now();
 update workforce_private.meeting_guest_deliveries d set status='cancelled',last_error='تغير موعد الاجتماع' from public.wf_meetings m where m.id=d.meeting_id and d.status='pending' and m.version<>d.version;
 update workforce_private.meeting_guest_deliveries set status='failed',last_error='انتهت نافذة إعادة المحاولة الآمنة' where status='pending' and first_attempt_at<now()-interval '23 hours';
 with picked as(select id from workforce_private.meeting_guest_deliveries where status='pending' and available_at<=now() and attempts<6 order by available_at,id for update skip locked limit greatest(0,least(p_limit,8))),
 claimed as(update workforce_private.meeting_guest_deliveries d set status='processing',attempts=attempts+1,lease_token=p_token,lease_until=now()+interval '3 minutes',first_attempt_at=coalesce(first_attempt_at,now()) from picked where d.id=picked.id returning d.id,d.snapshot)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'snapshot',snapshot,'externalMeeting',true)),'[]') into result from claimed;
 return result;
end$$;
create function public.wf_finish_meeting_guest_delivery(p_id uuid,p_token uuid,p_result text,p_provider text default null,p_error text default null) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_result not in ('sent','retry','failed') then raise exception 'Invalid delivery result';end if;
 update workforce_private.meeting_guest_deliveries set status=case when p_result='retry' and attempts<6 then 'pending' when p_result='retry' then 'failed' else p_result end,
 sent_at=case when p_result='sent' then now() else null end,provider_id=case when p_result='sent' then left(p_provider,200) else provider_id end,last_error=case when p_result='sent' then null else left(p_error,500) end,
 available_at=now()+make_interval(secs=>case attempts when 1 then 60 when 2 then 300 when 3 then 900 when 4 then 3600 else 7200 end),lease_token=null,lease_until=null where id=p_id and status='processing' and lease_token=p_token;
 return found;
end$$;
revoke all on function public.wf_claim_meeting_guest_deliveries(uuid,integer),public.wf_finish_meeting_guest_delivery(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.wf_claim_meeting_guest_deliveries(uuid,integer),public.wf_finish_meeting_guest_delivery(uuid,uuid,text,text,text) to service_role;
alter table public.wf_meetings add constraint wf_meetings_provider_url check(meet_url is null or
 (provider='google' and meet_url ~ '^https://meet[.]google[.]com/[a-z]{3}-[a-z]{4}-[a-z]{3}$') or
 (provider='zoom' and meet_url ~ '^https://([a-z0-9-]+[.])?zoom[.]us/j/[0-9]{9,11}([?]pwd=[A-Za-z0-9._~-]+)?$'));

create table workforce_private.zoom_meeting_connection(
 id boolean primary key default true check(id),account_id text,client_id text,client_secret_cipher text,
 expected_email text not null default 'elitecnnct@gmail.com',organizer_email text,checked_at timestamptz,updated_at timestamptz not null default now()
);
insert into workforce_private.zoom_meeting_connection(id) values(true);
alter table workforce_private.zoom_meeting_connection enable row level security;
revoke all on workforce_private.zoom_meeting_connection from public,anon,authenticated;
grant select,update on workforce_private.zoom_meeting_connection to service_role;
create function public.wf_meeting_zoom(p_actor uuid,p_command text,p_payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare employee uuid; c workforce_private.zoom_meeting_connection;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 if not workforce_private.meeting_manager(p_actor) then raise insufficient_privilege;end if;
 if p_command<>'read' and employee is not null then raise insufficient_privilege;end if;
 if p_command='configure' then
  if coalesce(p_payload->>'account_id','') !~ '^[A-Za-z0-9_-]{8,200}$' or coalesce(p_payload->>'client_id','') !~ '^[A-Za-z0-9_-]{8,200}$' or length(coalesce(p_payload->>'client_secret_cipher',''))<30 or p_payload->>'organizer_email' is distinct from 'elitecnnct@gmail.com' then raise sqlstate 'PT400' using message='بيانات ربط Zoom غير صحيحة';end if;
  update workforce_private.zoom_meeting_connection set account_id=p_payload->>'account_id',client_id=p_payload->>'client_id',client_secret_cipher=p_payload->>'client_secret_cipher',organizer_email=p_payload->>'organizer_email',checked_at=now(),updated_at=now() where id;
 elsif p_command='disconnect' then
  update workforce_private.zoom_meeting_connection set account_id=null,client_id=null,client_secret_cipher=null,organizer_email=null,checked_at=null,updated_at=now() where id;
 elsif p_command<>'read' then raise sqlstate 'PT400' using message='إجراء غير صحيح';end if;
 select * into c from workforce_private.zoom_meeting_connection where id;return to_jsonb(c);
end$$;
revoke all on function public.wf_meeting_zoom(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.wf_meeting_zoom(uuid,text,jsonb) to service_role;

-- Persist the resource before finish, so an interrupted retry edits the same Zoom meeting.
create function public.wf_meeting_zoom_checkpoint(p_actor uuid,p_id uuid,p_version integer,p_lease uuid,p_zoom_id text) returns void
language plpgsql security invoker set search_path='' as $$
declare m public.wf_meetings;
begin
 perform workforce_private.assert_task_actor(p_actor);
 if not workforce_private.meeting_manager(p_actor) or not workforce_private.meeting_readable(p_id,p_actor) then raise insufficient_privilege;end if;
 select * into m from public.wf_meetings where id=p_id for update;
 if m.provider<>'zoom' or m.version<>p_version or p_zoom_id is null or p_zoom_id !~ '^[0-9]{9,11}$' or not exists(select 1 from workforce_private.meeting_sync_leases where meeting_id=p_id and token=p_lease and version=p_version and action='publish' and expires_at>workforce_private.work_now()) then raise sqlstate 'PT409' using message='انتهت محاولة الربط؛ أعد مزامنة الاجتماع';end if;
 if m.zoom_meeting_id is not null and m.zoom_meeting_id<>p_zoom_id then raise sqlstate 'PT409' using message='معرّف اجتماع Zoom لا يطابق الربط';end if;
 update public.wf_meetings set zoom_meeting_id=p_zoom_id where id=p_id;
end$$;
revoke all on function public.wf_meeting_zoom_checkpoint(uuid,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.wf_meeting_zoom_checkpoint(uuid,uuid,integer,uuid,text) to service_role;

do $$declare f oid:='public.wf_meeting_command(uuid,uuid,integer,text,jsonb)'::regprocedure; original text; body text;
begin
 select prosrc into original from pg_proc where oid=f;
 body:=replace(original,$s$if not exists(select 1 from workforce_private.google_meeting_connection where id and refresh_token_cipher is not null) then raise sqlstate 'PT409' using message='اربطي تقويم Google أولًا';end if;$s$,$s$if m.provider='google' and not exists(select 1 from workforce_private.google_meeting_connection where id and refresh_token_cipher is not null) then raise sqlstate 'PT409' using message='اربط حساب Google للاجتماع السابق';end if;
 if m.provider='zoom' and not exists(select 1 from workforce_private.zoom_meeting_connection where id and checked_at is not null and client_secret_cipher is not null) then raise sqlstate 'PT409' using message='اربط حساب Zoom أولًا';end if;$s$);
 if body=original then raise exception 'Review provider connection gate';end if;
 body:=replace(body,$s$if url is not null and url !~ '^https://meet[.]google[.]com/[a-z]{3}-[a-z]{4}-[a-z]{3}$' then raise sqlstate 'PT400' using message='رابط Google Meet غير صالح';end if;$s$,$s$if m.provider='google' and url is not null and url !~ '^https://meet[.]google[.]com/[a-z]{3}-[a-z]{4}-[a-z]{3}$' then raise sqlstate 'PT400' using message='رابط Google Meet غير صالح';end if;
 if m.provider='zoom' and (m.zoom_meeting_id is null or url is null or url !~ ('^https://([a-z0-9-]+[.])?zoom[.]us/j/'||m.zoom_meeting_id||'([?]pwd=[A-Za-z0-9._~-]+)?$')) then raise sqlstate 'PT400' using message='رابط Zoom لا يطابق الاجتماع';end if;$s$);
 body:=replace(body,$s$google_event_id=p_payload->>'event_id',google_etag=p_payload->>'etag'$s$,$s$google_event_id=case when m.provider='google' then p_payload->>'event_id' else m.google_event_id end,google_etag=case when m.provider='google' then p_payload->>'etag' else m.google_etag end$s$);
 body:=replace(body,'تعذرت مزامنة Google؛ أعيدي المحاولة','تعذرت مزامنة الاجتماع؛ أعد المحاولة');
 body:=replace(body,'إلغاء الاجتماع المجدول يحتاج مزامنة Google','إلغاء الاجتماع المجدول يحتاج مزامنة');
 body:=replace(body,$s$case when m.status='cancelled' then 'ألغي الاجتماع' else 'تحديث موعد اجتماع' end$s$,$s$case when m.status='cancelled' then 'ألغي الاجتماع' else 'موعد اجتماع' end$s$);
 execute replace(pg_get_functiondef(f),original,body);
end$$;

-- Google issues its own calendar invitations. Zoom uses the existing deduplicated
-- notification outbox; no direct Zoom/SMTP invitation is sent by the API adapter.
do $$declare f oid:='workforce_private.queue_notification_email()'::regprocedure; original text; body text;
begin
 select prosrc into original from pg_proc where oid=f;
 body:=replace(original,$s$if new.kind='meeting_event' then return new;end if;$s$,$s$if new.kind='meeting_event' and not exists(select 1 from public.wf_meetings m where m.provider='zoom' and new.event_key='meeting-event:'||m.id||':'||m.version) then return new;end if;$s$);
 if body=original then raise exception 'Review meeting email routing';end if;
 execute replace(pg_get_functiondef(f),original,body);
end$$;

do $$declare f oid:='public.wf_claim_notification_deliveries(integer)'::regprocedure; original text; body text;
begin
 select prosrc into original from pg_proc where oid=f;
 body:=regexp_replace(original,'\mbegin\M',$s$begin
 update public.wf_notification_deliveries d set status='cancelled',last_error='تغير موعد الاجتماع'
 from public.wf_notifications n where n.id=d.notification_id and d.status='pending' and n.kind='meeting_event'
 and not exists(select 1 from public.wf_meetings m where m.provider='zoom' and n.event_key='meeting-event:'||m.id||':'||m.version);$s$,'i');
 execute replace(pg_get_functiondef(f),original,body);
end$$;

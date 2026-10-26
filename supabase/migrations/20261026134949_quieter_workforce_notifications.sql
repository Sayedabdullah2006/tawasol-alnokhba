-- Forward-only delivery policy. Never replay historical notifications.
create table workforce_private.notification_quiet_policy(
 id boolean primary key default true check(id),
 activated_at timestamptz not null default now(),
 digest_starts_on date not null default ((now() at time zone 'Asia/Riyadh')::date+1)
);
insert into workforce_private.notification_quiet_policy(id) values(true);
create table workforce_private.notification_digest_events(
 notification_id uuid primary key references public.wf_notifications(id) on delete cascade,
 recipient_id uuid not null references public.profiles(id),
 task_id uuid references public.wf_tasks(id),
 kind text not null,occurred_at timestamptz not null,
 included_at timestamptz,digest_id uuid references public.wf_notifications(id)
);
create index notification_digest_pending on workforce_private.notification_digest_events(recipient_id,occurred_at) where included_at is null;
create table workforce_private.notification_activity_keys(
 recipient_id uuid not null references public.profiles(id),source_key text not null,
 created_at timestamptz not null default now(),primary key(recipient_id,source_key)
);
alter table workforce_private.notification_quiet_policy enable row level security;
alter table workforce_private.notification_digest_events enable row level security;
alter table workforce_private.notification_activity_keys enable row level security;
revoke all on workforce_private.notification_quiet_policy,workforce_private.notification_digest_events,workforce_private.notification_activity_keys from public,anon,authenticated;
grant select,insert,update,delete on workforce_private.notification_quiet_policy,workforce_private.notification_digest_events,workforce_private.notification_activity_keys to service_role;

create function workforce_private.notification_email_enabled(p_recipient uuid,p_kind text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select (p.settings->workforce_private.notification_group(p_kind)->>'email')::boolean
 from public.wf_notification_preferences p where p.user_id=p_recipient and p.test_run_id is null),true)
$$;
create function workforce_private.notice_is_digest(n public.wf_notifications)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare s public.wf_attendance_sessions;
begin
 if n.kind='task_activity' and n.title='مهمة متوقفة تحتاج متابعة' then return false;end if;
 if n.kind in ('task_update','updated','deadline','state','task_created','task_activity','attachment','overdue','approval_reminder') then return true;end if;
 if n.kind='attendance_out' then
  select * into s from public.wf_attendance_sessions where id::text=split_part(n.event_key,':',2);
  return s.id is not null and s.close_reason is distinct from 'connection_lost' and s.close_reason is distinct from 'confirmation_missed' and s.close_reason is distinct from 'day_end';
 end if;
 if n.kind='attendance_in' then
  select * into s from public.wf_attendance_sessions where id::text=split_part(n.event_key,':',2);
  return s.id is not null and exists(select 1 from public.wf_attendance_sessions a
   where a.employee_id=s.employee_id and a.business_date=s.business_date and a.source='clock' and (a.checked_in,a.id)<(s.checked_in,s.id));
 end if;
 return false;
end $$;
create function workforce_private.record_digest_event(n public.wf_notifications)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.wf_notification_delivery_settings where id and enabled)
  or not exists(select 1 from workforce_private.notification_quiet_policy where id and n.created_at>=activated_at)
  or not workforce_private.notification_email_enabled(n.recipient_id,n.kind) then return;end if;
 insert into workforce_private.notification_digest_events(notification_id,recipient_id,task_id,kind,occurred_at)
 values(n.id,n.recipient_id,n.task_id,n.kind,n.created_at)
 on conflict(notification_id) do update set occurred_at=excluded.occurred_at,kind=excluded.kind,included_at=null,digest_id=null;
end $$;

-- Runs after test/preference/canonical guards. Only routine task updates share a
-- daily card; assignments, submissions and review decisions remain actionable.
create function workforce_private.quiet_task_notice() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_notice public.wf_notifications; original_key text:=new.event_key; inserted integer;
begin
 if new.task_id is null or new.kind not in ('updated','deadline','state','task_created','task_activity','attachment') then return new;end if;
 if new.kind='task_activity' and new.title='مهمة متوقفة تحتاج متابعة' then return new;end if;
 if exists(select 1 from public.wf_notifications n where n.recipient_id=new.recipient_id and n.event_key=original_key) then return null;end if;
 if new.kind in ('state','task_activity') and exists(select 1 from public.wf_notifications n
  join public.wf_tasks t on t.id=n.task_id join public.wf_task_columns c on c.id=t.column_id
  where n.recipient_id=new.recipient_id and n.task_id=new.task_id and n.created_at>=now()-interval '3 seconds'
  and (n.kind='submitted' and c.kind='review' or n.kind='approved' and c.kind='done' or n.kind='changes' and c.kind in ('changes','in_progress'))) then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.recipient_id::text||new.task_id::text,5801));
 insert into workforce_private.notification_activity_keys(recipient_id,source_key) values(new.recipient_id,original_key) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return null;end if;
 new.kind:='task_update';
 new.event_key:='task-update:'||new.task_id||':'||(new.created_at at time zone 'Asia/Riyadh')::date;
 select * into old_notice from public.wf_notifications where recipient_id=new.recipient_id and event_key=new.event_key for update;
 if old_notice.id is not null then
  update public.wf_notifications set title=new.title,body=new.body,href=new.href,
   created_at=new.created_at,read_at=null,inbox_visible=new.inbox_visible where id=old_notice.id returning * into old_notice;
  perform workforce_private.record_digest_event(old_notice);
  return null;
 end if;
 return new;
end $$;
create trigger wf_03_quiet_task_notice before insert on public.wf_notifications for each row execute function workforce_private.quiet_task_notice();

create function workforce_private.suppress_self_action_notice() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 if new.task_id is not null and new.kind in ('assigned','reassigned','updated','deadline','state','task_created','task_activity') then
  select updated_by into actor from public.wf_tasks where id=new.task_id;
 elsif new.kind='employee_request' and new.event_key like 'employee-request:%' then
  select case when split_part(new.event_key,':',3) in ('','cancelled') then (select e.user_id from public.wf_employees e where e.id=q.employee_id) else q.decided_by end into actor
   from public.wf_employee_requests q where q.id::text=split_part(new.event_key,':',2);
 end if;
 if actor=new.recipient_id then return null;end if;
 return new;
end $$;
create trigger wf_025_suppress_self_action before insert on public.wf_notifications for each row execute function workforce_private.suppress_self_action_notice();

-- Submission links are written after the submission row. Enrich the first mail
-- claim after commit so its one message includes the actual linked file names.
create function workforce_private.submission_email_body(n public.wf_notifications)
returns text language plpgsql stable security definer set search_path='' as $$
declare s public.wf_task_submissions; names text; total integer; result text;
begin
 select * into s from public.wf_task_submissions where id::text=split_part(n.event_key,':',2) and task_id=n.task_id;
 if s.id is null then return coalesce(n.body,'');end if;
 result:=coalesce(n.body,'');
 if nullif(btrim(s.summary),'') is not null then result:=result||E'\nملخص التسليم: '||left(s.summary,320);end if;
 select count(*) into total from public.wf_submission_attachments l join public.wf_task_attachments a on a.id=l.attachment_id where l.submission_id=s.id and a.archived_at is null;
 select string_agg(filename,chr(10) order by created_at,id) into names from (
  select left(a.filename,70) filename,a.created_at,a.id from public.wf_submission_attachments l
  join public.wf_task_attachments a on a.id=l.attachment_id where l.submission_id=s.id and a.archived_at is null order by a.created_at,a.id limit 4
 ) files;
 if total>0 then result:=result||E'\nالمرفقات ('||total||E'):\n'||names||case when total>4 then E'\nوبقية الملفات داخل المهمة.' else '' end;end if;
 return result;
end $$;

do $$
declare f oid:=to_regprocedure('public.wf_claim_notification_deliveries(integer)'); old_body text; body text;
begin
 if f is null then raise exception 'Delivery claim is required';end if;
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,'with picked as',$s$update public.wf_notification_deliveries d set snapshot=jsonb_set(d.snapshot,'{body}',to_jsonb(workforce_private.submission_email_body(n)))
 from public.wf_notifications n where n.id=d.notification_id and n.kind='submitted' and d.status='pending' and d.first_attempt_at is null;
 with picked as$s$);
 if body=old_body then raise exception 'Submission snapshot claim seam changed';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
end $$;

-- Reuse the proven recipient validation, email routing and immutable mail queue.
do $$
declare f oid:='workforce_private.queue_notification_email()'::regprocedure; old_body text; body text;
begin
 select prosrc into old_body from pg_proc where oid=f;
 body:=regexp_replace(old_body,'\mbegin\M',$s$begin
 if new.kind='due_2h' then return new;end if;
 if workforce_private.notice_is_digest(new) then
  perform workforce_private.record_digest_event(new);
  if new.kind in ('attendance_in','attendance_out','overdue','approval_reminder') then
   update public.wf_notifications set inbox_visible=false where id=new.id;
  end if;
  return new;
 end if;
 if new.task_id is not null and new.kind in ('assigned','reassigned','submitted','changes','approved') then
  -- The actionable message includes the current task/delivery; do not repeat its
  -- preceding uploads/edits in tomorrow's summary.
  update workforce_private.notification_digest_events set included_at=now()
   where recipient_id=new.recipient_id and task_id=new.task_id and included_at is null and kind='task_update';
  update public.wf_notifications set inbox_visible=false
   where recipient_id=new.recipient_id and task_id=new.task_id and kind='task_update' and created_at>=now()-interval '3 minutes';
  if new.kind in ('submitted','changes','approved') then
   update public.wf_notification_deliveries d set status='cancelled',last_error='دُمج الإسناد مع إجراء التسليم أو المراجعة'
   from public.wf_notifications n where n.id=d.notification_id and n.recipient_id=new.recipient_id
    and n.task_id=new.task_id and n.kind in ('assigned','reassigned') and n.created_at>=now()-interval '3 minutes'
    and d.status='pending' and d.first_attempt_at is null;
   update public.wf_notifications n set inbox_visible=false where n.recipient_id=new.recipient_id and n.task_id=new.task_id
    and n.kind in ('assigned','reassigned') and exists(select 1 from public.wf_notification_deliveries d where d.notification_id=n.id and d.status='cancelled' and d.last_error='دُمج الإسناد مع إجراء التسليم أو المراجعة');
  end if;
 end if;$s$,'i');
 if body=old_body then raise exception 'Mail queue entry changed';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
end $$;

do $$
declare f oid:=to_regprocedure('public.wf_meeting_command(uuid,uuid,integer,text,jsonb)'); old_body text; body text;
begin
 if f is not null then
  select prosrc into old_body from pg_proc where oid=f;
  body:=replace(old_body,'where workforce_private.notification_recipient_active(u)',
   'where workforce_private.notification_recipient_active(u) and u is distinct from p_actor');
  if body=old_body then raise exception 'Meeting actor seam changed';end if;
  execute replace(pg_get_functiondef(f),old_body,body);
 end if;
end $$;

-- No notification about the actor's own action. Reminders and system decisions
-- retain their recipients; no employee receives another employee's private data.
do $$
declare f oid; old_body text; body text;
begin
 f:='workforce_private.notify_admin_task_event()'::regprocedure;
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,'where workforce_private.notification_recipient_active(p.id)','where workforce_private.notification_recipient_active(p.id) and p.id is distinct from new.updated_by');
 if body=old_body then raise exception 'Owner event actor seam changed';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
 f:='workforce_private.notify_task_submission()'::regprocedure;
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,'from public.profiles p where p.id=task.assignee_admin_id or exists(',
  'from public.profiles p where p.id is distinct from new.decided_by and (p.id=task.assignee_admin_id or exists(');
 body:=replace(body,$s$(e.id=task.assignee_id or e.id=any(task.co_assignee_ids)))$s$,$s$(e.id=task.assignee_id or e.id=any(task.co_assignee_ids))))$s$);
 if body=old_body then raise exception 'Review actor seam changed';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
 f:='workforce_private.attendance_reminder_needed(uuid,date)'::regprocedure;
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,'and e.start_date<=p_day','and (e.flexible_workday_from is null or p_day<e.flexible_workday_from) and e.start_date<=p_day');
 if body=old_body then raise exception 'Attendance reminder seam changed';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
end $$;

create function workforce_private.digest_notice_current(n public.wf_notifications,p_now timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
 select workforce_private.notification_recipient_active(n.recipient_id)
 and workforce_private.notification_email_enabled(n.recipient_id,n.kind)
 and (n.kind<>'approval_reminder' or exists(select 1 from public.wf_employee_requests q where q.status='pending' and q.test_run_id is null)
  or exists(select 1 from public.wf_profile_change_requests q where q.status='pending')
  or exists(select 1 from public.wf_task_submissions s join public.wf_tasks t on t.id=s.task_id where s.status='pending' and t.test_run_id is null and t.deleted_at is null and t.archived_at is null))
 and (n.task_id is null or exists(select 1 from public.wf_tasks t join public.wf_task_columns c on c.id=t.column_id
 join public.wf_boards b on b.id=t.board_id join public.profiles p on p.id=n.recipient_id
 where t.id=n.task_id and t.deleted_at is null and t.test_run_id is null and t.archived_at is null and b.archived_at is null
 and (p.role='admin' or exists(select 1 from public.wf_employees e where e.user_id=p.id and e.status='active'
  and (e.can_manage_tasks or e.id=t.assignee_id or e.id=any(t.co_assignee_ids))))
 and (n.kind<>'overdue' or t.due_at<p_now and c.kind not in ('review','done'))))
$$;

create function public.wf_generate_daily_notification_digest(p_now timestamptz default now())
returns integer language plpgsql security invoker set search_path='' as $$
declare day date:=(p_now at time zone 'Asia/Riyadh')::date; boundary timestamptz; recipient uuid;
 notice uuid; body text; overview text; item record; ids uuid[]; total integer; added integer:=0; admin boolean;
begin
 if not exists(select 1 from public.wf_notification_delivery_settings where id and enabled)
 or day<(select digest_starts_on from workforce_private.notification_quiet_policy where id)
 or extract(dow from day)=5 or (p_now at time zone 'Asia/Riyadh')::time<time '09:15' then return 0;end if;
 boundary:=(day+time '09:15') at time zone 'Asia/Riyadh';
 perform pg_advisory_xact_lock(74122,83);
 -- Do not retain stale/unreadable task details in a later email.
 update workforce_private.notification_digest_events e set included_at=p_now
 from public.wf_notifications n where n.id=e.notification_id and e.included_at is null
 and not workforce_private.digest_notice_current(n,p_now);
 for recipient in select distinct e.recipient_id from workforce_private.notification_digest_events e
  where e.included_at is null and e.occurred_at<=boundary
 loop
  if exists(select 1 from public.wf_notifications n where n.recipient_id=recipient and n.event_key='daily-digest:'||day) then continue;end if;
  if exists(select 1 from workforce_private.test_runs t where t.ended_at is null and t.expires_at>now() and recipient=any(t.participants)) then continue;end if;
  select p.role='admin' into admin from public.profiles p where p.id=recipient;
  select array_agg(e.notification_id) into ids from workforce_private.notification_digest_events e
   where e.recipient_id=recipient and e.included_at is null and e.occurred_at<=boundary;
  if ids is null then continue;end if;
  body:='ملخص تحديثاتك حتى 09:15 بتوقيت الرياض.';
  for item in select e.kind,case when e.kind='task_update' then count(distinct e.task_id) else count(*) end total
   from workforce_private.notification_digest_events e where e.notification_id=any(ids) and e.kind not in ('overdue','approval_reminder') group by e.kind order by e.kind loop
   body:=body||chr(10)||case item.kind when 'task_update' then 'مهام لها تحديثات' when 'attendance_in' then 'فترات حضور إضافية'
    when 'attendance_out' then 'فترات انصراف يدوي' when 'overdue' then 'تنبيهات مهام متأخرة'
    when 'approval_reminder' then 'تذكيرات اعتماد معلقة' else 'تحديثات' end||': '||item.total;
  end loop;
  -- Current outstanding counts are shown once, not one mail per task/request.
  if exists(select 1 from workforce_private.notification_digest_events e where e.notification_id=any(ids) and e.kind='overdue') then
   select count(distinct e.task_id) into total from workforce_private.notification_digest_events e where e.notification_id=any(ids) and e.kind='overdue';
   body:=body||chr(10)||'المهام المتأخرة التي تحتاج متابعة: '||total;
  end if;
  if admin and exists(select 1 from workforce_private.notification_digest_events e where e.notification_id=any(ids) and e.kind='approval_reminder') then
   select (select count(*) from public.wf_employee_requests where status='pending' and test_run_id is null)
    +(select count(*) from public.wf_profile_change_requests where status='pending')
    +(select count(*) from public.wf_task_submissions s join public.wf_tasks t on t.id=s.task_id
      where s.status='pending' and t.test_run_id is null and t.archived_at is null and t.deleted_at is null) into total;
   if total>0 then body:=body||chr(10)||'طلبات وتسليمات بانتظار قرارك: '||total;end if;
  end if;
  -- Attendance details contain time/duration only, never salary or medical data.
  if admin then
   select string_agg(line,chr(10) order by business_date,full_name) into overview from (
    select a.business_date,e.full_name,e.full_name||' · '||a.business_date||': '||
     to_char(min(a.checked_in) at time zone 'Asia/Riyadh','HH24:MI')||' — '||
     coalesce(to_char(max(a.checked_out) at time zone 'Asia/Riyadh','HH24:MI'),'حضور جارٍ') line
    from public.wf_attendance_sessions a join public.wf_employees e on e.id=a.employee_id
    where a.source='clock' and a.business_date<day and a.business_date>=day-3 and exists(
     select 1 from workforce_private.notification_digest_events d join public.wf_notifications n on n.id=d.notification_id
     join public.wf_attendance_sessions touched on touched.id::text=split_part(n.event_key,':',2)
     where d.notification_id=any(ids) and d.kind in ('attendance_in','attendance_out') and touched.employee_id=a.employee_id and touched.business_date=a.business_date)
    group by a.business_date,e.full_name order by a.business_date desc,e.full_name limit 4
   ) attendance;
   if overview is not null then body:=body||E'\nالحضور والانصراف:\n'||overview;end if;
  end if;
  body:=left(body,780)||E'\nالتفاصيل والإجراءات متاحة في لوحتك.';
  notice:=null;
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key,created_at)
  values(recipient,'daily_digest','ملخص يومك · '||day,body,case when admin then '/admin/workforce' else '/employee' end,'daily-digest:'||day,p_now)
  on conflict(recipient_id,event_key) do nothing returning id into notice;
  if notice is not null then
   update workforce_private.notification_digest_events set included_at=p_now,digest_id=notice where notification_id=any(ids) and included_at is null and occurred_at<=boundary;
   added:=added+1;
  end if;
 end loop;
 return added;
end $$;

do $$
declare f oid:='public.wf_generate_notification_reminders(timestamptz)'::regprocedure; old_body text; body text;
begin
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,$s$return jsonb_build_object('created',added);$s$,$s$added:=added+public.wf_generate_daily_notification_digest(p_now);
 return jsonb_build_object('created',added);$s$);
 if body=old_body then raise exception 'Reminder scheduler seam changed';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
end $$;

do $$
declare f oid:='workforce_private.notification_group(text)'::regprocedure; old_body text; body text;
begin
 select prosrc into old_body from pg_proc where oid=f;
 body:=replace(old_body,$s$('attendance_confirmation',$s$,$s$('daily_digest','attendance_confirmation',$s$);
 if body=old_body then raise exception 'Notification category seam changed';end if;
 execute replace(pg_get_functiondef(f),old_body,body);
end $$;

-- Do not deliver an older queued routine message after enabling the new policy.
-- Historical inbox rows and already-sent messages are retained.
update public.wf_notification_deliveries d set status='cancelled',last_error='تحديثات روتينية أصبحت ضمن الملخص اليومي'
from public.wf_notifications n where n.id=d.notification_id and d.status='pending'
and (n.kind='due_2h' or workforce_private.notice_is_digest(n));

revoke all on function workforce_private.notification_email_enabled(uuid,text),workforce_private.notice_is_digest(public.wf_notifications),workforce_private.record_digest_event(public.wf_notifications),workforce_private.quiet_task_notice(),workforce_private.suppress_self_action_notice(),workforce_private.submission_email_body(public.wf_notifications),workforce_private.digest_notice_current(public.wf_notifications,timestamptz),public.wf_generate_daily_notification_digest(timestamptz) from public,anon,authenticated;
grant execute on function workforce_private.notification_email_enabled(uuid,text),workforce_private.notice_is_digest(public.wf_notifications),workforce_private.record_digest_event(public.wf_notifications),workforce_private.submission_email_body(public.wf_notifications),workforce_private.digest_notice_current(public.wf_notifications,timestamptz),public.wf_generate_daily_notification_digest(timestamptz) to service_role;

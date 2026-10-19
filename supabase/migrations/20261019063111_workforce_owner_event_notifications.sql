-- Admin-only notification address; never changes the account's sign-in email.
create table workforce_private.notification_email_routes (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 email text not null check (email=btrim(email) and length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 updated_at timestamptz not null default now()
);
alter table workforce_private.notification_email_routes enable row level security;
revoke all on workforce_private.notification_email_routes from public,anon,authenticated;
grant select,insert,update,delete on workforce_private.notification_email_routes to service_role;

create or replace function workforce_private.notification_recipient_matches_email(p_id uuid,p_email text) returns boolean
language sql stable security definer set search_path='' as $$
 select workforce_private.notification_recipient_active(p_id) and exists (
  select 1 from auth.users u join public.profiles p on p.id=u.id
  left join workforce_private.notification_email_routes r on r.user_id=p.id and p.role='admin'
  where u.id=p_id and u.email_confirmed_at is not null
   and (lower(u.email)=lower(p_email) or lower(r.email)=lower(p_email))
 );
$$;
revoke all on function workforce_private.notification_recipient_matches_email(uuid,text) from public,anon,authenticated;
grant execute on function workforce_private.notification_recipient_matches_email(uuid,text) to service_role;

create or replace function workforce_private.queue_notification_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient record; task public.wf_tasks;
begin
 if not exists(select 1 from public.wf_notification_delivery_settings where id and enabled and new.created_at>=activated_at) then return new; end if;
 select coalesce(r.email,u.email) email,coalesce(e.full_name,p.full_name,'فريق تواصل النخبة') as name
 into recipient from public.profiles p join auth.users u on u.id=p.id
 left join public.wf_employees e on e.user_id=p.id and e.status='active'
 left join workforce_private.notification_email_routes r on r.user_id=p.id and p.role='admin'
 where p.id=new.recipient_id and u.deleted_at is null and u.email_confirmed_at is not null
 and (u.banned_until is null or u.banned_until<=now()) and (p.role='admin' or (p.role='employee' and e.id is not null));
 if recipient.email is null then return new; end if;
 if new.task_id is not null then select * into task from public.wf_tasks where id=new.task_id; end if;
 insert into public.wf_notification_deliveries(notification_id,recipient_id,snapshot)
 values(new.id,new.recipient_id,jsonb_build_object('email',recipient.email,'name',recipient.name,
 'kind',new.kind,'title',new.title,'body',new.body,'href',new.href,'createdAt',new.created_at,
 'taskTitle',task.title,'client',task.client_name,'dueAt',task.due_at,
 'deliverable',case when task.id is null then null else coalesce(substring(task.description from 'المطلوب تسليمه اليوم: ([^\n]+)'),task.completion_criteria) end))
 on conflict(notification_id) do nothing;
 perform workforce_private.wake_notifications();
 return new;
end $$;
revoke all on function workforce_private.queue_notification_email() from public,anon,authenticated;

-- One owner notice for create/state events, including the owner's own actions.
-- Existing operational/submission notifications remain the source when present.
create function workforce_private.notify_admin_task_event() returns trigger
language plpgsql security invoker set search_path='' as $$
declare recipient uuid; heading text; category text; event text; assignee text; old_state text; new_state text;
begin
 if new.test_run_id is not null then return new;end if;
 if TG_OP='UPDATE' and new.column_id is not distinct from old.column_id then return new;end if;
 select coalesce(e.full_name,a.display_name,'غير مسندة') into assignee
 from public.wf_tasks t left join public.wf_employees e on e.id=t.assignee_id
 left join public.wf_task_assignment_admins a on a.user_id=t.assignee_admin_id where t.id=new.id;
 select title into new_state from public.wf_task_columns where id=new.column_id;
 if TG_OP='INSERT' then heading:='أضيفت مهمة جديدة';category:='task_created';event:='task-created:'||new.id||':'||new.version;
 else
  heading:='تغيرت حالة مهمة';category:='task_activity';event:='task-activity:'||new.id||':'||new.version;
  select title into old_state from public.wf_task_columns where id=old.column_id;
 end if;
 for recipient in select r.user_id from workforce_private.notification_email_routes r
  join public.profiles p on p.id=r.user_id and p.role='admin'
  where workforce_private.notification_recipient_active(p.id)
 loop
  if TG_OP='INSERT' and exists(select 1 from public.wf_notifications n where n.recipient_id=recipient and n.task_id=new.id and n.event_key='task:'||new.id||':'||new.version||':assigned') then continue;end if;
  if TG_OP='UPDATE' and exists(select 1 from public.wf_task_columns c where c.id=new.column_id and c.kind='review')
   and exists(select 1 from public.wf_task_submissions s join public.wf_notifications n on n.event_key='submission:'||s.id and n.recipient_id=recipient
    where s.task_id=new.id and s.status='pending') then continue;end if;
  insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
  values(recipient,category,heading,new.title||E'\nالمسؤول: '||assignee||E'\nالحالة: '||
    case when TG_OP='INSERT' then new_state else coalesce(old_state,'—')||' إلى '||new_state end,
    new.id,'/admin/workforce/tasks/'||new.id,event)
  on conflict(recipient_id,event_key) do nothing;
 end loop;
 return new;
end $$;
revoke all on function workforce_private.notify_admin_task_event() from public,anon,authenticated;
create trigger wf_task_owner_activity after insert or update of column_id on public.wf_tasks
 for each row execute function workforce_private.notify_admin_task_event();

create function workforce_private.notify_admin_attendance_event() returns trigger
language plpgsql security invoker set search_path='' as $$
declare name text; heading text; category text; tick timestamptz; key text;
begin
 if new.source<>'clock' then return new;end if;
 if TG_OP='INSERT' then category:='attendance_in';heading:='تسجيل حضور موظفة';tick:=new.checked_in;
 elsif old.checked_out is null and new.checked_out is not null then category:='attendance_out';heading:='تسجيل انصراف موظفة';tick:=new.checked_out;
 else return new;end if;
 select full_name into name from public.wf_employees where id=new.employee_id;
 key:='clock:'||new.id||':'||category;
 insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
 select r.user_id,category,heading,coalesce(name,'الموظفة')||E'\nالوقت بتوقيت الرياض: '||to_char(tick at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI'),
  '/admin/workforce/attendance?employee_id='||new.employee_id,key
 from workforce_private.notification_email_routes r join public.profiles p on p.id=r.user_id and p.role='admin'
 where workforce_private.notification_recipient_active(p.id)
 on conflict(recipient_id,event_key) do nothing;
 return new;
end $$;
revoke all on function workforce_private.notify_admin_attendance_event() from public,anon,authenticated;
create trigger wf_attendance_owner_activity after insert or update of checked_out on public.wf_attendance_sessions
 for each row execute function workforce_private.notify_admin_attendance_event();

create or replace function workforce_private.notification_group(p_kind text) returns text language sql immutable set search_path='' as $$
 select case when p_kind in ('due_24h','due_2h','overdue','approval_digest','admin_digest','document_expiry','contract_expiry','attendance_missing','attendance_reminder') then 'reminders'
 when p_kind='payroll' then 'finance' when p_kind in ('employee_request','profile_request') then 'requests'
 when p_kind in ('hr','attendance_in','attendance_out') then 'hr' else 'tasks' end
$$;

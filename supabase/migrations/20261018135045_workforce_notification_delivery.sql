-- Operational notifications: durable email outbox, recipient privacy and a
-- minute scheduler independent of browser sessions or the web server.
create table public.wf_notification_delivery_settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 activated_at timestamptz not null default now(), last_run_at timestamptz,
 worker_token uuid, worker_until timestamptz
);
insert into public.wf_notification_delivery_settings(id) values(true);
create table public.wf_notification_deliveries (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null unique references public.wf_notifications(id) on delete cascade,
 recipient_id uuid not null references public.profiles(id),
 snapshot jsonb not null,
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','cancelled')),
 attempts integer not null default 0 check(attempts between 0 and 6),
 available_at timestamptz not null default now(), first_attempt_at timestamptz,
 lease_token uuid, lease_until timestamptz, provider_id text, last_error text,
 created_at timestamptz not null default now(), sent_at timestamptz
);
create index wf_notification_delivery_pending_idx on public.wf_notification_deliveries(available_at,id) where status in ('pending','processing');
create index wf_notification_delivery_recipient_idx on public.wf_notification_deliveries(recipient_id);
create index wf_notification_delivery_status_idx on public.wf_notification_deliveries(status,created_at desc);
alter table public.wf_notification_deliveries enable row level security;
alter table public.wf_notification_delivery_settings enable row level security;
revoke all on public.wf_notification_deliveries,public.wf_notification_delivery_settings from public,anon,authenticated;
grant select on public.wf_notification_deliveries,public.wf_notification_delivery_settings to authenticated;
create policy wf_notification_delivery_admin on public.wf_notification_deliveries for select to authenticated using((select workforce_private.is_admin()));
create policy wf_notification_delivery_settings_admin on public.wf_notification_delivery_settings for select to authenticated using((select workforce_private.is_admin()));
grant select,insert,update,delete on public.wf_notification_deliveries to service_role;
grant select,update on public.wf_notification_delivery_settings to service_role;

-- Private definer is limited to reading Vault and waking one fixed worker.
create function workforce_private.wake_notifications() returns void
language plpgsql security definer set search_path='' as $$
declare endpoint text; token text;
begin
 if not exists(select 1 from public.wf_notification_delivery_settings where id and enabled) then return; end if;
 if current_setting('workforce.notification_wake',true)='1' then return; end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='workforce_project_url';
 select decrypted_secret into token from vault.decrypted_secrets where name='workforce_service_role_key';
 if endpoint is null or token is null then return; end if;
 perform set_config('workforce.notification_wake','1',true);
 perform net.http_post(url:=endpoint||'/functions/v1/workforce-notifications',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),
   body:='{}'::jsonb,timeout_milliseconds:=120000);
end $$;
revoke all on function workforce_private.wake_notifications() from public,anon,authenticated;
grant execute on function workforce_private.wake_notifications() to service_role;

-- The immutable snapshot makes provider idempotency safe across retries.
create function workforce_private.queue_notification_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient record; task public.wf_tasks;
begin
 if not exists(select 1 from public.wf_notification_delivery_settings where id and enabled and new.created_at>=activated_at) then return new; end if;
 select u.email,coalesce(e.full_name,p.full_name,'فريق تواصل النخبة') as name
 into recipient from public.profiles p join auth.users u on u.id=p.id
 left join public.wf_employees e on e.user_id=p.id and e.status='active'
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
create trigger wf_notification_email_queue after insert on public.wf_notifications for each row execute function workforce_private.queue_notification_email();

create function public.wf_claim_notification_deliveries(p_limit integer default 8) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare batch uuid:=gen_random_uuid(); result jsonb;
begin
 update public.wf_notification_delivery_settings set worker_token=batch,worker_until=now()+interval '3 minutes'
 where id and enabled and (worker_until is null or worker_until<now());
 if not found then return jsonb_build_object('deliveries','[]'::jsonb); end if;
 update public.wf_notification_deliveries set status=case when attempts>=6 then 'failed' else 'pending' end,lease_token=null,lease_until=null
 where status='processing' and lease_until<now();
 update public.wf_notification_deliveries d set status='cancelled',last_error='لم يعد المستلم أو الإشعار متاحًا'
 where d.status='pending' and (not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
 left join public.wf_employees e on e.user_id=p.id and e.status='active'
 where p.id=d.recipient_id and lower(u.email)=lower(d.snapshot->>'email') and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<=now()) and (p.role='admin' or (p.role='employee' and e.id is not null)))
 or exists(select 1 from public.wf_notifications n join public.wf_tasks t on t.id=n.task_id join public.wf_task_columns c on c.id=t.column_id
 join public.wf_boards b on b.id=t.board_id where n.id=d.notification_id and n.kind in ('due_24h','due_2h','overdue')
 and (t.archived_at is not null or b.archived_at is not null or c.kind in ('done','review')
 or t.due_at is distinct from (d.snapshot->>'dueAt')::timestamptz
 or (d.snapshot->>'href' like '/employee%' and not exists(select 1 from public.wf_employees e where e.id=t.assignee_id and e.user_id=d.recipient_id)))));
 update public.wf_notification_deliveries set status='failed',last_error='انتهت نافذة إعادة المحاولة الآمنة'
 where status='pending' and first_attempt_at<now()-interval '23 hours';
 with picked as(select id from public.wf_notification_deliveries where status='pending' and available_at<=now() and attempts<6 order by available_at,id for update skip locked limit greatest(1,least(p_limit,8))),
 claimed as(update public.wf_notification_deliveries d set status='processing',attempts=attempts+1,lease_token=batch,
 lease_until=now()+interval '3 minutes',first_attempt_at=coalesce(first_attempt_at,now()) from picked where d.id=picked.id returning d.id,d.snapshot)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'snapshot',snapshot)),'[]'::jsonb) into result from claimed;
 return jsonb_build_object('token',batch,'deliveries',result);
end $$;
revoke all on function public.wf_claim_notification_deliveries(integer) from public,anon,authenticated;
grant execute on function public.wf_claim_notification_deliveries(integer) to service_role;

create function public.wf_finish_notification_delivery(p_id uuid,p_token uuid,p_result text,p_provider text default null,p_error text default null) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if p_result not in ('sent','retry','failed') then raise exception 'Invalid delivery result'; end if;
 update public.wf_notification_deliveries set status=case when p_result='retry' and attempts<6 then 'pending' when p_result='retry' then 'failed' else p_result end,
 sent_at=case when p_result='sent' then now() else null end,provider_id=case when p_result='sent' then left(p_provider,200) else provider_id end,
 last_error=case when p_result='sent' then null else left(p_error,500) end,
 available_at=now()+make_interval(secs=>case attempts when 1 then 60 when 2 then 300 when 3 then 900 when 4 then 3600 else 7200 end),lease_token=null,lease_until=null
 where id=p_id and status='processing' and lease_token=p_token;
 return found;
end $$;
revoke all on function public.wf_finish_notification_delivery(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.wf_finish_notification_delivery(uuid,uuid,text,text,text) to service_role;
create function public.wf_release_notification_worker(p_token uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 update public.wf_notification_delivery_settings set worker_token=null,worker_until=null where id and worker_token=p_token;
 if found and exists(select 1 from public.wf_notification_deliveries where status='pending' and available_at<=now()) then perform workforce_private.wake_notifications(); end if;
end $$;
revoke all on function public.wf_release_notification_worker(uuid) from public,anon,authenticated;
grant execute on function public.wf_release_notification_worker(uuid) to service_role;

-- Additional operational changes, without notifying unrelated employees.
create function workforce_private.notify_workforce_changes() returns trigger
language plpgsql security invoker set search_path='' as $$
declare recipient uuid; actor uuid; emp uuid; heading text; category text; route text; key text;
begin
 if TG_TABLE_NAME='wf_employee_documents' then
  emp:=new.employee_id;actor:=new.created_by;category:='document';heading:='تحديث في مستنداتك الوظيفية';route:='/employee/profile/documents';
  if TG_OP='UPDATE' and new.archived_at is not distinct from old.archived_at and new.employee_visible is not distinct from old.employee_visible and new.expires_on is not distinct from old.expires_on and new.title is not distinct from old.title then return new; end if;
  key:='document:'||new.id||':'||md5(to_jsonb(new)::text);
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
  select p.id,'document','تحديث مستندات موظفة','راجعي المستندات في الملف الوظيفي.','/admin/workforce/employees/'||emp,key
  from public.profiles p where p.role='admin' and p.id<>actor and workforce_private.task_actor_unbanned(p.id) on conflict(recipient_id,event_key) do nothing;
  if not new.employee_visible then return new; end if;
 elsif TG_TABLE_NAME='wf_compensation_versions' then
  emp:=new.employee_id;actor:=new.created_by;category:='compensation';heading:='تحديث بيانات الراتب والحوافز';route:='/employee/profile/compensation';key:='compensation:'||new.id;
 elsif TG_TABLE_NAME='wf_attendance_settings' then
  emp:=new.employee_id;actor:=new.updated_by;category:='attendance_settings';heading:='تحديث إعدادات دوامك';route:='/employee/attendance/schedule';
  if TG_OP='UPDATE' and new.workdays=old.workdays and new.schedule_mode=old.schedule_mode and new.daily_minutes=old.daily_minutes and new.starts_at=old.starts_at and new.ends_at=old.ends_at then return new; end if;
  key:='attendance-settings:'||emp||':'||md5(to_jsonb(new)::text);
 elsif TG_TABLE_NAME='wf_leave_entitlements' then
  emp:=new.employee_id;actor:=new.updated_by;category:='leave_balance';heading:='تحديث رصيد إجازتك';route:='/employee/attendance/leave-balances';key:='leave-balance:'||emp||':'||new.year||':'||md5(to_jsonb(new)::text);
 elsif TG_TABLE_NAME='wf_attendance_sessions' then
  if new.source='clock' then return new; end if;
  emp:=new.employee_id;actor:=new.updated_by;category:='attendance_correction';heading:='تحديث سجل حضورك';route:='/employee/attendance/overview';key:='attendance:'||new.id||':'||new.version;
 elsif TG_TABLE_NAME='wf_employees' then
  if new.status<>'active' then return new; end if;
  emp:=new.id;actor:=new.updated_by;category:='employment';heading:='تحديث ملفك الوظيفي';route:='/employee/profile/contract';key:='employment:'||new.id||':'||new.version;
 else return new;
 end if;
 select user_id into recipient from public.wf_employees where id=emp and status='active';
 if recipient is not null and recipient is distinct from actor then
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key) values(recipient,category,heading,'راجعي التفاصيل في بوابتك الوظيفية.',route,key) on conflict(recipient_id,event_key) do nothing;
 end if;
 return new;
end $$;
revoke all on function workforce_private.notify_workforce_changes() from public,anon,authenticated;
grant execute on function workforce_private.notify_workforce_changes() to service_role;
create trigger wf_document_change_notifications after insert or update on public.wf_employee_documents for each row execute function workforce_private.notify_workforce_changes();
create trigger wf_compensation_change_notifications after insert on public.wf_compensation_versions for each row execute function workforce_private.notify_workforce_changes();
create trigger wf_attendance_setting_notifications after insert or update on public.wf_attendance_settings for each row execute function workforce_private.notify_workforce_changes();
create trigger wf_leave_balance_notifications after insert or update on public.wf_leave_entitlements for each row execute function workforce_private.notify_workforce_changes();
create trigger wf_attendance_correction_notifications after insert or update on public.wf_attendance_sessions for each row execute function workforce_private.notify_workforce_changes();
create trigger wf_employment_change_notifications after update on public.wf_employees for each row execute function workforce_private.notify_workforce_changes();

create function workforce_private.notify_task_operational_change() returns trigger
language plpgsql security invoker set search_path='' as $$
declare heading text; employee_user uuid;
begin
 if new.blocked_reason is distinct from old.blocked_reason then heading:=case when new.blocked_reason='' then 'أزيل عائق مهمة' else 'مهمة متوقفة تحتاج متابعة' end;
 elsif new.archived_at is distinct from old.archived_at then heading:=case when new.archived_at is null then 'استعيدت مهمة من الأرشيف' else 'أرشفت مهمة' end;
 elsif new.column_id is distinct from old.column_id then heading:='تغيرت حالة مهمة';
 elsif new.priority is distinct from old.priority then heading:='تغيرت أولوية مهمة';
 else return new; end if;
 select user_id into employee_user from public.wf_employees where id=new.assignee_id and status='active';
 insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
 select p.id,'task_activity',heading,new.title,new.id,case when p.role='admin' then '/admin/workforce/tasks/' else '/employee/work/tasks/' end||new.id,'task-activity:'||new.id||':'||new.version
 from public.profiles p where p.id<>new.updated_by and workforce_private.task_actor_unbanned(p.id)
 and ((p.role='admin' and (new.column_id is distinct from old.column_id or new.blocked_reason is distinct from old.blocked_reason))
 or (p.id=employee_user and new.column_id is not distinct from old.column_id))
 and not exists(select 1 from public.wf_task_columns c where c.id=new.column_id and c.kind='review' and new.column_id is distinct from old.column_id)
 on conflict(recipient_id,event_key) do nothing;
 return new;
end $$;
revoke all on function workforce_private.notify_task_operational_change() from public,anon,authenticated;
grant execute on function workforce_private.notify_task_operational_change() to service_role;
create trigger wf_task_operational_notifications after update on public.wf_tasks for each row execute function workforce_private.notify_task_operational_change();

create function workforce_private.notify_task_attachment() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
 select p.id,'attachment','أضيف مرفق إلى مهمة',t.title,t.id,
 case when p.role='admin' then '/admin/workforce/tasks/' else '/employee/work/tasks/' end||t.id||'?panel=attachments','attachment:'||new.id
 from public.wf_tasks t join public.profiles p on p.role='admin' or exists(select 1 from public.wf_employees e where e.user_id=p.id and e.id=t.assignee_id and e.status='active')
 where t.id=new.task_id and p.id<>new.created_by and workforce_private.task_actor_unbanned(p.id)
 on conflict(recipient_id,event_key) do nothing;
 return new;
end $$;
revoke all on function workforce_private.notify_task_attachment() from public,anon,authenticated;
grant execute on function workforce_private.notify_task_attachment() to service_role;
create trigger wf_task_attachment_notifications after insert on public.wf_task_attachments for each row execute function workforce_private.notify_task_attachment();

create function public.wf_generate_notification_reminders(p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare task record; doc record; contract record; stage text; heading text; key text; day date:=(p_now at time zone 'Asia/Riyadh')::date; added integer:=0; affected integer; pending_count integer;
begin
 if not exists(select 1 from public.wf_notification_delivery_settings where id and enabled) then return jsonb_build_object('created',0); end if;
 perform pg_advisory_xact_lock(74122,31);
 for task in select t.*,e.user_id,e.full_name,coalesce(s.workdays,array[0,1,2,3,4,6]) as workdays
 from public.wf_tasks t join public.wf_task_columns c on c.id=t.column_id join public.wf_boards b on b.id=t.board_id
 join public.wf_employees e on e.id=t.assignee_id left join public.wf_attendance_settings s on s.employee_id=e.id
 where t.archived_at is null and b.archived_at is null and c.kind not in ('done','review') and e.status='active' and e.start_date<=day
 and t.due_at is not null and t.due_at<=p_now+interval '24 hours' loop
  if not(extract(dow from day)::integer=any(task.workdays)) then continue; end if;
  if task.due_at>p_now then
   stage:=case when task.due_at<=p_now+interval '2 hours' then 'due_2h' else 'due_24h' end;
   heading:=case stage when 'due_2h' then 'بقيت ساعتان أو أقل على تسليم مهمة' else 'تسليم مهمة خلال 24 ساعة' end;
   key:='task-reminder:'||task.id||':'||extract(epoch from task.due_at)::bigint||':'||stage;
  else
   if extract(hour from p_now at time zone 'Asia/Riyadh')<9 then continue; end if;
   stage:='overdue';heading:='تأخر موعد تسليم مهمة';key:='task-reminder:'||task.id||':'||extract(epoch from task.due_at)::bigint||':overdue:'||day;
  end if;
  insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
  values(task.user_id,stage,heading,task.title,task.id,'/employee/work/tasks/'||task.id,key) on conflict(recipient_id,event_key) do nothing;
  get diagnostics affected=row_count;added:=added+affected;
  if stage='overdue' then
   insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
   select p.id,stage,heading,task.full_name||' — '||task.title,task.id,'/admin/workforce/tasks/'||task.id,key
   from public.profiles p where p.role='admin' and workforce_private.task_actor_unbanned(p.id) on conflict(recipient_id,event_key) do nothing;
   get diagnostics affected=row_count;added:=added+affected;
  end if;
 end loop;
 if extract(hour from p_now at time zone 'Asia/Riyadh')>=9 and extract(dow from day)<>5 then
  select (select count(*) from public.wf_employee_requests where status='pending' and created_at<p_now-interval '24 hours')+
   (select count(*) from public.wf_profile_change_requests where status='pending' and created_at<p_now-interval '24 hours')+
   (select count(*) from public.wf_task_submissions s join public.wf_tasks t on t.id=s.task_id where s.status='pending' and t.archived_at is null and s.created_at<p_now-interval '24 hours') into pending_count;
  if pending_count>0 then
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   select id,'approval_reminder','طلبات وتسليمات بانتظار قرارك',pending_count||' طلبات أو تسليمات معلقة لأكثر من 24 ساعة','/admin/workforce/approvals','approval-reminder:'||day
   from public.profiles p where role='admin' and workforce_private.task_actor_unbanned(p.id) on conflict(recipient_id,event_key) do nothing;
   get diagnostics affected=row_count;added:=added+affected;
  end if;
  for doc in select d.*,e.user_id from public.wf_employee_documents d join public.wf_employees e on e.id=d.employee_id where d.archived_at is null and e.status='active' and d.expires_on is not null and d.expires_on<=day+7 loop
   stage:=case when doc.expires_on<day then 'expired' when doc.expires_on<=day+1 then '1d' else '7d' end;
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   select p.id,'document_expiry',case when stage='expired' then 'انتهت صلاحية مستند وظيفي' else 'اقترب انتهاء مستند وظيفي' end,'راجعي المستند وموعد انتهائه في الملف الوظيفي.',
   case when p.role='admin' then '/admin/workforce/employees/'||doc.employee_id else '/employee/profile/documents' end,
   'document-expiry:'||doc.id||':'||doc.expires_on||':'||stage
   from public.profiles p where workforce_private.task_actor_unbanned(p.id) and (p.role='admin' or (p.id=doc.user_id and doc.employee_visible)) on conflict(recipient_id,event_key) do nothing;
   get diagnostics affected=row_count;added:=added+affected;
  end loop;
  for contract in select * from public.wf_employees where status='active' and contract_end is not null and contract_end between day and day+30 loop
   stage:=case when contract.contract_end<=day+7 then '7d' else '30d' end;
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   select p.id,'contract_expiry','اقترب انتهاء مدة عقد وظيفي','راجعي تفاصيل العقد في الملف الوظيفي.',
   case when p.role='admin' then '/admin/workforce/employees/'||contract.id else '/employee/profile/contract' end,
   'contract-expiry:'||contract.id||':'||contract.contract_end||':'||stage from public.profiles p
   where workforce_private.task_actor_unbanned(p.id) and (p.role='admin' or p.id=contract.user_id) on conflict(recipient_id,event_key) do nothing;
   get diagnostics affected=row_count;added:=added+affected;
  end loop;
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
  select p.id,'attendance_reminder','سجل حضور مفتوح يحتاج تصحيحًا','راجعي الحضور وقدمي طلب تصحيح عند الحاجة.',
   case when p.role='admin' then '/admin/workforce/attendance' else '/employee/attendance/overview' end,'attendance-open:'||a.id||':'||day
   from public.wf_attendance_sessions a join public.wf_employees e on e.id=a.employee_id join public.profiles p on p.role='admin' or p.id=e.user_id
   where a.checked_out is null and a.checked_in<p_now-interval '24 hours' and e.status='active' and workforce_private.task_actor_unbanned(p.id)
   on conflict(recipient_id,event_key) do nothing;
  get diagnostics affected=row_count;added:=added+affected;
 end if;
 update public.wf_notification_delivery_settings set last_run_at=now() where id;
 return jsonb_build_object('created',added);
end $$;
revoke all on function public.wf_generate_notification_reminders(timestamptz) from public,anon,authenticated;
grant execute on function public.wf_generate_notification_reminders(timestamptz) to service_role;

-- Only the trusted service can provision the worker credential into Vault.
create function public.wf_configure_notification_delivery(p_url text,p_key text,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare secret_id uuid;
begin
 if p_url !~ '^https://[a-z0-9]+\.supabase\.co$' or length(p_key)<100 then raise exception 'Invalid worker configuration'; end if;
 select id into secret_id from vault.secrets where name='workforce_project_url';
 if secret_id is null then perform vault.create_secret(p_url,'workforce_project_url'); else perform vault.update_secret(secret_id,p_url); end if;
 select id into secret_id from vault.secrets where name='workforce_service_role_key';
 if secret_id is null then perform vault.create_secret(p_key,'workforce_service_role_key'); else perform vault.update_secret(secret_id,p_key); end if;
 update public.wf_notification_delivery_settings set enabled=p_enabled,activated_at=case when not enabled and p_enabled then now() else activated_at end where id;
 perform cron.schedule('workforce-notifications-every-minute','* * * * *','select public.wf_generate_notification_reminders(); select workforce_private.wake_notifications();');
end $$;
revoke all on function public.wf_configure_notification_delivery(text,text,boolean) from public,anon,authenticated;
grant execute on function public.wf_configure_notification_delivery(text,text,boolean) to service_role;

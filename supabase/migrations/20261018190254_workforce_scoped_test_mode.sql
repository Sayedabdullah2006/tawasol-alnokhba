-- Test markers belong to records, never to a global notification switch.
create table workforce_private.test_runs (
 id uuid primary key default gen_random_uuid(), created_by uuid not null references public.profiles(id),
 participants uuid[] not null, created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '2 hours', ended_at timestamptz
);
alter table workforce_private.test_runs enable row level security;
revoke all on workforce_private.test_runs from public,anon,authenticated;
grant usage on schema workforce_private to service_role;
grant select,insert,update,delete on workforce_private.test_runs to service_role;
alter table public.wf_tasks add column test_run_id uuid references workforce_private.test_runs(id) on delete restrict;
alter table public.wf_employee_requests add column test_run_id uuid references workforce_private.test_runs(id) on delete restrict;
create index wf_tasks_test_run_idx on public.wf_tasks(test_run_id) where test_run_id is not null;
create index wf_requests_test_run_idx on public.wf_employee_requests(test_run_id) where test_run_id is not null;

create function public.wf_test_run(p_action text,p_actor uuid,p_run uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r workforce_private.test_runs; actor_role text;
begin
 select role into actor_role from public.profiles where id=p_actor;
 if actor_role is null or not coalesce(workforce_private.task_actor_unbanned(p_actor),false) or actor_role not in ('admin','employee') or
 (actor_role='employee' and not exists(select 1 from public.wf_employees where user_id=p_actor and status='active')) then raise insufficient_privilege; end if;
 if p_action='start' then
  if actor_role<>'admin' then raise insufficient_privilege; end if;
  insert into workforce_private.test_runs(created_by,participants)
  values(p_actor,array(select user_id from public.wf_employees where status='active')||array[p_actor]) returning * into r;
 else
  select * into r from workforce_private.test_runs where id=p_run;
  if r.id is null or not(p_actor=any(r.participants) or actor_role='admin') then raise insufficient_privilege; end if;
  if p_action='finish' then
   if actor_role<>'admin' then raise insufficient_privilege; end if;
   update workforce_private.test_runs set ended_at=coalesce(ended_at,now()) where id=r.id returning * into r;
  elsif p_action in ('join','assert') then
   if r.ended_at is not null or r.expires_at<=now() then raise sqlstate 'PT409' using message='انتهت جولة الاختبار. اخرج من وضع الاختبار أو ابدأ جولة جديدة.'; end if;
  elsif p_action<>'status' then raise sqlstate 'PT400' using message='إجراء اختبار غير صحيح'; end if;
 end if;
 return jsonb_build_object('id',r.id,'active',r.ended_at is null and r.expires_at>now(),'expires_at',r.expires_at);
end $$;
revoke all on function public.wf_test_run(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.wf_test_run(text,uuid,uuid) to service_role;

create function workforce_private.mark_test_resource() returns trigger
language plpgsql security invoker set search_path='' as $$
declare actor uuid; requested text;
begin
 if TG_OP='UPDATE' then
  if new.test_run_id is distinct from old.test_run_id then raise sqlstate 'PT409' using message='لا يمكن تحويل سجل حقيقي إلى اختبار أو إزالة علامة الاختبار'; end if;
  return new;
 end if;
 if TG_TABLE_NAME='wf_tasks' then
  requested:=nullif(current_setting('workforce.test_run_id',true),'');
  if requested is not null then new.test_run_id:=requested::uuid; end if;
  actor:=new.created_by;
 else
  select user_id into actor from public.wf_employees where id=new.employee_id;
 end if;
 if new.test_run_id is not null then
  perform public.wf_test_run('assert',actor,new.test_run_id);
  if TG_TABLE_NAME='wf_employee_requests' then
   if new.kind<>'general' then raise sqlstate 'PT400' using message='استخدم طلبًا إداريًا في الاختبار؛ الطلبات المؤثرة على الحضور والمال متاحة في الوضع العادي'; end if;
  end if;
  new.title:=left('اختبار · '||new.title,case when TG_TABLE_NAME='wf_tasks' then 250 else 150 end);
 elsif new.title ~* '^(QA-LIVE-|WF-TEST:|wf-qa-|QA-profile-)' then
  raise sqlstate 'PT400' using message='ابدأ جولة اختبار قبل إنشاء بيانات الاختبار';
 end if;
 return new;
end $$;
revoke all on function workforce_private.mark_test_resource() from public,anon,authenticated;
create trigger wf_mark_test_task before insert or update on public.wf_tasks for each row execute function workforce_private.mark_test_resource();
create trigger wf_mark_test_request before insert or update on public.wf_employee_requests for each row execute function workforce_private.mark_test_resource();

create function public.wf_test_task_command(p_run uuid,p_actor uuid,p_id uuid,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; previous text:=coalesce(current_setting('workforce.test_run_id',true),'');
begin
 perform public.wf_test_run('assert',p_actor,p_run);
 if p_command<>'create' and not exists(select 1 from public.wf_tasks where id=p_id and test_run_id=p_run) then
  raise sqlstate 'PT409' using message='هذا السجل حقيقي. اخرج من وضع الاختبار للتعديل عليه';
 end if;
 if p_command='create' and exists(select 1 from public.wf_tasks where id=p_id and test_run_id is distinct from p_run) then raise insufficient_privilege; end if;
 perform set_config('workforce.test_run_id',p_run::text,true);
 result:=public.wf_task_command(p_actor,p_id,p_version,p_command,p_payload,p_key);
 perform set_config('workforce.test_run_id',previous,true);
 return result;
end $$;
revoke all on function public.wf_test_task_command(uuid,uuid,uuid,integer,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.wf_test_task_command(uuid,uuid,uuid,integer,text,jsonb,uuid) to service_role;

-- Suppress BEFORE insert: no realtime inbox row, no queue row and no worker wake.
create function workforce_private.suppress_test_notification() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (new.task_id is not null and exists(select 1 from public.wf_tasks where id=new.task_id and test_run_id is not null))
 or (new.event_key like 'employee-request:%' and exists(select 1 from public.wf_employee_requests where id::text=split_part(new.event_key,':',2) and test_run_id is not null))
 or new.body ~* '^(QA-LIVE-|WF-TEST:|wf-qa-|QA-profile-)' then return null; end if;
 return new;
end $$;
revoke all on function workforce_private.suppress_test_notification() from public,anon,authenticated;
create trigger wf_00_suppress_test_notifications before insert on public.wf_notifications for each row execute function workforce_private.suppress_test_notification();

-- Exclude test records from aggregate approval digests as well.
CREATE OR REPLACE FUNCTION public.wf_generate_notification_reminders(p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare task record; doc record; contract record; stage text; heading text; key text; day date:=(p_now at time zone 'Asia/Riyadh')::date; added integer:=0; affected integer; pending_count integer; reminder record;
begin
 if not exists(select 1 from public.wf_notification_delivery_settings where id and enabled) then return jsonb_build_object('created',0); end if;
 perform pg_advisory_xact_lock(74122,31);
 for task in select t.*,coalesce(e.user_id,a.user_id) as user_id,coalesce(e.full_name,a.display_name) as full_name,coalesce(s.workdays,array[0,1,2,3,4,6]) as workdays
 from public.wf_tasks t join public.wf_task_columns c on c.id=t.column_id join public.wf_boards b on b.id=t.board_id
 left join public.wf_employees e on e.id=t.assignee_id left join public.wf_task_assignment_admins a on a.user_id=t.assignee_admin_id left join public.wf_attendance_settings s on s.employee_id=e.id
 where t.test_run_id is null and t.archived_at is null and b.archived_at is null and c.kind not in ('done','review') and ((e.status='active' and e.start_date<=day) or (a.user_id is not null and workforce_private.notification_recipient_active(a.user_id)))
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
  values(task.user_id,stage,heading,task.title,task.id,case when task.assignee_admin_id is not null then '/admin/workforce/tasks/' else '/employee/work/tasks/' end||task.id,key) on conflict(recipient_id,event_key) do nothing;
  get diagnostics affected=row_count;added:=added+affected;
  if stage='overdue' then
   insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
   select p.id,stage,heading,task.full_name||' — '||task.title,task.id,'/admin/workforce/tasks/'||task.id,key
   from public.profiles p where p.role='admin' and workforce_private.notification_recipient_active(p.id) on conflict(recipient_id,event_key) do nothing;
   get diagnostics affected=row_count;added:=added+affected;
  end if;
 end loop;
 if extract(hour from p_now at time zone 'Asia/Riyadh')>=9 and extract(dow from day)<>5 then
  for reminder in
   select 'requests' as category,count(*) as total,'طلبات وظيفية بانتظار قرارك' as title,'/admin/workforce/approvals' as href from public.wf_employee_requests where test_run_id is null and status='pending' and created_at<p_now-interval '24 hours'
   union all select 'profile',count(*),'تعديلات بيانات بانتظار قرارك','/admin/workforce/approvals?tab=profile' from public.wf_profile_change_requests where status='pending' and created_at<p_now-interval '24 hours'
   union all select 'submissions',count(*),'تسليمات بانتظار اعتمادك','/admin/workforce?state=review' from public.wf_task_submissions s join public.wf_tasks t on t.id=s.task_id where t.test_run_id is null and s.status='pending' and t.archived_at is null and s.created_at<p_now-interval '24 hours'
  loop
   if reminder.total>0 then
    insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
    select id,'approval_reminder',reminder.title,reminder.total||' بانتظار المراجعة لأكثر من 24 ساعة',reminder.href,'approval-reminder:'||reminder.category||':'||day
    from public.profiles p where role='admin' and workforce_private.notification_recipient_active(p.id) on conflict(recipient_id,event_key) do nothing;
    get diagnostics affected=row_count;added:=added+affected;
   end if;
  end loop;
  for doc in select d.*,e.user_id from public.wf_employee_documents d join public.wf_employees e on e.id=d.employee_id where d.archived_at is null and e.status='active' and d.expires_on is not null and d.expires_on<=day+7 loop
   stage:=case when doc.expires_on<day then 'expired' when doc.expires_on<=day+1 then '1d' else '7d' end;
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   select p.id,'document_expiry',case when stage='expired' then 'انتهت صلاحية مستند وظيفي' else 'اقترب انتهاء مستند وظيفي' end,'راجعي المستند وموعد انتهائه في الملف الوظيفي.',
   case when p.role='admin' then '/admin/workforce/employees/'||doc.employee_id else '/employee/profile/documents' end,
   'document-expiry:'||doc.id||':'||doc.expires_on||':'||stage
   from public.profiles p where workforce_private.notification_recipient_active(p.id) and (p.role='admin' or (p.id=doc.user_id and doc.employee_visible)) on conflict(recipient_id,event_key) do nothing;
   get diagnostics affected=row_count;added:=added+affected;
  end loop;
  for contract in select * from public.wf_employees where status='active' and contract_end is not null and contract_end between day and day+30 loop
   stage:=case when contract.contract_end<=day+7 then '7d' else '30d' end;
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   select p.id,'contract_expiry','اقترب انتهاء مدة عقد وظيفي','راجعي تفاصيل العقد في الملف الوظيفي.',
   case when p.role='admin' then '/admin/workforce/employees/'||contract.id else '/employee/profile/contract' end,
   'contract-expiry:'||contract.id||':'||contract.contract_end||':'||stage from public.profiles p
   where workforce_private.notification_recipient_active(p.id) and (p.role='admin' or p.id=contract.user_id) on conflict(recipient_id,event_key) do nothing;
   get diagnostics affected=row_count;added:=added+affected;
  end loop;
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
  select p.id,'attendance_reminder','سجل حضور مفتوح يحتاج تصحيحًا','راجعي الحضور وقدمي طلب تصحيح عند الحاجة.',
   case when p.role='admin' then '/admin/workforce/attendance' else '/employee/attendance/overview' end,'attendance-open:'||a.id||':'||day
   from public.wf_attendance_sessions a join public.wf_employees e on e.id=a.employee_id join public.profiles p on p.role='admin' or p.id=e.user_id
   where a.checked_out is null and a.checked_in<p_now-interval '24 hours' and e.status='active' and workforce_private.notification_recipient_active(p.id)
   on conflict(recipient_id,event_key) do nothing;
  get diagnostics affected=row_count;added:=added+affected;
 end if;
 update public.wf_notification_delivery_settings set last_run_at=now() where id;
 return jsonb_build_object('created',added);
end $function$


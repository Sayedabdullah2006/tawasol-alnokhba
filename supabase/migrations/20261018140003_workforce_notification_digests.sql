-- Each pending category opens the correct review page; idle minutes do not wake the mail worker.
create or replace function public.wf_generate_notification_reminders(p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare task record; doc record; contract record; stage text; heading text; key text; day date:=(p_now at time zone 'Asia/Riyadh')::date; added integer:=0; affected integer; pending_count integer; reminder record;
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
   from public.profiles p where p.role='admin' and workforce_private.notification_recipient_active(p.id) on conflict(recipient_id,event_key) do nothing;
   get diagnostics affected=row_count;added:=added+affected;
  end if;
 end loop;
 if extract(hour from p_now at time zone 'Asia/Riyadh')>=9 and extract(dow from day)<>5 then
  for reminder in
   select 'requests' as category,count(*) as total,'طلبات وظيفية بانتظار قرارك' as title,'/admin/workforce/approvals' as href from public.wf_employee_requests where status='pending' and created_at<p_now-interval '24 hours'
   union all select 'profile',count(*),'تعديلات بيانات بانتظار قرارك','/admin/workforce/approvals?tab=profile' from public.wf_profile_change_requests where status='pending' and created_at<p_now-interval '24 hours'
   union all select 'submissions',count(*),'تسليمات بانتظار اعتمادك','/admin/workforce?state=review' from public.wf_task_submissions s join public.wf_tasks t on t.id=s.task_id where s.status='pending' and t.archived_at is null and s.created_at<p_now-interval '24 hours'
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
end $$;

create or replace function workforce_private.wake_notifications() returns void
language plpgsql security definer set search_path='' as $$
declare endpoint text; token text;
begin
 if not exists(select 1 from public.wf_notification_delivery_settings where id and enabled) then return; end if;
 if current_setting('workforce.notification_wake',true)='1' then return; end if;
 if not exists(select 1 from public.wf_notification_deliveries where (status='pending' and available_at<=now()) or (status='processing' and lease_until<now())) then return; end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='workforce_project_url';
 select decrypted_secret into token from vault.decrypted_secrets where name='workforce_service_role_key';
 if endpoint is null or token is null then return; end if;
 perform set_config('workforce.notification_wake','1',true);
 perform net.http_post(url:=endpoint||'/functions/v1/workforce-notifications',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token,'x-workforce-secret',token),
   body:='{}'::jsonb,timeout_milliseconds:=120000);
exception when others then return;
end $$;


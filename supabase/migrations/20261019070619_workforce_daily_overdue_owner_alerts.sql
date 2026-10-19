-- Deadline alerts run every minute, including early hours and weekends.
-- Daily identity does not depend on deadline edits; recognize existing legacy keys too.
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
 where t.test_run_id is null and t.archived_at is null and b.archived_at is null and c.kind not in ('done','review') and ((e.status='active' and e.user_id is not null and workforce_private.notification_recipient_active(e.user_id)) or (a.user_id is not null and workforce_private.notification_recipient_active(a.user_id)))
 and t.due_at is not null and t.due_at<=p_now+interval '24 hours' loop

  if task.due_at>p_now then
   stage:=case when task.due_at<=p_now+interval '2 hours' then 'due_2h' else 'due_24h' end;
   heading:=case stage when 'due_2h' then 'بقيت ساعتان أو أقل على تسليم مهمة' else 'تسليم مهمة خلال 24 ساعة' end;
   key:='task-reminder:'||task.id||':'||extract(epoch from task.due_at)::bigint||':'||stage;
  else
   stage:='overdue';heading:='تأخر موعد تسليم مهمة';key:='task-reminder:'||task.id||':overdue:'||day;
  end if;
  insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
  select task.user_id,stage,heading,task.title,task.id,case when task.assignee_admin_id is not null then '/admin/workforce/tasks/' else '/employee/work/tasks/' end||task.id,key
  where stage<>'overdue' or not exists(select 1 from public.wf_notifications n where n.recipient_id=task.user_id and n.task_id=task.id and n.kind='overdue'
   and n.event_key like 'task-reminder:'||task.id||':%overdue:'||day) on conflict(recipient_id,event_key) do nothing;
  get diagnostics affected=row_count;added:=added+affected;
  if stage='overdue' then
   insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
   select p.id,stage,heading,task.full_name||' — '||task.title,task.id,'/admin/workforce/tasks/'||task.id,key
   from public.profiles p where p.role='admin' and workforce_private.notification_recipient_active(p.id)
   and not exists(select 1 from public.wf_notifications n where n.recipient_id=p.id and n.task_id=task.id and n.kind='overdue'
    and n.event_key like 'task-reminder:'||task.id||':%overdue:'||day) on conflict(recipient_id,event_key) do nothing;
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

 -- Daily employee reminder: first cron pass in the 09:45–09:59 Riyadh window.
 if (p_now at time zone 'Asia/Riyadh')::time>=time '09:45'
  and (p_now at time zone 'Asia/Riyadh')::time<time '10:00' then
  for reminder in select e.id,e.user_id from public.wf_employees e
   where workforce_private.attendance_reminder_needed(e.id,day)
  loop
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   values(reminder.user_id,'attendance_missing','تذكير بتسجيل الحضور',
    'لم يظهر تسجيل حضورك ليوم '||day||'. إذا بدأت دوامك، سجّلي الحضور من الرابط.',
    '/employee/attendance/overview','attendance-missing:'||reminder.id||':'||day)
   on conflict(recipient_id,event_key) do nothing;
   get diagnostics affected=row_count;added:=added+affected;
  end loop;
 end if;

 -- Manager escalation: once per employee and Riyadh business day, from 10:00.
 if (p_now at time zone 'Asia/Riyadh')::time>=time '10:00' then
  for reminder in select e.id,e.full_name,r.user_id as manager_id
   from public.wf_employees e cross join workforce_private.notification_email_routes r
   join public.profiles p on p.id=r.user_id and p.role='admin'
   where workforce_private.attendance_reminder_needed(e.id,day)
    and workforce_private.notification_recipient_active(r.user_id)
  loop
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   values(reminder.manager_id,'attendance_missing_admin','عدم تسجيل الحضور حتى 10 صباحًا',
    reminder.full_name||' لم تسجّل الحضور حتى الساعة 10 صباحًا بتوقيت الرياض ليوم '||day||'.',
    '/admin/workforce/attendance?employee_id='||reminder.id,
    'attendance-escalation:'||reminder.id||':'||day)
   on conflict(recipient_id,event_key) do nothing;
   get diagnostics affected=row_count;added:=added+affected;
  end loop;
 end if;

 update public.wf_notification_delivery_settings set last_run_at=now() where id;
 return jsonb_build_object('created',added);
end $function$
;

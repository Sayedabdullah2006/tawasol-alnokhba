-- Recipient eligibility also works for the postgres-owned scheduler.
create function workforce_private.notification_recipient_active(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
left join public.wf_employees e on e.user_id=p.id and e.status='active'
where p.id=p_id and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
and (p.role='admin' or (p.role='employee' and e.id is not null)));
$$;
revoke all on function workforce_private.notification_recipient_active(uuid) from public,anon,authenticated;
grant execute on function workforce_private.notification_recipient_active(uuid) to service_role;
create or replace function workforce_private.notify_workforce_changes() returns trigger
language plpgsql security invoker set search_path='' as $$
declare recipient uuid; actor uuid; emp uuid; heading text; category text; route text; key text;
begin
 if TG_TABLE_NAME='wf_employee_documents' then
  emp:=new.employee_id;actor:=new.created_by;category:='document';heading:='تحديث في مستنداتك الوظيفية';route:='/employee/profile/documents';
  if TG_OP='UPDATE' and new.archived_at is not distinct from old.archived_at and new.employee_visible is not distinct from old.employee_visible and new.expires_on is not distinct from old.expires_on and new.title is not distinct from old.title then return new; end if;
  key:='document:'||new.id||':'||md5(to_jsonb(new)::text);
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
  select p.id,'document','تحديث مستندات موظفة','راجعي المستندات في الملف الوظيفي.','/admin/workforce/employees/'||emp,key
  from public.profiles p where p.role='admin' and p.id<>actor and workforce_private.notification_recipient_active(p.id) on conflict(recipient_id,event_key) do nothing;
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
create or replace function workforce_private.notify_task_operational_change() returns trigger
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
 from public.profiles p where p.id<>new.updated_by and workforce_private.notification_recipient_active(p.id)
 and ((p.role='admin' and (new.column_id is distinct from old.column_id or new.blocked_reason is distinct from old.blocked_reason))
 or (p.id=employee_user and new.column_id is not distinct from old.column_id))
 and not exists(select 1 from public.wf_task_columns c where c.id=new.column_id and c.kind='review' and new.column_id is distinct from old.column_id)
 on conflict(recipient_id,event_key) do nothing;
 return new;
end $$;
create or replace function workforce_private.notify_task_attachment() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
 select p.id,'attachment','أضيف مرفق إلى مهمة',t.title,t.id,
 case when p.role='admin' then '/admin/workforce/tasks/' else '/employee/work/tasks/' end||t.id||'?panel=files','attachment:'||new.id
 from public.wf_tasks t join public.profiles p on p.role='admin' or exists(select 1 from public.wf_employees e where e.user_id=p.id and e.id=t.assignee_id and e.status='active')
 where t.id=new.task_id and p.id<>new.created_by and workforce_private.notification_recipient_active(p.id)
 on conflict(recipient_id,event_key) do nothing;
 return new;
end $$;
create or replace function public.wf_generate_notification_reminders(p_now timestamptz default now()) returns jsonb
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
   from public.profiles p where p.role='admin' and workforce_private.notification_recipient_active(p.id) on conflict(recipient_id,event_key) do nothing;
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
   from public.profiles p where role='admin' and workforce_private.notification_recipient_active(p.id) on conflict(recipient_id,event_key) do nothing;
   get diagnostics affected=row_count;added:=added+affected;
  end if;
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

-- One inbox/mail event per recipient and task version, even with overlapping
-- assignment, shared-task and owner triggers. Independent events retain their keys.
create function workforce_private.canonical_task_notice() returns trigger
language plpgsql security invoker set search_path='' as $$
declare revision integer;
begin
 if new.task_id is not null and new.kind in ('assigned','updated','deadline','state','task_created','task_activity')
  and new.event_key ~ '^(task:|shared-task:|task-created:|task-activity:)' then
  select version into revision from public.wf_tasks where id=new.task_id;
  if revision is not null then new.event_key:='task-change:'||new.task_id||':'||revision;end if;
 end if;
 return new;
end $$;
revoke all on function workforce_private.canonical_task_notice() from public,anon,authenticated;
create trigger wf_02_canonical_task_notice before insert on public.wf_notifications
 for each row execute function workforce_private.canonical_task_notice();

create or replace function workforce_private.notify_task_change() returns trigger
language plpgsql set search_path='' as $$
declare recipient uuid; message text; event_kind text; state text; before_state text; after_state text; details text;
begin
  recipient:=new.assignee_admin_id;
  if recipient is null then select user_id into recipient from public.wf_employees where id=new.assignee_id and status='active'; end if;
  if recipient is null then return new; end if;
  if TG_OP='INSERT' then event_kind:='assigned'; message:='أُسندت إليك مهمة جديدة';
  elsif new.assignee_id is distinct from old.assignee_id or new.assignee_admin_id is distinct from old.assignee_admin_id then event_kind:='assigned'; message:='أُسندت إليك مهمة جديدة';
  elsif new.column_id is distinct from old.column_id then
    select kind into state from public.wf_task_columns where id=new.column_id;
    if state='review' or (state in ('done','changes') and exists(select 1 from public.wf_task_columns where id=old.column_id and kind='review')) then return new; end if;
    event_kind:='state'; message:='تغيرت حالة مهمتك';
  elsif new.due_at is distinct from old.due_at then event_kind:='deadline'; message:='تغير موعد تسليم مهمتك';
  elsif new.title is distinct from old.title or new.description is distinct from old.description or new.completion_criteria is distinct from old.completion_criteria or new.client_name is distinct from old.client_name then
    event_kind:='updated'; message:='تحدثت تفاصيل مهمتك';
  else return new;
  end if;
  details:=new.title;
  if TG_OP='UPDATE' and new.column_id is distinct from old.column_id then
    select title into before_state from public.wf_task_columns where id=old.column_id;
    select title into after_state from public.wf_task_columns where id=new.column_id;
    details:=details||E'\nالحالة السابقة: '||coalesce(before_state,'—')||E'\nالحالة الجديدة: '||coalesce(after_state,'—');
  end if;
  if recipient<>new.updated_by then
    insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
    values(recipient,event_kind,message,details,new.id,case when new.assignee_admin_id is not null then '/admin/workforce/tasks/' else '/employee/work/tasks/' end||new.id,'task:'||new.id||':'||new.version||':'||event_kind)
    on conflict(recipient_id,event_key) do nothing;
  end if;
  return new;
end $$;


create or replace function workforce_private.notify_shared_task_change() returns trigger
language plpgsql set search_path='' as $$
declare recipient record; heading text; kind text; message text; previous_title text; next_title text;
begin
 for recipient in select e.id,e.user_id from public.wf_employees e
  where e.id=any(new.co_assignee_ids) and e.status='active' and e.user_id<>new.updated_by
 loop
  kind:=null;
  if tg_op='INSERT' then kind:='assigned'; heading:='أُسندت إليك مهمة مشتركة';
  elsif not recipient.id=any(old.co_assignee_ids) then kind:='assigned'; heading:='أُسندت إليك مهمة مشتركة';
  elsif new.column_id is distinct from old.column_id then
   -- Submission/review decision is the single actionable notice for this transition.
   if exists(select 1 from public.wf_task_columns c where c.id=new.column_id and c.kind='review')
    or (exists(select 1 from public.wf_task_columns c where c.id=old.column_id and c.kind='review')
     and exists(select 1 from public.wf_task_columns c where c.id=new.column_id and c.kind in ('done','changes'))) then continue;end if;
   kind:='state'; heading:='تغيرت حالة مهمتك المشتركة';
  elsif new.due_at is distinct from old.due_at then kind:='deadline'; heading:='تغير موعد تسليم مهمتك المشتركة';
  elsif new.title is distinct from old.title or new.description is distinct from old.description or new.completion_criteria is distinct from old.completion_criteria then kind:='updated'; heading:='تحدثت تفاصيل مهمتك المشتركة';
  end if;
  if kind is null then continue; end if;
  message:=new.title;
  if kind='state' then
   select title into previous_title from public.wf_task_columns where id=old.column_id;
   select title into next_title from public.wf_task_columns where id=new.column_id;
   message:=message||chr(10)||'الحالة السابقة: '||previous_title||chr(10)||'الحالة الجديدة: '||next_title;
  end if;
  insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
   values(recipient.user_id,kind,heading,message,new.id,'/employee/work/tasks/'||new.id,'shared-task:'||new.id||':'||new.version||':'||kind)
   on conflict(recipient_id,event_key) do nothing;
 end loop;
 return new;
end $$;

-- Include the employee, request type, period and actual decision in the event.
-- No amounts are copied to other employees; existing recipient boundaries remain.
create or replace function workforce_private.notify_employee_request() returns trigger
language plpgsql security invoker set search_path='' as $$
declare recipient uuid; employee_name text; request_kind text; details text;
begin
 select full_name into employee_name from public.wf_employees where id=new.employee_id;
 request_kind:=case new.kind when 'leave' then 'إجازة' when 'permission' then 'استئذان'
 when 'overtime' then 'خارج دوام' when 'remote-work' then 'عمل عن بُعد' when 'expenses' then 'تعويض مصروفات العمل'
 when 'advance' then 'سلفة' when 'letter' then 'خطاب أو شهادة' when 'payroll-review' then 'استفسار مالي'
 when 'attendance-correction' then 'تصحيح حضور' else 'طلب إداري' end;
 details:='الموظفة: '||coalesce(employee_name,'—')||E'\nنوع الطلب: '||request_kind||E'\nالطلب: '||new.title;
 if new.starts_at is not null then
  details:=details||E'\nالفترة: '||to_char(new.starts_at at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI')
   ||' — '||to_char(new.ends_at at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI')||' (الرياض)';
 end if;
 if new.amount is not null then details:=details||E'\nالمبلغ: '||new.amount||' ر.س';end if;
 if TG_OP='INSERT' then
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
  select id,'employee_request','طلب '||request_kind||' جديد · '||coalesce(employee_name,'الموظفة'),details||E'\nالمطلوب: مراجعة الطلب واتخاذ القرار',
   '/admin/workforce/approvals?request='||new.id,'employee-request:'||new.id
  from public.profiles where role='admin' on conflict(recipient_id,event_key) do nothing;
 elsif new.status is distinct from old.status then
  if new.status='cancelled' then
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   select id,'employee_request','أُلغي طلب '||request_kind||' · '||coalesce(employee_name,'الموظفة'),details,
    '/admin/workforce/approvals?request='||new.id,'employee-request:'||new.id||':cancelled'
   from public.profiles where role='admin' on conflict(recipient_id,event_key) do nothing;
  else
   select user_id into recipient from public.wf_employees where id=new.employee_id and status='active';
   if recipient is not null then
    insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
    values(recipient,'employee_request',case when new.status='approved' then 'تم اعتماد طلب ' else 'لم يُعتمد طلب ' end||request_kind,
     details||case when nullif(btrim(new.decision_reason),'') is null then '' else E'\nسبب القرار: '||new.decision_reason end,
     '/employee/requests/history?request='||new.id,'employee-request:'||new.id||':'||new.status)
    on conflict(recipient_id,event_key) do nothing;
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function workforce_private.notify_employee_request() from public,anon,authenticated;

create or replace function workforce_private.notify_task_attachment() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
 select p.id,'attachment','أضيف مرفق إلى مهمة',t.title||E'\nالملف: '||new.filename,t.id,
 case when p.role='admin' then '/admin/workforce/tasks/' else '/employee/work/tasks/' end||t.id||'?panel=files','attachment:'||new.id
 from public.wf_tasks t join public.profiles p on p.role='admin' or exists(select 1 from public.wf_employees e where e.user_id=p.id and (e.id=t.assignee_id or e.id=any(t.co_assignee_ids)) and e.status='active')
 where t.id=new.task_id and p.id<>new.created_by and workforce_private.notification_recipient_active(p.id)
 on conflict(recipient_id,event_key) do nothing;
 return new;
end $$;

create or replace function workforce_private.notify_task_comment() returns trigger
language plpgsql set search_path='' as $$
declare task public.wf_tasks;
begin
  select * into task from public.wf_tasks where id=new.task_id;
  insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
  select p.id,'comment','تعليق جديد على مهمة',task.title||E'\nالتعليق: '||new.body,task.id,
    case when p.role='admin' then '/admin/workforce/tasks/' else '/employee/work/tasks/' end||task.id,'comment:'||new.id
  from public.profiles p where p.id<>new.author_id and (p.role='admin' or exists(
    select 1 from public.wf_employees e where e.user_id=p.id and (e.id=task.assignee_id or e.id=any(task.co_assignee_ids)) and e.status='active'));
  return new;
end $$;

revoke all on function workforce_private.notify_task_comment() from public,anon,authenticated;

create or replace function workforce_private.notify_task_operational_change() returns trigger
language plpgsql security invoker set search_path='' as $$
declare heading text; employee_user uuid; assignee text; old_state text; new_state text; message text;
begin
 if new.blocked_reason is distinct from old.blocked_reason then heading:=case when new.blocked_reason='' then 'أزيل عائق مهمة' else 'مهمة متوقفة تحتاج متابعة' end;
 elsif new.archived_at is distinct from old.archived_at then heading:=case when new.archived_at is null then 'استعيدت مهمة من الأرشيف' else 'أرشفت مهمة' end;
 elsif new.column_id is distinct from old.column_id then heading:='تغيرت حالة مهمة';
 elsif new.priority is distinct from old.priority then heading:='تغيرت أولوية مهمة';
 else return new; end if;
 select coalesce(e.full_name,a.display_name,'غير مسندة'),e.user_id into assignee,employee_user
 from public.wf_tasks t left join public.wf_employees e on e.id=t.assignee_id and e.status='active'
 left join public.wf_task_assignment_admins a on a.user_id=t.assignee_admin_id where t.id=new.id;
 message:=new.title;
 if new.blocked_reason is distinct from old.blocked_reason and new.blocked_reason<>'' then
  message:=message||E'\nالعائق: '||new.blocked_reason;
 elsif new.priority is distinct from old.priority then
  message:=message||E'\nالأولوية: '||case new.priority when 'urgent' then 'عاجلة' when 'high' then 'مرتفعة' when 'low' then 'منخفضة' else 'عادية' end;
 end if;
 if new.column_id is distinct from old.column_id then
  select title into old_state from public.wf_task_columns where id=old.column_id;
  select title into new_state from public.wf_task_columns where id=new.column_id;
  message:=new.title||chr(10)||'المسؤول: '||assignee||chr(10)||'الحالة السابقة: '||coalesce(old_state,'—')||chr(10)||'الحالة الجديدة: '||coalesce(new_state,'—');
 end if;
 insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
 select p.id,'task_activity',heading,message,new.id,case when p.role='admin' then '/admin/workforce/tasks/' else '/employee/work/tasks/' end||new.id,'task-activity:'||new.id||':'||new.version
 from public.profiles p where p.id<>new.updated_by and workforce_private.notification_recipient_active(p.id)
 and ((p.role='admin' and (new.column_id is distinct from old.column_id or new.blocked_reason is distinct from old.blocked_reason))
 or (p.id=employee_user and new.column_id is not distinct from old.column_id))
 and not exists(select 1 from public.wf_task_columns c where c.id=new.column_id and c.kind='review' and new.column_id is distinct from old.column_id)
 on conflict(recipient_id,event_key) do nothing;
 return new;
end $$;

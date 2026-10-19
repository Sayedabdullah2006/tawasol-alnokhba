-- Operational notices run before owner notices and share the same deduplication key.
-- Capture the full transition in that first notice and its immutable email snapshot.
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

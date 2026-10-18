create function workforce_private.notify_profile_request() returns trigger language plpgsql set search_path='' as $$
declare recipient uuid;
begin
 if TG_OP='INSERT' then
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
  select id,'profile_request','طلب تعديل بيانات موظفة','بانتظار القرار','/admin/workforce/approvals?tab=profile','profile-request:'||new.id from public.profiles where role='admin';
 elsif new.status is distinct from old.status and new.status in ('approved','rejected') then
  select user_id into recipient from public.wf_employees where id=new.employee_id and status='active';
  if recipient is not null then
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   values(recipient,'profile_request',case when new.status='approved' then 'تم اعتماد تعديل بياناتك' else 'تم رفض تعديل بياناتك' end,'','/employee/requests/profile-change','profile-request:'||new.id||':'||new.status);
  end if;
 end if;
 return new;
end $$;
create trigger wf_profile_request_notifications after insert or update on public.wf_profile_change_requests for each row execute function workforce_private.notify_profile_request();
create function workforce_private.notify_previous_assignee() returns trigger language plpgsql set search_path='' as $$
declare recipient uuid;
begin
 select user_id into recipient from public.wf_employees where id=old.assignee_id and status='active';
 if recipient is not null then
  insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
  values(recipient,'reassigned','أُعيد إسناد المهمة',new.title,new.id,'/employee/work/tasks/'||new.id,'task-reassigned:'||new.id||':'||new.version)
  on conflict(recipient_id,event_key) do nothing;
 end if;
 return new;
end $$;
create trigger wf_previous_assignee_notification after update of assignee_id on public.wf_tasks for each row when(old.assignee_id is not null and old.assignee_id is distinct from new.assignee_id) execute function workforce_private.notify_previous_assignee();

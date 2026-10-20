-- Upload and optional notifications commit together; all RPCs remain server-only.
create function public.wf_knowledge_file_notify(p_actor uuid,p_file uuid,p_recipients uuid[] default '{}',p_message text default '') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item public.wf_knowledge_files; recipient uuid; notice uuid; added integer:=0; sender text; folder_name text;
begin
 perform workforce_private.assert_task_actor(p_actor);
 if p_recipients is null or cardinality(p_recipients)>100 or array_position(p_recipients,null) is not null
  or p_message is null or length(p_message)>5000 then raise sqlstate 'PT400' using message='بيانات الإشعار غير صحيحة';end if;
 select * into item from public.wf_knowledge_files where id=p_file and deleted_at is null for share;
 if not found or item.task_attachment_id is not null then raise sqlstate 'PT404' using message='الملف غير متاح';end if;
 if item.created_by<>p_actor and not exists(select 1 from public.profiles where id=p_actor and role='admin') then
  raise sqlstate 'PT403' using message='لا يمكنك إرسال إشعار بهذا الملف';end if;
 select name into folder_name from public.wf_knowledge_folders where id=item.folder_id and deleted_at is null;
 if not found then raise sqlstate 'PT404' using message='المجلد غير متاح';end if;
 if exists(select 1 from unnest(p_recipients) r(id) where not exists(
  select 1 from public.wf_employees e join public.profiles p on p.id=e.user_id
  where e.user_id=r.id and e.status='active' and p.role='employee' and workforce_private.notification_recipient_active(r.id))) then
  raise sqlstate 'PT400' using message='إحدى المستلمات غير متاحة';end if;
 -- Silent test runs suppress both inbox and mail; no real upload creates test notices.
 if exists(select 1 from workforce_private.test_runs where ended_at is null and expires_at>now() and p_actor=any(participants)) then
  return jsonb_build_object('created',0,'suppressed',true);end if;
 select coalesce(e.full_name,p.full_name,'عضو الفريق') into sender from public.profiles p
  left join public.wf_employees e on e.user_id=p.id where p.id=p_actor;
 for recipient in select distinct id from unnest(p_recipients) r(id) loop
  if exists(select 1 from workforce_private.test_runs where ended_at is null and expires_at>now() and recipient=any(participants)) then continue;end if;
  notice:=null;
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
  values(recipient,'knowledge_file',left('ملف جديد في مركز المعرفة: '||item.title,200),
   'الملف: '||item.title||E'\nالمجلد: '||folder_name||E'\nأضافه: '||sender||
    case when btrim(p_message)<>'' then E'\n\nرسالة لك:\n'||btrim(p_message) else '' end,
   '/employee/knowledge?all=true&file='||item.id,'knowledge-file:'||item.id)
  on conflict(recipient_id,event_key) do nothing returning id into notice;
  if notice is not null then added:=added+1;end if;
 end loop;
 return jsonb_build_object('created',added);
end $$;
revoke all on function public.wf_knowledge_file_notify(uuid,uuid,uuid[],text) from public,anon,authenticated;
grant execute on function public.wf_knowledge_file_notify(uuid,uuid,uuid[],text) to service_role;

create function public.wf_knowledge_file_create_notified(p_actor uuid,p_id uuid,p_folder uuid,p_title text,p_filename text,p_mime text,p_size integer,p_path text,p_sha256 text,p_recipients uuid[] default '{}',p_message text default '') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 result:=public.wf_knowledge_file_create(p_actor,p_id,p_folder,p_title,p_filename,p_mime,p_size,p_path,p_sha256);
 perform public.wf_knowledge_file_notify(p_actor,p_id,p_recipients,p_message);
 return result;
end $$;
revoke all on function public.wf_knowledge_file_create_notified(uuid,uuid,uuid,text,text,text,integer,text,text,uuid[],text) from public,anon,authenticated;
grant execute on function public.wf_knowledge_file_create_notified(uuid,uuid,uuid,text,text,text,integer,text,text,uuid[],text) to service_role;

create or replace function workforce_private.notification_group(p_kind text) returns text
language sql immutable set search_path='' as $$
 select case when p_kind='knowledge_file' then 'knowledge' when p_kind='weekly_report' then 'weekly_reports'
 when p_kind in ('due_24h','due_2h','overdue','approval_digest','admin_digest','document_expiry','contract_expiry','attendance_missing','attendance_reminder','attendance_missing_admin') then 'reminders'
 when p_kind='payroll' then 'finance' when p_kind in ('employee_request','profile_request') then 'requests'
 when p_kind in ('hr','attendance_in','attendance_out') then 'hr' else 'tasks' end;
$$;

begin;
set local role service_role;
do $$
#variable_conflict use_variable
declare owner uuid; employee uuid; colleague uuid; employee_id uuid; company uuid; client uuid; folder uuid:=gen_random_uuid(); nested uuid:=gen_random_uuid(); file_id uuid:=gen_random_uuid(); task_id uuid:=gen_random_uuid(); attachment_id uuid:=gen_random_uuid(); source_id uuid; v integer; first_result jsonb;
begin
 select user_id into strict owner from public.wf_task_assignment_admins limit 1;
 select user_id,id into strict employee,employee_id from public.wf_employees where status='active' and can_manage_tasks limit 1;
 select user_id into strict colleague from public.wf_employees where status='active' and not can_manage_tasks limit 1;
 select id into strict company from public.wf_knowledge_folders where system_key='company';
 select id into strict client from public.wf_knowledge_folders where name='أول سعودي' and parent_id=(select id from public.wf_knowledge_folders where system_key='clients');
 perform public.wf_knowledge_command(employee,folder,null,'folder_create',jsonb_build_object('parent_id',company,'name','اختبار داخل معاملة ملغاة'));
 perform public.wf_knowledge_command(employee,nested,null,'folder_create',jsonb_build_object('parent_id',folder,'name','فرعي'));
 first_result:=public.wf_knowledge_file_create(employee,file_id,folder,'عنوان اختبار','check.txt','text/plain',4,employee::text||'/'||file_id||'/test',repeat('a',64));
 if public.wf_knowledge_file_create(employee,file_id,folder,'عنوان اختبار','check.txt','text/plain',4,employee::text||'/'||file_id||'/other',repeat('a',64)) is distinct from first_result then raise exception 'Upload retry not idempotent'; end if;
 begin
  perform public.wf_knowledge_command(colleague,file_id,1,'file_trash','{}');raise exception 'Colleague deleted another uploader file';
 exception when insufficient_privilege then null;end;
 begin
  perform public.wf_knowledge_command(colleague,file_id,1,'file_edit','{"title":"غير مسموح"}');raise exception 'Colleague renamed another uploader file';
 exception when insufficient_privilege then null;end;
 begin
  perform public.wf_knowledge_command(employee,folder,1,'folder_move',jsonb_build_object('parent_id',client));raise exception 'Employee reorganized admin folders';
 exception when insufficient_privilege then null;end;
 begin
  perform public.wf_knowledge_command(owner,folder,1,'folder_move',jsonb_build_object('parent_id',nested));raise exception 'Folder cycle accepted';
 exception when sqlstate 'PT409' then null;end;
 perform public.wf_knowledge_command(owner,file_id,1,'file_move',jsonb_build_object('folder_id',client));
 perform public.wf_knowledge_command(owner,file_id,2,'file_edit','{"title":"عنوان من المدير"}');
 perform public.wf_knowledge_command(employee,file_id,3,'file_trash','{}');
 if not exists(select 1 from public.wf_knowledge_files where id=file_id and deleted_at is not null) then raise exception 'Trash failed';end if;
 perform set_config('workforce.test.file',file_id::text,true);perform set_config('workforce.test.employee',employee::text,true);perform set_config('workforce.test.colleague',colleague::text,true);
 perform public.wf_task_command(owner,task_id,null,'create',jsonb_build_object('title','اختبار فهرسة مرفق','client_name','أول سعودي','assignee_id',employee_id,'requires_approval',true),gen_random_uuid());
 perform public.wf_attachment_command(employee,attachment_id,task_id,'add',jsonb_build_object('title','مرفق اختبار','filename','check.txt','object_path',task_id::text||'/test','mime_type','text/plain','size_bytes',4,'sha256',repeat('b',64),'purpose','task'));
 select id into strict source_id from public.wf_knowledge_files where task_attachment_id=attachment_id;
 if not exists(select 1 from public.wf_knowledge_files f join public.wf_knowledge_folders d on d.id=f.folder_id where f.id=source_id and d.name='ملفات التنفيذ' and d.parent_id=client) then raise exception 'Task attachment client archive failed';end if;
 select version into v from public.wf_knowledge_files where id=source_id;
 perform public.wf_knowledge_command(owner,source_id,v,'file_move',jsonb_build_object('folder_id',company));
 select version into v from public.wf_knowledge_files where id=source_id;
 perform public.wf_knowledge_command(employee,source_id,v,'file_trash','{}');
 if not exists(select 1 from public.wf_task_attachments where id=attachment_id and archived_at is not null) then raise exception 'Task and knowledge trash not synchronized';end if;
 select version into v from public.wf_knowledge_files where id=source_id;
 perform public.wf_knowledge_command(employee,source_id,v,'file_restore','{}');
 if not exists(select 1 from public.wf_knowledge_files where id=source_id and folder_id=company and deleted_at is null) then raise exception 'Restore lost chosen folder';end if;
 select version into v from public.wf_tasks where id=task_id;
 perform public.wf_task_command(employee,task_id,v,'submit',jsonb_build_object('summary','تسليم اختبار','attachment_ids',jsonb_build_array(attachment_id)),gen_random_uuid());
 select version into v from public.wf_knowledge_files where id=source_id;
 begin
  perform public.wf_knowledge_command(owner,source_id,v,'file_trash','{}');raise exception 'Sealed submission file removed';
 exception when sqlstate 'PT409' then null;end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('workforce.test.colleague'),true);
do $$begin
 if exists(select 1 from public.wf_knowledge_files where id=current_setting('workforce.test.file')::uuid) then raise exception 'Peer can read uploader trash';end if;
 begin update public.wf_knowledge_files set title='غير مسموح' where id=current_setting('workforce.test.file')::uuid;raise exception 'Direct file update allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('workforce.test.employee'),true);
do $$begin
 if not exists(select 1 from public.wf_knowledge_files where id=current_setting('workforce.test.file')::uuid) then raise exception 'Uploader cannot see own trash';end if;
end $$;
rollback;
select 'PASS: upload retry, folder creation, ownership, admin moves, cycle prevention, trash privacy, source sync and sealed submissions; all fixtures rolled back' as verification;

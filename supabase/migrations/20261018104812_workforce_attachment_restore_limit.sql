create or replace function public.wf_attachment_command(p_actor uuid,p_id uuid,p_task uuid,p_command text,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare employee uuid; task public.wf_tasks; board public.wf_boards; file public.wf_task_attachments; kind text;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,74125));
 select b.* into board from public.wf_boards b join public.wf_tasks t on t.board_id=b.id where t.id=p_task for update of b;
 select * into task from public.wf_tasks where id=p_task for update;
 if not found then raise exception 'المهمة غير متاحة' using errcode='P0002'; end if;
 if employee is not null and task.assignee_id is distinct from employee then raise exception 'يمكنك الإرفاق على مهامك فقط' using errcode='42501'; end if;
 select * into file from public.wf_task_attachments where id=p_id;
 if p_command='add' and file.id is not null then
   if file.task_id<>p_task or file.created_by<>p_actor or file.sha256 is distinct from p_payload->>'sha256'
    or file.filename is distinct from p_payload->>'filename' or file.title is distinct from p_payload->>'title'
    or file.purpose is distinct from p_payload->>'purpose' then
    raise exception 'مفتاح الرفع مستخدم لملف آخر' using errcode='PT409'; end if;
   return jsonb_build_object('id',file.id,'object_path',file.object_path);
 end if;
 select c.kind into kind from public.wf_task_columns c where c.id=task.column_id;
 if board.archived_at is not null or task.archived_at is not null or kind in ('review','done') then
   raise exception 'المرفقات للقراءة أثناء المراجعة أو الإكمال أو الأرشفة' using errcode='PT409'; end if;
 if p_command='add' then
   if (select count(*) from public.wf_task_attachments where task_id=p_task and archived_at is null)>=100 then
     raise exception 'الحد الأقصى 100 مرفق نشط للمهمة' using errcode='PT409'; end if;
   if p_payload->>'object_path' not like p_task::text||'/%' or p_payload->>'sha256' is null then
     raise exception 'بيانات الملف غير صحيحة' using errcode='PT400'; end if;
   insert into public.wf_task_attachments(id,task_id,title,filename,object_path,mime_type,size_bytes,created_by,sha256,purpose)
   values(p_id,p_task,p_payload->>'title',p_payload->>'filename',p_payload->>'object_path',p_payload->>'mime_type',
   (p_payload->>'size_bytes')::integer,p_actor,p_payload->>'sha256',p_payload->>'purpose') returning * into file;
 elsif p_command in ('archive','restore') then
   if file.id is null or file.task_id<>p_task then raise exception 'المرفق غير متاح' using errcode='P0002'; end if;
   if employee is not null and file.created_by<>p_actor then raise exception 'يمكنك إدارة مرفقاتك فقط' using errcode='42501'; end if;
   if exists(select 1 from public.wf_submission_attachments where attachment_id=p_id) then
     raise exception 'مرفق التسليم محفوظ مع المحاولة ولا يمكن إخفاؤه أو استبداله' using errcode='PT409'; end if;
   if (file.archived_at is not null)=(p_command='archive') then return jsonb_build_object('id',p_id); end if;
   if p_command='restore' and (select count(*) from public.wf_task_attachments where task_id=p_task and archived_at is null)>=100 then
     raise exception 'الحد الأقصى 100 مرفق نشط للمهمة' using errcode='PT409'; end if;
   update public.wf_task_attachments set archived_at=case when p_command='archive' then now() else null end where id=p_id;
 else raise exception 'إجراء غير صحيح' using errcode='PT400'; end if;
 insert into public.wf_task_events(task_id,actor_id,action,changed_fields,summary)
 values(p_task,p_actor,'attachment:'||p_command,array['attachments'],file.title);
 return jsonb_build_object('id',p_id,'object_path',file.object_path);
end $$;

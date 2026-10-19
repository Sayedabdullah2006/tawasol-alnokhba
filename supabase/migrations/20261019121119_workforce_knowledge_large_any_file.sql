-- Shared knowledge storage accepts all file formats, up to 50 MiB per object.
-- Bucket remains private; existing uploader/admin ownership rules are unchanged.
update storage.buckets set file_size_limit=52428800,allowed_mime_types=null
where id='workforce-knowledge-files';
alter table public.wf_knowledge_files drop constraint wf_knowledge_files_size_bytes_check;
alter table public.wf_knowledge_files add constraint wf_knowledge_files_size_bytes_check
 check(size_bytes between 1 and 52428800);

create or replace function public.wf_knowledge_file_create(p_actor uuid,p_id uuid,p_folder uuid,p_title text,p_filename text,p_mime text,p_size integer,p_path text,p_sha256 text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare previous public.wf_knowledge_files;
begin
 perform workforce_private.assert_task_actor(p_actor);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,74141));
 select * into previous from public.wf_knowledge_files where id=p_id;
 if found then
  if previous.created_by<>p_actor or previous.sha256 is distinct from p_sha256 or previous.folder_id<>p_folder or previous.filename<>p_filename or previous.title<>p_title or previous.task_attachment_id is not null then raise exception 'مفتاح الرفع مستخدم لملف آخر' using errcode='PT409'; end if;
  return jsonb_build_object('id',p_id,'object_path',previous.object_path);
 end if;
 perform 1 from public.wf_knowledge_folders where id=p_folder and deleted_at is null for share;
 if not found then raise exception 'المجلد غير متاح' using errcode='P0002'; end if;
 if p_path not like p_actor::text||'/'||p_id::text||'/%' or p_sha256 is null
  or p_mime is null or length(p_mime)>200
  or p_mime !~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'
  or p_size is null or p_size not between 1 and 52428800
 then raise exception 'بيانات الملف غير صحيحة أو حجمه يتجاوز 50 ميجابايت' using errcode='PT400'; end if;
 insert into public.wf_knowledge_files(id,folder_id,title,filename,mime_type,size_bytes,bucket,object_path,sha256,created_by,updated_by)
 values(p_id,p_folder,btrim(p_title),p_filename,p_mime,p_size,'workforce-knowledge-files',p_path,p_sha256,p_actor,p_actor);
 insert into public.wf_knowledge_events(item_id,actor_id,action) values(p_id,p_actor,'file:upload');
 return jsonb_build_object('id',p_id,'object_path',p_path);
end $$;


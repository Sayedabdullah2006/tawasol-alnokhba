-- Shared work documents only. HR, bank, salary and contract storage is never indexed.
create table public.wf_knowledge_folders (
 id uuid primary key default gen_random_uuid(), parent_id uuid references public.wf_knowledge_folders(id) on delete restrict,
 name text not null check(length(btrim(name)) between 1 and 150), system_key text unique,
 created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
 version integer not null default 1, deleted_at timestamptz, check(id is distinct from parent_id)
);
create unique index wf_knowledge_folder_names on public.wf_knowledge_folders(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name)) where deleted_at is null;
create index wf_knowledge_folder_parent on public.wf_knowledge_folders(parent_id) where deleted_at is null;
create table public.wf_knowledge_files (
 id uuid primary key default gen_random_uuid(), folder_id uuid not null references public.wf_knowledge_folders(id) on delete restrict,
 title text not null check(length(btrim(title)) between 1 and 250), filename text not null check(length(filename) between 1 and 200),
 mime_type text not null, size_bytes integer not null check(size_bytes between 1 and 4194304),
 bucket text not null check(bucket in ('workforce-knowledge-files','workforce-task-files')), object_path text not null,
 sha256 text check(sha256 ~ '^[a-f0-9]{64}$'), task_attachment_id uuid unique references public.wf_task_attachments(id) on delete restrict,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 updated_by uuid not null references public.profiles(id), updated_at timestamptz not null default now(), version integer not null default 1,
 deleted_at timestamptz, unique(bucket,object_path)
);
create index wf_knowledge_files_folder_date on public.wf_knowledge_files(folder_id,created_at desc,id);
create index wf_knowledge_files_creator_date on public.wf_knowledge_files(created_by,created_at desc,id);
create table public.wf_knowledge_events (
 id bigint generated always as identity primary key, item_id uuid not null, actor_id uuid references public.profiles(id),
 action text not null, created_at timestamptz not null default now()
);
alter table public.wf_knowledge_folders enable row level security;
alter table public.wf_knowledge_files enable row level security;
alter table public.wf_knowledge_events enable row level security;
revoke all on public.wf_knowledge_folders,public.wf_knowledge_files,public.wf_knowledge_events from public,anon,authenticated;
grant select on public.wf_knowledge_folders,public.wf_knowledge_files to authenticated;
grant select,insert,update,delete on public.wf_knowledge_folders,public.wf_knowledge_files,public.wf_knowledge_events to service_role;
grant usage,select on sequence public.wf_knowledge_events_id_seq to service_role;
create policy wf_knowledge_folders_read on public.wf_knowledge_folders for select to authenticated using(deleted_at is null and ((select workforce_private.is_admin()) or (select workforce_private.employee_id()) is not null));
create policy wf_knowledge_files_read on public.wf_knowledge_files for select to authenticated using(
 ((select workforce_private.is_admin()) or (select workforce_private.employee_id()) is not null)
 and (deleted_at is null or created_by=(select auth.uid()) or (select workforce_private.is_admin())));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('workforce-knowledge-files','workforce-knowledge-files',false,4194304,array['application/pdf','image/png','image/jpeg','image/webp','application/zip','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation']);

-- Deterministic structure, generated identifiers; new clients get their own folder automatically.
insert into public.wf_knowledge_folders(name,system_key) values ('الشركة','company'),('العملاء','clients'),('الموظفون','staff'),('القوالب والأدلة','templates');
insert into public.wf_knowledge_folders(parent_id,name)
select f.id,n.name from public.wf_knowledge_folders f cross join lateral unnest(case f.system_key
 when 'company' then array['الاستراتيجية وخطط التطوير','بروفايل الشركة والهوية','الخدمات والأعمال السابقة','السياسات وإجراءات العمل','مرفقات المهام']
 when 'clients' then array['أول سعودي','بلاتفورم','العملاء المحتملون']
 when 'templates' then array['قوالب العروض والبروفايلات','قوالب المحتوى والتقارير','الأدلة والتدريب'] else array[]::text[] end) n(name);
insert into public.wf_knowledge_folders(parent_id,name)
select f.id,n.name from public.wf_knowledge_folders f cross join lateral unnest(case f.name
 when 'أول سعودي' then array['الخطط والمحتوى والنشر','المعلنين والحملات','ملفات التنفيذ','التسليمات والتقارير']
 when 'بلاتفورم' then array['المتطلبات وخطط العمل','التصاميم والتطوير','الاختبارات والملاحظات','ملفات التنفيذ','التسليمات والتقارير'] else array[]::text[] end) n(name)
where f.parent_id=(select id from public.wf_knowledge_folders where system_key='clients');
insert into public.wf_knowledge_folders(parent_id,name)
select f.id,e.full_name from public.wf_employees e cross join public.wf_knowledge_folders f where f.system_key='staff' and e.status='active';

create function workforce_private.knowledge_task_folder(p_client text,p_delivery boolean,p_actor uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare parent uuid; child uuid; label text;
begin
 perform pg_advisory_xact_lock(74122,41);
 if coalesce(btrim(p_client),'') in ('','تطوير الشركة') then
  select id into parent from public.wf_knowledge_folders where system_key='company'; label:='مرفقات المهام';
 else
  select f.id into parent from public.wf_knowledge_folders f where f.parent_id=(select id from public.wf_knowledge_folders where system_key='clients') and lower(f.name)=lower(btrim(p_client)) and f.deleted_at is null;
  if parent is null then
   insert into public.wf_knowledge_folders(parent_id,name,created_by) values((select id from public.wf_knowledge_folders where system_key='clients'),btrim(p_client),p_actor) returning id into parent;
  end if;
  label:=case when p_delivery then 'التسليمات والتقارير' else 'ملفات التنفيذ' end;
 end if;
 select id into child from public.wf_knowledge_folders where parent_id=parent and name=label and deleted_at is null;
 if child is null then insert into public.wf_knowledge_folders(parent_id,name,created_by) values(parent,label,p_actor) returning id into child; end if;
 return child;
end $$;
create function workforce_private.index_task_attachment() returns trigger
language plpgsql security invoker set search_path='' as $$
declare client text; destination uuid;
begin
 if TG_OP='INSERT' then
  select client_name into client from public.wf_tasks where id=new.task_id;
  destination:=workforce_private.knowledge_task_folder(client,new.purpose='delivery',new.created_by);
  insert into public.wf_knowledge_files(folder_id,title,filename,mime_type,size_bytes,bucket,object_path,sha256,task_attachment_id,created_by,updated_by,created_at,deleted_at)
  values(destination,new.title,new.filename,new.mime_type,new.size_bytes,'workforce-task-files',new.object_path,new.sha256,new.id,new.created_by,new.created_by,new.created_at,new.archived_at);
 else
  update public.wf_knowledge_files set title=case when new.title is distinct from old.title then new.title else title end,
   deleted_at=new.archived_at,version=version+1,updated_at=now() where task_attachment_id=new.id;
 end if;
 return new;
end $$;
create trigger wf_knowledge_attachment_index after insert or update of title,archived_at on public.wf_task_attachments for each row execute function workforce_private.index_task_attachment();
revoke all on function workforce_private.knowledge_task_folder(text,boolean,uuid),workforce_private.index_task_attachment() from public,anon,authenticated;
grant execute on function workforce_private.knowledge_task_folder(text,boolean,uuid),workforce_private.index_task_attachment() to service_role;
insert into public.wf_knowledge_files(folder_id,title,filename,mime_type,size_bytes,bucket,object_path,sha256,task_attachment_id,created_by,updated_by,created_at,deleted_at)
select workforce_private.knowledge_task_folder(t.client_name,a.purpose='delivery',a.created_by),a.title,a.filename,a.mime_type,a.size_bytes,'workforce-task-files',a.object_path,a.sha256,a.id,a.created_by,a.created_by,a.created_at,a.archived_at
from public.wf_task_attachments a join public.wf_tasks t on t.id=a.task_id on conflict(task_attachment_id) do nothing;

create function public.wf_knowledge_file_create(p_actor uuid,p_id uuid,p_folder uuid,p_title text,p_filename text,p_mime text,p_size integer,p_path text,p_sha256 text) returns jsonb
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
 if p_path not like p_actor::text||'/'||p_id::text||'/%' or p_sha256 is null or p_mime<>all(array['application/pdf','image/png','image/jpeg','image/webp','application/zip','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation']) then raise exception 'بيانات الملف غير صحيحة' using errcode='PT400'; end if;
 insert into public.wf_knowledge_files(id,folder_id,title,filename,mime_type,size_bytes,bucket,object_path,sha256,created_by,updated_by)
 values(p_id,p_folder,btrim(p_title),p_filename,p_mime,p_size,'workforce-knowledge-files',p_path,p_sha256,p_actor,p_actor);
 insert into public.wf_knowledge_events(item_id,actor_id,action) values(p_id,p_actor,'file:upload');
 return jsonb_build_object('id',p_id,'object_path',p_path);
end $$;

create function public.wf_knowledge_command(p_actor uuid,p_id uuid,p_version integer,p_command text,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare employee uuid; folder public.wf_knowledge_folders; file public.wf_knowledge_files; parent uuid; title text; field text; allowed text[];
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 allowed:=case p_command when 'folder_create' then array['parent_id','name'] when 'folder_edit' then array['name'] when 'folder_move' then array['parent_id'] when 'folder_delete' then array[]::text[] when 'file_edit' then array['title'] when 'file_move' then array['folder_id'] when 'file_trash' then array[]::text[] when 'file_restore' then array[]::text[] else null end;
 if allowed is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'إجراء غير صحيح' using errcode='PT400'; end if;
 for field in select jsonb_object_keys(p_payload) loop if not(field=any(allowed)) then raise exception 'حقل غير مسموح' using errcode='PT400'; end if; end loop;
 if p_command like 'folder_%' then
  perform pg_advisory_xact_lock(74122,41);
  if p_command='folder_create' then
   parent:=nullif(p_payload->>'parent_id','')::uuid;
   if parent is null and employee is not null then raise exception 'إنشاء قسم رئيسي للمدير فقط' using errcode='42501'; end if;
   if parent is not null then perform 1 from public.wf_knowledge_folders where id=parent and deleted_at is null for share; if not found then raise exception 'المجلد غير متاح' using errcode='P0002'; end if; end if;
   insert into public.wf_knowledge_folders(id,parent_id,name,created_by) values(p_id,parent,btrim(p_payload->>'name'),p_actor);
  else
   if employee is not null then raise exception 'تنظيم المجلدات للمدير فقط' using errcode='42501'; end if;
   select * into folder from public.wf_knowledge_folders where id=p_id and deleted_at is null for update;
   if not found then raise exception 'المجلد غير متاح' using errcode='P0002'; end if;
   if folder.version is distinct from p_version then raise exception 'تغير المجلد؛ حدّث الصفحة' using errcode='PT409'; end if;
   if folder.system_key is not null then raise exception 'الأقسام الرئيسية ثابتة؛ نظم المجلدات داخلها' using errcode='PT409'; end if;
   if p_command='folder_delete' then
    if exists(select 1 from public.wf_knowledge_folders where parent_id=p_id and deleted_at is null) or exists(select 1 from public.wf_knowledge_files where folder_id=p_id) then raise exception 'انقل المحتويات قبل حذف المجلد' using errcode='PT409'; end if;
    update public.wf_knowledge_folders set deleted_at=now(),version=version+1 where id=p_id;
   elsif p_command='folder_edit' then update public.wf_knowledge_folders set name=btrim(p_payload->>'name'),version=version+1 where id=p_id;
   else
    parent:=nullif(p_payload->>'parent_id','')::uuid;
    if parent is not null then perform 1 from public.wf_knowledge_folders where id=parent and deleted_at is null for share; if not found then raise exception 'المجلد غير متاح' using errcode='P0002'; end if; end if;
    if exists(with recursive ancestors as(select id,parent_id from public.wf_knowledge_folders where id=parent union select f.id,f.parent_id from public.wf_knowledge_folders f join ancestors a on f.id=a.parent_id) select 1 from ancestors where id=p_id) then raise exception 'لا يمكن نقل المجلد إلى داخله أو داخل أحد فروعه' using errcode='PT409'; end if;
    update public.wf_knowledge_folders set parent_id=parent,version=version+1 where id=p_id;
   end if;
  end if;
 else
  select * into file from public.wf_knowledge_files where id=p_id;
  -- Match attachment commands' board -> task -> indexed file lock order.
  if file.task_attachment_id is not null and p_command in ('file_trash','file_restore') then
   perform 1 from public.wf_boards b join public.wf_tasks t on t.board_id=b.id join public.wf_task_attachments a on a.task_id=t.id where a.id=file.task_attachment_id for update of b;
   perform 1 from public.wf_tasks t join public.wf_task_attachments a on a.task_id=t.id where a.id=file.task_attachment_id for update of t;
  end if;
  select * into file from public.wf_knowledge_files where id=p_id for update;
  if not found then raise exception 'الملف غير متاح' using errcode='P0002'; end if;
  if employee is not null and file.created_by<>p_actor then raise exception 'يمكنك تعديل ملفاتك وحذفها فقط' using errcode='42501'; end if;
  if file.version is distinct from p_version then raise exception 'تغير الملف؛ حدّث الصفحة' using errcode='PT409'; end if;
  if file.deleted_at is not null and p_command<>'file_restore' then raise exception 'استعد الملف أولًا' using errcode='PT409'; end if;
  if p_command='file_move' then
   parent:=(p_payload->>'folder_id')::uuid;
   perform 1 from public.wf_knowledge_folders where id=parent and deleted_at is null for share;
   if not found then raise exception 'المجلد غير متاح' using errcode='P0002'; end if;
   update public.wf_knowledge_files set folder_id=parent,updated_by=p_actor,updated_at=now(),version=version+1 where id=p_id;
  elsif p_command='file_edit' then update public.wf_knowledge_files set title=btrim(p_payload->>'title'),updated_by=p_actor,updated_at=now(),version=version+1 where id=p_id;
  else
   if file.task_attachment_id is not null then
    perform public.wf_attachment_command(p_actor,file.task_attachment_id,(select task_id from public.wf_task_attachments where id=file.task_attachment_id),case when p_command='file_trash' then 'archive' else 'restore' end,'{}');
   else
    update public.wf_knowledge_files set deleted_at=case when p_command='file_trash' then now() else null end,updated_by=p_actor,updated_at=now(),version=version+1 where id=p_id;
   end if;
  end if;
 end if;
 insert into public.wf_knowledge_events(item_id,actor_id,action) values(p_id,p_actor,p_command);
 return jsonb_build_object('id',p_id);
end $$;
revoke all on function public.wf_knowledge_file_create(uuid,uuid,uuid,text,text,text,integer,text,text),public.wf_knowledge_command(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.wf_knowledge_file_create(uuid,uuid,uuid,text,text,text,integer,text,text),public.wf_knowledge_command(uuid,uuid,integer,text,jsonb) to service_role;

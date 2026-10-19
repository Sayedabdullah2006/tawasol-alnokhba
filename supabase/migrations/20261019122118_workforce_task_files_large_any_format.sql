-- Task reference files and delivery attachments share the same private bucket.
update storage.buckets set file_size_limit=52428800,allowed_mime_types=null
where id='workforce-task-files';
alter table public.wf_task_attachments drop constraint wf_task_attachments_size_bytes_check;
alter table public.wf_task_attachments add constraint wf_task_attachments_size_bytes_check
 check(size_bytes between 1 and 52428800);
alter table public.wf_task_attachments drop constraint wf_task_attachments_mime_type_check;
alter table public.wf_task_attachments add constraint wf_task_attachments_mime_type_check
 check(length(mime_type)<=200 and mime_type ~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$');

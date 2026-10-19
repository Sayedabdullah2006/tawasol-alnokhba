-- Scoped silent task runs inside an outer rollback: nothing reaches the UI/mail.
begin;
select set_config('workforce.notification_wake','1',true);
set local role service_role;
do $$
#variable_conflict use_variable
declare owner uuid; e record; peer uuid; run uuid; task_id uuid; attachment_id uuid;
 size integer; purpose text; mime text; payload jsonb; first_result jsonb; v integer;
 notices bigint; deliveries bigint; tested integer:=0;
begin
 select a.user_id into strict owner from public.wf_task_assignment_admins a
 join public.profiles p on p.id=a.user_id where p.role='admin' and workforce_private.notification_recipient_active(p.id) limit 1;
 select count(*) into notices from public.wf_notifications;
 select count(*) into deliveries from public.wf_notification_deliveries;
 run:=(public.wf_test_run('start',owner)->>'id')::uuid;
 for e in select staff.id,staff.user_id from public.wf_employees staff where staff.status='active' and staff.user_id is not null loop
  tested:=tested+1;
  select staff.user_id into strict peer from public.wf_employees staff where staff.status='active' and staff.user_id<>e.user_id limit 1;
  task_id:=gen_random_uuid();
  perform public.wf_test_task_command(run,owner,task_id,null,'create',jsonb_build_object('title','ضابط مرفقات داخل معاملة ملغاة','assignee_id',e.id,'requires_approval',true),gen_random_uuid());
  foreach size in array array[5*1024*1024,50*1024*1024] loop
   foreach purpose in array array['task','delivery'] loop
    foreach mime in array array['application/octet-stream','video/mp4','application/x-7z-compressed'] loop
     attachment_id:=gen_random_uuid();
     payload:=jsonb_build_object('title','مرفق داخل معاملة ملغاة','filename','document.unknown','mime_type',mime,'size_bytes',size,'sha256',repeat('a',64),'purpose',purpose,'object_path',task_id::text||'/'||attachment_id);
     begin
      perform public.wf_attachment_command(peer,attachment_id,task_id,'add',payload);
      raise exception 'Peer uploaded on another employee task';
     exception when insufficient_privilege then null;end;
     first_result:=public.wf_attachment_command(e.user_id,attachment_id,task_id,'add',payload);
     if public.wf_attachment_command(e.user_id,attachment_id,task_id,'add',payload) is distinct from first_result then raise exception 'Upload retry changed result';end if;
     if not exists(select 1 from public.wf_knowledge_files f where f.task_attachment_id=attachment_id and f.size_bytes=size and f.mime_type=mime and f.bucket='workforce-task-files') then raise exception 'Knowledge indexing missing for large/arbitrary file';end if;
    end loop;
   end loop;
  end loop;
  foreach size in array array[0,52428801] loop
   begin
    perform public.wf_attachment_command(e.user_id,gen_random_uuid(),task_id,'add',payload||jsonb_build_object('size_bytes',size));
    raise exception 'Invalid size accepted';
   exception when check_violation then null;end;
  end loop;
  select version into v from public.wf_tasks where id=task_id;
  perform public.wf_test_task_command(run,e.user_id,task_id,v,'submit',jsonb_build_object('summary','تسليم داخل معاملة ملغاة','attachment_ids',jsonb_build_array(attachment_id)),gen_random_uuid());
  if not exists(select 1 from public.wf_submission_attachments s where s.attachment_id=attachment_id) then raise exception 'Large delivery attachment not linked';end if;
  begin
   perform public.wf_attachment_command(e.user_id,attachment_id,task_id,'archive','{}');
   raise exception 'Submitted file could be removed';
  exception when sqlstate 'PT409' then null;end;
  select version into v from public.wf_tasks where id=task_id;
  perform public.wf_test_task_command(run,owner,task_id,v,'review','{"decision":"approved","reason":"ضابط داخل معاملة ملغاة"}',gen_random_uuid());
  begin
   perform public.wf_attachment_command(owner,attachment_id,task_id,'archive','{}');
   raise exception 'Approved file could be removed';
  exception when sqlstate 'PT409' then null;end;
 end loop;
 perform public.wf_test_run('finish',owner,run);
 if tested<>2 then raise exception 'Both staff not tested';end if;
 if (select count(*) from public.wf_notifications)<>notices or (select count(*) from public.wf_notification_deliveries)<>deliveries then raise exception 'Silent run leaked notifications';end if;
end $$;
rollback;
select 'PASS: both staff 5/50 MiB/all MIME task and delivery files, ownership, retries, knowledge archive, submit/approve and sealed files, zero/oversize rejection, silent runs; everything rolled back' result;

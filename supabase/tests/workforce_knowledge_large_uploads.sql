begin;
select set_config('workforce.notification_wake','1',true);
set local role service_role;
do $$
declare staff record; folder uuid; file_id uuid; size integer; mime text; count_staff integer:=0;
begin
 select id into strict folder from public.wf_knowledge_folders where system_key='company';
 for staff in select user_id from public.wf_employees where status='active' and user_id is not null loop
  count_staff:=count_staff+1;
  foreach size in array array[5*1024*1024,50*1024*1024] loop
   foreach mime in array array['application/octet-stream','video/mp4','application/x-7z-compressed','application/vnd.adobe.photoshop'] loop
    file_id:=gen_random_uuid();
    perform public.wf_knowledge_file_create(staff.user_id,file_id,folder,'ضابط معاملة ملغاة','document.unknown',mime,size,staff.user_id::text||'/'||file_id||'/object',repeat('a',64));
    if not exists(select 1 from public.wf_knowledge_files f where f.id=file_id and f.size_bytes=size and f.mime_type=mime) then raise exception 'Large/arbitrary format metadata rejected';end if;
   end loop;
  end loop;
  foreach size in array array[0,52428801] loop
   file_id:=gen_random_uuid();
   begin
    perform public.wf_knowledge_file_create(staff.user_id,file_id,folder,'ضابط معاملة ملغاة','document.unknown','application/octet-stream',size,staff.user_id::text||'/'||file_id||'/object',repeat('a',64));
    raise exception 'Invalid size accepted';
   exception when sqlstate 'PT400' then null;end;
  end loop;
 end loop;
 if count_staff<>2 then raise exception 'Expected both staff';end if;
end $$;
rollback;
select 'PASS: Noor/Monwa metadata 5/50 MiB and arbitrary MIME, zero/over-limit rejected; all rolled back, no notifications' as verification;

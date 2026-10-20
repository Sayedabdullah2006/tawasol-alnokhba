begin isolation level repeatable read;
-- No test transaction wakes the worker; the outbox and test file are rolled back.
select set_config('workforce.notification_wake','1',true);
do $$
declare owner_id uuid; staff_ids uuid[]; folder uuid; file_id uuid:=gen_random_uuid(); empty_id uuid:=gen_random_uuid(); invalid_id uuid:=gen_random_uuid();
 before_net integer; before_notices integer; result jsonb; run_id uuid; expected integer;
begin
 select p.id into strict owner_id from public.profiles p join auth.users u on u.id=p.id
  where p.role='admin' and lower(u.email)='admin@ksa-influencers.com';
 select array_agg(user_id) into staff_ids from public.wf_employees where status='active';
 if cardinality(staff_ids)<2 then raise exception 'Two active staff required';end if;
 select id into strict folder from public.wf_knowledge_folders where system_key='company' and deleted_at is null;
 select count(*) into before_net from net.http_request_queue;
 select count(*) into before_notices from public.wf_notifications where kind='knowledge_file';
 perform set_config('role','service_role',true);
 perform public.wf_knowledge_file_create_notified(owner_id,empty_id,folder,'ملف دون تنبيه','document.txt','text/plain',1,
  owner_id||'/'||empty_id||'/document',repeat('a',64),'{}','');
 if (select count(*) from public.wf_notifications where kind='knowledge_file')<>before_notices then raise exception 'Default upload sent notices';end if;
 perform public.wf_knowledge_file_create_notified(owner_id,file_id,folder,'دليل العمل','guide.txt','text/plain',1,
  owner_id||'/'||file_id||'/document',repeat('b',64),staff_ids,'يرجى الاطلاع');
 expected:=cardinality(staff_ids);
 if (select count(*) from public.wf_notifications where event_key='knowledge-file:'||file_id)<>expected then raise exception 'Missing recipients';end if;
 result:=public.wf_knowledge_file_notify(owner_id,file_id,staff_ids||staff_ids,'يرجى الاطلاع');
 if result->>'created'<>'0' then raise exception 'Retry duplicated notices';end if;
 if exists(select 1 from public.wf_notifications n where n.event_key='knowledge-file:'||file_id
   and (n.body not like '%يرجى الاطلاع%' or n.href<>'/employee/knowledge?all=true&file='||file_id)) then raise exception 'Incorrect body/link';end if;
 if (select count(*) from public.wf_notification_deliveries d join public.wf_notifications n on n.id=d.notification_id
   where n.event_key='knowledge-file:'||file_id and d.snapshot->>'body' like '%يرجى الاطلاع%')<>expected then raise exception 'Missing email snapshots';end if;
 begin
  perform public.wf_knowledge_file_notify(staff_ids[1],file_id,staff_ids,'');
  raise exception 'Non-uploader notified a private file';
 exception when sqlstate 'PT403' then null;end;
 begin
  perform public.wf_knowledge_file_create_notified(owner_id,invalid_id,folder,'مستلمة غير صحيحة','invalid.txt','text/plain',1,
   owner_id||'/'||invalid_id||'/document',repeat('c',64),array[owner_id],'');
  raise exception 'Invalid recipient accepted';
 exception when sqlstate 'PT400' then null;end;
 if exists(select 1 from public.wf_knowledge_files where id=invalid_id) then raise exception 'Failed notify left an uploaded row';end if;
 perform set_config('role','service_role',true);
 run_id:=(public.wf_test_run('start',owner_id)->>'id')::uuid;
 result:=public.wf_knowledge_file_notify(owner_id,empty_id,staff_ids,'');
 if result->>'suppressed'<>'true' or exists(select 1 from public.wf_notifications where event_key='knowledge-file:'||empty_id) then raise exception 'Silent mode failed';end if;
 perform set_config('role','none',true);
 if (select count(*) from net.http_request_queue)<>before_net then raise exception 'Worker was woken';end if;
 if has_function_privilege('authenticated','public.wf_knowledge_file_notify(uuid,uuid,uuid[],text)','execute')
  or has_function_privilege('anon','public.wf_knowledge_file_create_notified(uuid,uuid,uuid,text,text,text,integer,text,text,uuid[],text)','execute') then raise exception 'Unexpected RPC access';end if;
end $$;
rollback;

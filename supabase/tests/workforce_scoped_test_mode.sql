-- Control notices/outbox are visible only in this transaction; never committed or sent.
begin;
set local role service_role;
select set_config('workforce.notification_wake','1',true);
do $$
#variable_conflict use_variable
declare owner uuid; staff uuid; staff_user uuid; run uuid; other_run uuid; t uuid;
 fixture uuid:=gen_random_uuid(); overdue_fixture uuid:=gen_random_uuid(); pending_fixture uuid:=gen_random_uuid();
 real_task uuid:=gen_random_uuid(); real_request uuid:=gen_random_uuid(); test_request uuid:=gen_random_uuid(); attachment uuid:=gen_random_uuid(); v integer; n integer; col uuid;
begin
 select a.user_id into strict owner from public.wf_task_assignment_admins a join public.profiles p on p.id=a.user_id where p.role='admin' limit 1;
 select e.id,e.user_id into strict staff,staff_user from public.wf_employees e where status='active' order by id limit 1;
 run:=(public.wf_test_run('start',owner)->>'id')::uuid;
 begin perform public.wf_test_run('start',staff_user);raise exception 'Employee started a test run';exception when insufficient_privilege then null;end;
 perform public.wf_test_run('join',staff_user,run);
 other_run:=(public.wf_test_run('start',owner)->>'id')::uuid;
 update workforce_private.test_runs set participants=array[owner,null::uuid] where id=other_run;
 begin perform public.wf_test_run('join',staff_user,other_run);raise exception 'Nonparticipant joined through NULL membership';exception when insufficient_privilege then null;end;
 foreach t in array array[fixture,overdue_fixture,pending_fixture] loop
  perform public.wf_test_task_command(run,owner,t,null,'create',jsonb_build_object('title','WF-TEST: persisted quiet task','assignee_id',staff,'requires_approval',true,'due_at',now()-interval '2 days','completion_criteria','مرفق وملخص التسليم'),gen_random_uuid());
 end loop;
 if (select count(*) from public.wf_tasks where id=any(array[fixture,overdue_fixture,pending_fixture]) and test_run_id=run)<>3 then raise exception 'Marker missing';end if;
 insert into public.wf_task_attachments(id,task_id,title,filename,object_path,mime_type,size_bytes,created_by,sha256,purpose)
 values(attachment,fixture,'quiet.png','quiet.png','tasks/'||fixture||'/'||attachment,'image/png',50,staff_user,repeat('a',64),'delivery');
 select c.id into col from public.wf_task_columns c join public.wf_tasks t on t.board_id=c.board_id where t.id=fixture and c.kind='in_progress';
 select version into v from public.wf_tasks where id=fixture;
 perform public.wf_task_command(staff_user,fixture,v,'move',jsonb_build_object('column_id',col,'position',1024),gen_random_uuid());
 select version into v from public.wf_tasks where id=fixture;
 perform public.wf_task_command(staff_user,fixture,v,'submit',jsonb_build_object('summary','تسليم صامت بالمرفق','attachment_ids',jsonb_build_array(attachment)),gen_random_uuid());
 select version into v from public.wf_tasks where id=fixture;
 perform public.wf_task_command(owner,fixture,v,'review','{"decision":"changes","reason":"تعديل صامت مطلوب"}',gen_random_uuid());
 select version into v from public.wf_tasks where id=fixture;
 perform public.wf_task_command(staff_user,fixture,v,'submit',jsonb_build_object('summary','التسليم المعدل الصامت','attachment_ids',jsonb_build_array(attachment)),gen_random_uuid());
 select version into v from public.wf_tasks where id=fixture;
 perform public.wf_task_command(owner,fixture,v,'review','{"decision":"approved","reason":"اعتماد صامت"}',gen_random_uuid());
 select version into v from public.wf_tasks where id=pending_fixture;
 perform public.wf_task_command(staff_user,pending_fixture,v,'submit','{"summary":"معلق صامت لا يدخل الملخص"}',gen_random_uuid());
 update public.wf_task_submissions set created_at=now()-interval '2 days' where task_id=pending_fixture;
 insert into public.wf_employee_requests(id,employee_id,kind,title,body,fingerprint,test_run_id,created_at)
 values(test_request,staff,'general','WF-TEST: request','طلب اختبار صامت',test_request::text,run,now()-interval '2 days');
 perform public.wf_decide_employee_request(test_request,owner,1,'approved','اعتماد صامت');
 -- A second pending fixture exercises the request digest exclusion.
 insert into public.wf_employee_requests(id,employee_id,kind,title,body,fingerprint,test_run_id,created_at)
 values(gen_random_uuid(),staff,'general','WF-TEST: pending request','طلب اختبار صامت معلق',gen_random_uuid()::text,run,now()-interval '2 days');
 -- Real controls: ordinary notifications AND the mail outbox must still be populated.
 perform public.wf_task_command(owner,real_task,null,'create',jsonb_build_object('title','مهمة عمل عادية داخل معاملة ملغاة','assignee_id',staff,'requires_approval',true,'completion_criteria','تسليم'),gen_random_uuid());
 if not exists(select 1 from public.wf_notifications where task_id=real_task) then raise exception 'Real task notification blocked';end if;
 if not exists(select 1 from public.wf_notification_deliveries d join public.wf_notifications n on n.id=d.notification_id where n.task_id=real_task) then raise exception 'Real task mail queue blocked';end if;
 insert into public.wf_employee_requests(id,employee_id,kind,title,body,fingerprint,created_at)
 values(real_request,staff,'general','طلب عمل عادي داخل معاملة ملغاة','طلب عادي للتحقق',real_request::text,now()-interval '2 days');
 if not exists(select 1 from public.wf_notification_deliveries d join public.wf_notifications n on n.id=d.notification_id where n.event_key='employee-request:'||real_request) then raise exception 'Real request mail queue blocked';end if;
 select version into v from public.wf_tasks where id=real_task;
 perform public.wf_task_command(staff_user,real_task,v,'submit','{"summary":"تسليم عادي داخل معاملة ملغاة"}',gen_random_uuid());
 update public.wf_task_submissions set created_at=now()-interval '2 days' where task_id=real_task;
 perform public.wf_generate_notification_reminders(now());
 if exists(select 1 from public.wf_notifications n left join public.wf_tasks t on t.id=n.task_id where t.test_run_id=run or n.event_key like 'employee-request:'||test_request||'%') then raise exception 'Quiet test notification leaked';end if;
 select count(*) into n from public.wf_employee_requests where test_run_id is null and status='pending' and created_at<now()-interval '24 hours';
 if exists(select 1 from public.wf_notifications where event_key='approval-reminder:requests:'||(now() at time zone 'Asia/Riyadh')::date and body not like n::text||' %') then raise exception 'Test requests contaminated digest';end if;
 select count(*) into n from public.wf_task_submissions s join public.wf_tasks t on t.id=s.task_id where t.test_run_id is null and s.status='pending' and t.archived_at is null and s.created_at<now()-interval '24 hours';
 if exists(select 1 from public.wf_notifications where event_key='approval-reminder:submissions:'||(now() at time zone 'Asia/Riyadh')::date and body not like n::text||' %') then raise exception 'Test submissions contaminated digest';end if;
 begin update public.wf_tasks set test_run_id=null where id=fixture;raise exception 'Removed test marker';exception when sqlstate 'PT409' then null;end;
 begin update public.wf_tasks set test_run_id=run where id=real_task;raise exception 'Muted a real task';exception when sqlstate 'PT409' then null;end;
 update workforce_private.test_runs set expires_at=now()-interval '1 minute' where id=run;
 begin perform public.wf_test_run('assert',staff_user,run);raise exception 'Expired run accepted work';exception when sqlstate 'PT409' then null;end;
 update workforce_private.test_runs set expires_at=now()+interval '1 hour' where id=run;
 begin insert into public.wf_employee_requests(id,employee_id,kind,title,body,fingerprint,test_run_id,amount) values(gen_random_uuid(),staff,'expense','WF-TEST: financial request','يجب رفض التعديل المالي',gen_random_uuid()::text,run,50);raise exception 'Quiet mode changed money';exception when sqlstate 'PT400' then null;end;
 perform public.wf_test_run('finish',owner,run);
 insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key) values(staff_user,'due_24h','متأخر','صامت حتى بعد انتهاء الجولة',overdue_fixture,'/employee/work/tasks/'||overdue_fixture,'test-closed:'||run);
 if exists(select 1 from public.wf_notifications where event_key='test-closed:'||run) then raise exception 'Ended run leaked reminders';end if;
 begin perform public.wf_test_task_command(run,owner,gen_random_uuid(),null,'create',jsonb_build_object('title','WF-TEST: closed run'),gen_random_uuid());raise exception 'Ended run accepted creation';exception when sqlstate 'PT409' then null;end;
 begin perform public.wf_task_command(owner,gen_random_uuid(),null,'create',jsonb_build_object('title','QA-LIVE-unscoped','assignee_id',staff),gen_random_uuid());raise exception 'Legacy unscoped fixture accepted';exception when sqlstate 'PT400' then null;end;
 if has_function_privilege('authenticated','public.wf_test_run(text,uuid,uuid)','execute') or has_function_privilege('anon','public.wf_test_task_command(uuid,uuid,uuid,integer,text,jsonb,uuid)','execute') then raise exception 'Unsafe test RPC grant';end if;
end $$;
rollback;
select 'PASS: test assignment, attachment, submit, return, approval, requests and reminders silent; real inbox/outbox active; immutable markers and ended runs protected; all rolled back' as result;

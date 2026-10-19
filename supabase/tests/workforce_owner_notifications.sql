-- ALL fixtures, notices and outbox rows are uncommitted and rolled back.
-- Prevent even a worker wake; no request to the mail provider occurs.
begin;
select set_config('workforce.notification_wake','1',true);
set local role service_role;
do $$
#variable_conflict use_variable
declare owner uuid; manager uuid; e record; t uuid; k uuid; v integer; run uuid; state_id uuid; req uuid; attendance uuid; n integer; before_n bigint; before_d bigint;
begin
 select a.user_id into strict owner from public.wf_task_assignment_admins a join public.profiles p on p.id=a.user_id
 where p.role='admin' and workforce_private.notification_recipient_active(p.id) order by a.user_id limit 1;
 insert into workforce_private.notification_email_routes(user_id,email) values(owner,'elitecnnct@gmail.com')
 on conflict(user_id) do update set email=excluded.email;
 if not workforce_private.notification_recipient_matches_email(owner,'elitecnnct@gmail.com') then raise exception 'Admin route rejected by worker validation';end if;
 if workforce_private.notification_recipient_matches_email(owner,'unapproved@example.com') then raise exception 'Unapproved route accepted';end if;
 if has_table_privilege('authenticated','workforce_private.notification_email_routes','SELECT') or has_table_privilege('authenticated','workforce_private.notification_email_routes','UPDATE') then raise exception 'Route exposed to clients';end if;
 if has_function_privilege('authenticated','workforce_private.notify_admin_task_event()','execute') or has_function_privilege('anon','workforce_private.notify_admin_attendance_event()','execute') then raise exception 'Trigger function exposed';end if;
 for e in select id,user_id,full_name from public.wf_employees where status='active' and user_id is not null loop
  if workforce_private.notification_recipient_matches_email(e.user_id,'elitecnnct@gmail.com') then raise exception 'Employee can use admin email route';end if;
  t:=gen_random_uuid();k:=gen_random_uuid();
  perform public.wf_task_command(owner,t,null,'create',jsonb_build_object('title','ضابط معاملة ملغاة لإشعارات المدير','assignee_id',e.id,'requires_approval',true),k);
  perform public.wf_task_command(owner,t,null,'create',jsonb_build_object('title','ضابط معاملة ملغاة لإشعارات المدير','assignee_id',e.id,'requires_approval',true),k);
  select count(*) into n from public.wf_notifications where recipient_id=owner and task_id=t;
  if n<>1 then raise exception 'Create/idempotency owner notice count %',n;end if;
  if not exists(select 1 from public.wf_notification_deliveries d join public.wf_notifications n on n.id=d.notification_id where n.task_id=t and d.recipient_id=owner and d.snapshot->>'email'='elitecnnct@gmail.com') then raise exception 'Create email missing';end if;
  if not exists(select 1 from public.wf_notification_deliveries d join public.wf_notifications n on n.id=d.notification_id where n.task_id=t and d.recipient_id=e.user_id and d.snapshot->>'email'<>'elitecnnct@gmail.com' and workforce_private.notification_recipient_matches_email(e.user_id,d.snapshot->>'email')) then raise exception 'Staff email changed';end if;
  select version into v from public.wf_tasks where id=t;
  select c.id into state_id from public.wf_tasks x join public.wf_task_columns c on c.board_id=x.board_id and c.kind='in_progress' and c.archived_at is null where x.id=t limit 1;
  perform public.wf_task_command(e.user_id,t,v,'move',jsonb_build_object('column_id',state_id),gen_random_uuid());
  if (select count(*) from public.wf_notifications where task_id=t and recipient_id=owner)<>2 then raise exception 'Duplicate/missing employee state notice';end if;
  select version into v from public.wf_tasks where id=t;
  perform public.wf_task_command(e.user_id,t,v,'submit','{"summary":"تسليم داخل معاملة ملغاة"}',gen_random_uuid());
  if (select count(*) from public.wf_notifications where task_id=t and recipient_id=owner)<>3 then raise exception 'Submission/state notice duplicated';end if;
  select version into v from public.wf_tasks where id=t;
  perform public.wf_task_command(owner,t,v,'review','{"decision":"changes","reason":"تعديل داخل معاملة ملغاة"}',gen_random_uuid());
  if (select count(*) from public.wf_notifications where task_id=t and recipient_id=owner)<>4 then raise exception 'Owner state change missing';end if;
  select version into v from public.wf_tasks where id=t;
  perform public.wf_task_command(e.user_id,t,v,'submit','{"summary":"إعادة تسليم داخل معاملة ملغاة"}',gen_random_uuid());
  select version into v from public.wf_tasks where id=t;
  perform public.wf_task_command(owner,t,v,'review','{"decision":"approved","reason":"اعتماد داخل معاملة ملغاة"}',gen_random_uuid());
  if (select count(*) from public.wf_notifications where task_id=t and recipient_id=owner)<>6 then raise exception 'Approved/resubmitted owner notices missing or duplicated';end if;
  req:=gen_random_uuid();
  insert into public.wf_employee_requests(id,employee_id,kind,title,body,fingerprint)
   values(req,e.id,'general','طلب داخل معاملة ملغاة','ضابط للتحقق من الإشعار',req::text);
  if not exists(select 1 from public.wf_notifications n join public.wf_notification_deliveries d on d.notification_id=n.id where n.event_key='employee-request:'||req and n.recipient_id=owner and d.snapshot->>'email'='elitecnnct@gmail.com') then raise exception 'Incoming request email missing';end if;
  -- Close an existing clock in this transaction only so the unique-open guard
  -- cannot collide with a genuine working employee. The entire test rolls back.
  update public.wf_attendance_sessions set source='admin',checked_out=checked_in+interval '1 second' where employee_id=e.id and checked_out is null;
  attendance:=gen_random_uuid();
  insert into public.wf_attendance_sessions(id,employee_id,business_date,checked_in,source,updated_by)
   values(attendance,e.id,(now() at time zone 'Asia/Riyadh')::date,now(),'clock',e.user_id);
  update public.wf_attendance_sessions set checked_out=checked_in+interval '1 hour',checkout_key=gen_random_uuid(),version=version+1 where id=attendance;
  update public.wf_attendance_sessions set note='غير مؤثر على إشعارات الساعة' where id=attendance;
  if (select count(*) from public.wf_notifications where recipient_id=owner and event_key in ('clock:'||attendance||':attendance_in','clock:'||attendance||':attendance_out'))<>2 then raise exception 'Clock event duplicate/missing';end if;
  if (select count(*) from public.wf_notifications n join public.wf_notification_deliveries d on d.notification_id=n.id where n.event_key in ('clock:'||attendance||':attendance_in','clock:'||attendance||':attendance_out') and d.snapshot->>'email'='elitecnnct@gmail.com' and n.body like e.full_name||'%')<>2 then raise exception 'Clock routing or name missing';end if;
 end loop;
 -- Assigning the admin already produces a primary-assignee notice, not two.
 select user_id into strict manager from public.wf_employees where status='active' and can_manage_tasks order by id limit 1;
 t:=gen_random_uuid();
 perform public.wf_task_command(manager,t,null,'create',jsonb_build_object('title','تكليف المدير داخل معاملة ملغاة','assignee_admin_id',owner),gen_random_uuid());
 if (select count(*) from public.wf_notifications where recipient_id=owner and task_id=t)<>1 then raise exception 'Admin primary-assignee duplicated';end if;
 -- True marked silent tasks/requests create no notices, including ended runs.
 run:=(public.wf_test_run('start',owner)->>'id')::uuid;
 select count(*) into before_n from public.wf_notifications;select count(*) into before_d from public.wf_notification_deliveries;
 for e in select id,user_id from public.wf_employees where status='active' and user_id is not null loop
  t:=gen_random_uuid();
  perform public.wf_test_task_command(run,owner,t,null,'create',jsonb_build_object('title','WF-TEST: owner routing quiet','assignee_id',e.id),gen_random_uuid());
  select version into v from public.wf_tasks where id=t;
  select c.id into state_id from public.wf_tasks x join public.wf_task_columns c on c.board_id=x.board_id and c.kind='in_progress' and c.archived_at is null where x.id=t limit 1;
  perform public.wf_test_task_command(run,e.user_id,t,v,'move',jsonb_build_object('column_id',state_id),gen_random_uuid());
  req:=gen_random_uuid();
  insert into public.wf_employee_requests(id,employee_id,kind,title,body,fingerprint,test_run_id)
   values(req,e.id,'general','WF-TEST: quiet owner request','اختبار صامت',req::text,run);
 end loop;
 perform public.wf_test_run('finish',owner,run);
 insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
 values(owner,'task_created','حاجز بعد الإغلاق','صامت',t,'/admin/workforce/tasks/'||t,'owner-ended-probe:'||t);
 if (select count(*) from public.wf_notifications)<>before_n or (select count(*) from public.wf_notification_deliveries)<>before_d then raise exception 'Quiet fixture leaked notification/email';end if;
end $$;
rollback;
select 'PASS: both staff create/state/submit/review/request/clock events, correct admin route, unchanged staff route, deduplication, worker validation and silent runs; all rolled back without worker wake' result;

-- Quiet transaction: no fixture or queued email survives; no worker is woken.
begin;
select set_config('workforce.notification_wake','1',true);
set local role service_role;
do $$
#variable_conflict use_variable
declare owner uuid; e record; attendance uuid; request_id uuid; task_id uuid; quiet_task uuid;
 run uuid; v integer; key text; day date:=date '2099-01-06'; state_id uuid; claimed jsonb;
begin
 select a.user_id into strict owner from public.wf_task_assignment_admins a join public.profiles p on p.id=a.user_id
 where p.role='admin' and workforce_private.notification_recipient_active(p.id) limit 1;
 if has_function_privilege('authenticated','workforce_private.attendance_reminder_needed(uuid,date)','execute')
 or has_function_privilege('anon','workforce_private.attendance_reminder_current(uuid,text,timestamptz)','execute') then raise exception 'Reminder helpers exposed';end if;
 for e in select staff.id,staff.user_id,staff.start_date,s.workdays from public.wf_employees staff join public.wf_attendance_settings s on s.employee_id=staff.id where staff.status='active' and staff.user_id is not null loop
 begin
  -- Isolate future-day controls from the real contract; rolled back per employee.
  update public.wf_employees set contract_end=null where id=e.id;
  update public.wf_employees set start_date=day+1 where id=e.id;
  if workforce_private.attendance_reminder_needed(e.id,day) then raise exception 'Pre-start employee reminded';end if;
  update public.wf_employees set start_date=e.start_date where id=e.id;
  key:='attendance-missing:'||e.id||':'||day;
  if not workforce_private.attendance_reminder_needed(e.id,day) then raise exception 'Reserved absent test day unavailable';end if;
  if workforce_private.attendance_reminder_needed(e.id,date '2026-10-19') then raise exception 'Rollout starts too early';end if;
  if workforce_private.attendance_reminder_needed(e.id,date '2099-01-09') then raise exception 'Friday reminder accepted';end if;
  if workforce_private.attendance_reminder_current(e.user_id,key,'2099-01-06T09:44:59+03:00') then raise exception 'Reminder before 09:45';end if;
  if not workforce_private.attendance_reminder_current(e.user_id,key,'2099-01-06T09:45:00+03:00') then raise exception '09:45 window rejected';end if;
  if workforce_private.attendance_reminder_current(e.user_id,key,'2099-01-06T10:00:00+03:00') then raise exception 'Reminder after 10 accepted';end if;
  perform public.wf_generate_notification_reminders('2099-01-06T09:44:59+03:00');
  if exists(select 1 from public.wf_notifications where event_key=key and recipient_id=e.user_id) then raise exception 'Early attendance notice';end if;
  perform public.wf_generate_notification_reminders('2099-01-06T09:45:00+03:00');
  perform public.wf_generate_notification_reminders('2099-01-06T09:46:00+03:00');
  if (select count(*) from public.wf_notifications where event_key=key and recipient_id=e.user_id)<>1 then raise exception 'Daily duplicate/missing notice';end if;
  if not exists(select 1 from public.wf_notifications n join public.wf_notification_deliveries d on d.notification_id=n.id where n.event_key=key and n.recipient_id=e.user_id and d.snapshot->>'email'<>'elitecnnct@gmail.com') then raise exception 'Employee attendance mail missing or misrouted';end if;
  -- Real open clocks are changed only inside the rolled-back transaction.
  update public.wf_attendance_sessions set source='admin',checked_out=checked_in+interval '1 second' where employee_id=e.id and checked_out is null;
  attendance:=gen_random_uuid();
  insert into public.wf_attendance_sessions(id,employee_id,business_date,checked_in,checked_out,source,updated_by)
   values(attendance,e.id,day,'2099-01-06T09:30:00+03:00','2099-01-06T09:31:00+03:00','admin',owner);
  if workforce_private.attendance_reminder_needed(e.id,day) or workforce_private.attendance_reminder_current(e.user_id,key,'2099-01-06T09:47:00+03:00') then raise exception 'Reminder after attendance';end if;
  perform public.wf_generate_notification_reminders('2099-01-06T09:50:00+03:00');
  if (select count(*) from public.wf_notifications where event_key=key and recipient_id=e.user_id)<>1 then raise exception 'Repeated after attendance';end if;
  -- Leave exemption and schedule changes use their real saved values as input.
  request_id:=gen_random_uuid();
  insert into public.wf_employee_requests(id,employee_id,kind,title,body,starts_at,ends_at,fingerprint)
   values(request_id,e.id,'leave','طلب داخل معاملة ملغاة','ضابط إعفاء الإجازة','2099-01-07T00:00:00+03:00','2099-01-07T23:59:59+03:00',request_id::text);
  if not workforce_private.attendance_reminder_needed(e.id,date '2099-01-07') then raise exception 'Pending leave exempted';end if;
  update public.wf_employee_requests set status='approved' where id=request_id;
  if workforce_private.attendance_reminder_needed(e.id,date '2099-01-07') then raise exception 'Approved leave not exempted';end if;
  update public.wf_attendance_settings set workdays=array_remove(workdays,4) where employee_id=e.id;
  if workforce_private.attendance_reminder_needed(e.id,date '2099-01-08') then raise exception 'Schedule day off ignored';end if;
  update public.wf_attendance_settings set workdays=e.workdays where employee_id=e.id;
  perform public.wf_generate_notification_reminders('2099-01-08T10:00:00+03:00');
  if exists(select 1 from public.wf_notifications where event_key='attendance-missing:'||e.id||':2099-01-08') then raise exception 'Post-10am generation';end if;
  -- Exactly 24 hours, on a Friday: the deadline reminder must still be sent.
  task_id:=gen_random_uuid();
  perform public.wf_task_command(owner,task_id,null,'create',jsonb_build_object('title','ضابط تذكير مهمة داخل معاملة ملغاة','assignee_id',e.id,'due_at','2099-01-10T09:00:00+03:00','requires_approval',true),gen_random_uuid());
  perform public.wf_generate_notification_reminders('2099-01-09T08:59:00+03:00');
  if exists(select 1 from public.wf_notifications n where n.task_id=task_id and kind='due_24h') then raise exception 'Deadline reminder too early';end if;
  perform public.wf_generate_notification_reminders('2099-01-09T09:00:00+03:00');
  perform public.wf_generate_notification_reminders('2099-01-09T09:01:00+03:00');
  if (select count(*) from public.wf_notifications n where n.task_id=task_id and kind='due_24h' and recipient_id=e.user_id)<>1 then raise exception '24h reminder missing/duplicated on day off';end if;
  if not exists(select 1 from public.wf_notifications n join public.wf_notification_deliveries d on d.notification_id=n.id where n.task_id=task_id and n.kind='due_24h' and d.recipient_id=e.user_id) then raise exception '24h email missing';end if;
  -- Completion/review excludes future reminders.
  select version into v from public.wf_tasks where id=task_id;
  perform public.wf_task_command(e.user_id,task_id,v,'submit','{"summary":"تسليم داخل معاملة ملغاة"}',gen_random_uuid());
  perform public.wf_generate_notification_reminders('2099-01-10T08:00:00+03:00');
  if exists(select 1 from public.wf_notifications n where n.task_id=task_id and kind='due_2h') then raise exception 'Waiting review reminded';end if;
  -- The claim uses the real current day: simulated future-day reminders are stale.
  update public.wf_notification_delivery_settings set worker_until=null,worker_token=null where id;
  claimed:=public.wf_claim_notification_deliveries(8);
  if not exists(select 1 from public.wf_notification_deliveries d join public.wf_notifications n on n.id=d.notification_id where n.event_key=key and n.recipient_id=e.user_id and d.status='cancelled') then raise exception 'Stale attendance email not cancelled';end if;
  perform public.wf_release_notification_worker((claimed->>'token')::uuid);
  raise sqlstate 'ZX001' using message='rollback each staff control';
 exception when sqlstate 'ZX001' then null;
 end;
 end loop;
 -- Marked test tasks never enqueue deadline reminders.
 run:=(public.wf_test_run('start',owner)->>'id')::uuid;
 quiet_task:=gen_random_uuid();
 perform public.wf_test_task_command(run,owner,quiet_task,null,'create',jsonb_build_object('title','WF-TEST: quiet deadline alert','assignee_id',e.id,'due_at','2099-01-10T09:00:00+03:00'),gen_random_uuid());
 perform public.wf_generate_notification_reminders('2099-01-09T09:00:00+03:00');
 if exists(select 1 from public.wf_notifications n where n.task_id=quiet_task) then raise exception 'Quiet deadline notice leaked';end if;
end $$;
rollback;
select 'PASS: both staff 09:45 window from 20 October, daily dedup, attendance/leave/schedule exemptions, stale-mail cancellation and 24h deadline including Friday, review exclusion and silent fixtures; all rolled back with no worker wake' result;

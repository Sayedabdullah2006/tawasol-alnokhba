-- Silent transaction: suppress worker wake; all data and deliveries roll back.
begin;
select set_config('workforce.notification_wake','1',true);
set local role service_role;
do $$
#variable_conflict use_variable
declare owner uuid; e record; day date:=date '2099-01-06'; key text;
 request_id uuid; claimed jsonb; staff_count integer:=0;
begin
 select r.user_id into strict owner from workforce_private.notification_email_routes r
 join public.profiles p on p.id=r.user_id where p.role='admin' and r.email='elitecnnct@gmail.com'
 and workforce_private.notification_recipient_active(r.user_id);
 if has_function_privilege('authenticated','workforce_private.attendance_escalation_current(uuid,text,timestamptz)','execute')
 or has_function_privilege('anon','workforce_private.attendance_escalation_current(uuid,text,timestamptz)','execute') then raise exception 'Escalation helper exposed';end if;
 for e in select staff.id,staff.user_id,staff.full_name,staff.start_date,s.workdays
 from public.wf_employees staff join public.wf_attendance_settings s on s.employee_id=staff.id
 where staff.status='active' and staff.user_id is not null loop
 begin
  staff_count:=staff_count+1;
  update public.wf_employees set contract_end=null where id=e.id;
  key:='attendance-escalation:'||e.id||':'||day;
  if workforce_private.attendance_escalation_current(owner,key,'2099-01-06T09:59:59+03:00') then raise exception 'Early eligibility';end if;
  perform public.wf_generate_notification_reminders('2099-01-06T09:59:59+03:00');
  if exists(select 1 from public.wf_notifications where recipient_id=owner and event_key=key) then raise exception 'Early manager notice';end if;
  if not workforce_private.attendance_escalation_current(owner,key,'2099-01-06T10:00:00+03:00') then raise exception '10am eligibility rejected';end if;
  if workforce_private.attendance_escalation_current(e.user_id,key,'2099-01-06T10:00:00+03:00') then raise exception 'Employee accepted as manager';end if;
  perform public.wf_generate_notification_reminders('2099-01-06T10:00:00+03:00');
  perform public.wf_generate_notification_reminders('2099-01-06T10:01:00+03:00');
  perform public.wf_generate_notification_reminders('2099-01-06T23:59:00+03:00');
  if (select count(*) from public.wf_notifications where recipient_id=owner and event_key=key)<>1 then raise exception 'Duplicate/missing daily manager alert';end if;
  if not exists(select 1 from public.wf_notifications n join public.wf_notification_deliveries d on d.notification_id=n.id
   where n.recipient_id=owner and n.event_key=key and n.body like '%'||e.full_name||'%'
   and n.href='/admin/workforce/attendance?employee_id='||e.id and d.snapshot->>'email'='elitecnnct@gmail.com'
   and d.snapshot->>'body'=n.body) then raise exception 'Wrong manager destination/name/link';end if;
  if exists(select 1 from public.wf_notifications where recipient_id=e.user_id and event_key=key) then raise exception 'Manager alert leaked to employee';end if;
  perform public.wf_generate_notification_reminders('2099-01-07T10:00:00+03:00');
  if (select count(*) from public.wf_notifications where recipient_id=owner and event_key='attendance-escalation:'||e.id||':2099-01-07')<>1 then raise exception 'Next day missing';end if;
  if workforce_private.attendance_escalation_current(owner,key,'2099-01-07T10:00:00+03:00') then raise exception 'Old day still current';end if;
  update public.wf_attendance_sessions set source='admin',checked_out=checked_in+interval '1 second' where employee_id=e.id and checked_out is null;
  insert into public.wf_attendance_sessions(id,employee_id,business_date,checked_in,checked_out,source,updated_by)
   values(gen_random_uuid(),e.id,day,'2099-01-06T10:02:00+03:00','2099-01-06T10:03:00+03:00','admin',owner);
  if workforce_private.attendance_escalation_current(owner,key,'2099-01-06T10:04:00+03:00') then raise exception 'Checked-in employee still missing';end if;
  -- A separate day with attendance before 10 must never generate an escalation.
  insert into public.wf_attendance_sessions(id,employee_id,business_date,checked_in,checked_out,source,updated_by)
   values(gen_random_uuid(),e.id,date '2099-01-08','2099-01-08T09:00:00+03:00','2099-01-08T09:01:00+03:00','admin',owner);
  perform public.wf_generate_notification_reminders('2099-01-08T10:00:00+03:00');
  if exists(select 1 from public.wf_notifications where recipient_id=owner and event_key='attendance-escalation:'||e.id||':2099-01-08') then raise exception 'Present employee escalated';end if;
  perform public.wf_generate_notification_reminders('2099-01-09T10:00:00+03:00');
  if exists(select 1 from public.wf_notifications where recipient_id=owner and event_key='attendance-escalation:'||e.id||':2099-01-09') then raise exception 'Friday escalated';end if;
  request_id:=gen_random_uuid();
  insert into public.wf_employee_requests(id,employee_id,kind,title,body,starts_at,ends_at,fingerprint)
   values(request_id,e.id,'leave','ضابط اختبار ملغى','إجازة','2099-01-10T00:00:00+03:00','2099-01-10T23:59:59+03:00',request_id::text);
  update public.wf_employee_requests set status='approved' where id=request_id;
  perform public.wf_generate_notification_reminders('2099-01-10T10:00:00+03:00');
  if exists(select 1 from public.wf_notifications where recipient_id=owner and event_key='attendance-escalation:'||e.id||':2099-01-10') then raise exception 'Approved leave escalated';end if;
  update public.wf_employees set start_date=date '2099-01-12' where id=e.id;
  perform public.wf_generate_notification_reminders('2099-01-11T10:00:00+03:00');
  if exists(select 1 from public.wf_notifications where recipient_id=owner and event_key='attendance-escalation:'||e.id||':2099-01-11') then raise exception 'Pre-start employee escalated';end if;
  update public.wf_employees set start_date=e.start_date where id=e.id;
  -- No provider call: claim only, then roll back leases and notifications.
  update public.wf_notification_delivery_settings set worker_until=null,worker_token=null where id;
  claimed:=public.wf_claim_notification_deliveries(8);
  if not exists(select 1 from public.wf_notification_deliveries d join public.wf_notifications n on n.id=d.notification_id
   where n.recipient_id=owner and n.event_key=key and d.status='cancelled') then raise exception 'Stale escalation mail not cancelled';end if;
  perform public.wf_release_notification_worker((claimed->>'token')::uuid);
  raise sqlstate 'ZX001' using message='rollback staff control';
 exception when sqlstate 'ZX001' then null;
 end;
 end loop;
 if staff_count<2 then raise exception 'Both employees were not tested';end if;
end $$;
rollback;
select 'PASS: both staff, 10am boundary, manager email/name/link, daily dedup and next day, attendance/leave/Friday/pre-start, stale email cancellation, private helper; all rolled back, no worker wake' result;

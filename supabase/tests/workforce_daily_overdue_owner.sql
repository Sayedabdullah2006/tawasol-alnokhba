-- Quiet rollback-only controls; no provider calls or worker wake.
begin;
select set_config('workforce.notification_wake','1',true);
set local role service_role;
do $$
#variable_conflict use_variable
declare owner uuid; e record; task_id uuid; legacy_id uuid; quiet_id uuid; run uuid;
 v integer; key text; title text; tested integer:=0;
begin
 select r.user_id into strict owner from workforce_private.notification_email_routes r
 join public.profiles p on p.id=r.user_id where p.role='admin' and r.email='elitecnnct@gmail.com'
 and workforce_private.notification_recipient_active(r.user_id);
 for e in select staff.id,staff.user_id,staff.full_name from public.wf_employees staff
 where staff.status='active' and staff.user_id is not null loop
 begin
  tested:=tested+1;task_id:=gen_random_uuid();legacy_id:=gen_random_uuid();
  title:='ضابط تأخر تسليم داخل معاملة ملغاة';
  perform public.wf_task_command(owner,task_id,null,'create',jsonb_build_object('title',title,'assignee_id',e.id,'due_at','2099-01-09T08:00:00+03:00','requires_approval',true),gen_random_uuid());
  key:='task-reminder:'||task_id||':overdue:2099-01-09';
  perform public.wf_generate_notification_reminders('2099-01-09T07:59:59+03:00');
  if exists(select 1 from public.wf_notifications n where n.task_id=task_id and n.kind='overdue') then raise exception 'Early overdue alert';end if;
  -- Friday, before 9am: deadlines must not wait for office hours.
  perform public.wf_generate_notification_reminders('2099-01-09T08:00:01+03:00');
  perform public.wf_generate_notification_reminders('2099-01-09T08:01:00+03:00');
  if (select count(*) from public.wf_notifications where recipient_id=owner and event_key=key)<>1 then raise exception 'Owner alert missing/duplicated';end if;
  if not exists(select 1 from public.wf_notifications n join public.wf_notification_deliveries d on d.notification_id=n.id
   where n.recipient_id=owner and n.event_key=key and n.body like '%'||e.full_name||'%' and n.body like '%'||title||'%'
   and n.href='/admin/workforce/tasks/'||task_id and d.snapshot->>'email'='elitecnnct@gmail.com'
   and d.snapshot->>'body'=n.body and d.snapshot->>'taskTitle'=title) then raise exception 'Owner mail/name/title/link missing';end if;
  update public.wf_tasks set due_at='2099-01-09T08:30:00+03:00' where id=task_id;
  perform public.wf_generate_notification_reminders('2099-01-09T10:00:00+03:00');
  if (select count(*) from public.wf_notifications n where n.recipient_id=owner and n.task_id=task_id and n.kind='overdue')<>1 then raise exception 'Deadline edit duplicated daily alert';end if;
  perform public.wf_generate_notification_reminders('2099-01-10T00:00:01+03:00');
  if (select count(*) from public.wf_notifications n where n.recipient_id=owner and n.task_id=task_id and n.kind='overdue')<>2 then raise exception 'Next Riyadh day alert missing';end if;
  select version into v from public.wf_tasks where id=task_id;
  perform public.wf_task_command(e.user_id,task_id,v,'submit','{"summary":"تسليم داخل معاملة اختبار ملغاة"}',gen_random_uuid());
  perform public.wf_generate_notification_reminders('2099-01-11T10:00:00+03:00');
  if (select count(*) from public.wf_notifications n where n.recipient_id=owner and n.task_id=task_id and n.kind='overdue')<>2 then raise exception 'Review task escalated';end if;
  select version into v from public.wf_tasks where id=task_id;
  perform public.wf_task_command(owner,task_id,v,'review','{"decision":"approved","reason":"اعتماد داخل معاملة ملغاة"}',gen_random_uuid());
  perform public.wf_generate_notification_reminders('2099-01-12T10:00:00+03:00');
  if (select count(*) from public.wf_notifications n where n.recipient_id=owner and n.task_id=task_id and n.kind='overdue')<>2 then raise exception 'Completed task escalated';end if;
  -- Recognize a notification created by the previous deadline-based key.
  perform public.wf_task_command(owner,legacy_id,null,'create',jsonb_build_object('title',title,'assignee_id',e.id,'due_at','2099-01-09T08:00:00+03:00'),gen_random_uuid());
  insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
   values(owner,'overdue','ضابط مفتاح قديم',e.full_name||' — '||title,legacy_id,'/admin/workforce/tasks/'||legacy_id,
    'task-reminder:'||legacy_id||':4071625200:overdue:2099-01-09');
  perform public.wf_generate_notification_reminders('2099-01-09T10:00:00+03:00');
  if (select count(*) from public.wf_notifications n where n.recipient_id=owner and n.task_id=legacy_id and n.kind='overdue')<>1 then raise exception 'Legacy daily notice duplicated';end if;
  update public.wf_tasks set archived_at=now() where id=legacy_id;
  perform public.wf_generate_notification_reminders('2099-01-12T10:00:00+03:00');
  if (select count(*) from public.wf_notifications n where n.recipient_id=owner and n.task_id=legacy_id and n.kind='overdue')<>1 then raise exception 'Archived task escalated';end if;
  run:=(public.wf_test_run('start',owner)->>'id')::uuid;quiet_id:=gen_random_uuid();
  perform public.wf_test_task_command(run,owner,quiet_id,null,'create',jsonb_build_object('title','WF-TEST: quiet overdue','assignee_id',e.id,'due_at','2099-01-09T08:00:00+03:00'),gen_random_uuid());
  perform public.wf_generate_notification_reminders('2099-01-09T10:00:00+03:00');
  if exists(select 1 from public.wf_notifications n where n.task_id=quiet_id) then raise exception 'Test mode notification leaked';end if;
  raise sqlstate 'ZX001' using message='rollback staff control';
 exception when sqlstate 'ZX001' then null;
 end;
 end loop;
 if tested<2 then raise exception 'Both staff not tested';end if;
end $$;
rollback;
select 'PASS: Noor/Monwa overdue owner email/name/title/link, Friday before 9, daily dedup including deadline edits and legacy keys, new Riyadh day, review/archive exclusions, silent test mode; all rolled back' result;

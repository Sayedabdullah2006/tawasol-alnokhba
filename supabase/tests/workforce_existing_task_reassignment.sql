begin;
select set_config('workforce.notification_wake','1',true);
set local role service_role;
do $$
#variable_conflict use_variable
declare owner uuid; manager_user uuid; manager_employee uuid; member_user uuid; member_employee uuid;
 run uuid; task_id uuid:=gen_random_uuid(); v integer; notices bigint; deliveries bigint;
begin
 select a.user_id into strict owner from public.wf_task_assignment_admins a where workforce_private.notification_recipient_active(a.user_id) limit 1;
 select e.user_id,e.id into strict manager_user,manager_employee from public.wf_employees e where e.status='active' and e.can_manage_tasks;
 select e.user_id,e.id into strict member_user,member_employee from public.wf_employees e where e.status='active' and not e.can_manage_tasks;
 select count(*) into notices from public.wf_notifications;select count(*) into deliveries from public.wf_notification_deliveries;
 run:=(public.wf_test_run('start',owner)->>'id')::uuid;
 -- Existing admin-created task: the delegated employee can edit and reassign it.
 perform public.wf_test_task_command(run,owner,task_id,null,'create',jsonb_build_object('title','ضابط معاملة ملغاة','assignee_id',manager_employee,'requires_approval',true),gen_random_uuid());
 select version into v from public.wf_tasks where id=task_id;
 perform public.wf_test_task_command(run,manager_user,task_id,v,'edit',jsonb_build_object('title','عنوان معدل','assignee_id',member_employee,'assignee_admin_id',null,'requires_approval',true),gen_random_uuid());
 if not exists(select 1 from public.wf_tasks where id=task_id and assignee_id=member_employee and assignee_admin_id is null and title='عنوان معدل') then raise exception 'Existing task reassignment to employee failed';end if;
 select version into v from public.wf_tasks where id=task_id;
 begin
  perform public.wf_test_task_command(run,member_user,task_id,v,'edit',jsonb_build_object('assignee_id',manager_employee),gen_random_uuid());
  raise exception 'Regular employee reassigned a task';
 exception when insufficient_privilege then null;end;
 perform public.wf_test_task_command(run,manager_user,task_id,v,'edit',jsonb_build_object('assignee_id',null,'assignee_admin_id',owner,'requires_approval',true),gen_random_uuid());
 if not exists(select 1 from public.wf_tasks where id=task_id and assignee_id is null and assignee_admin_id=owner) then raise exception 'Reassignment to configured admin failed';end if;
 select version into v from public.wf_tasks where id=task_id;
 begin
  perform public.wf_test_task_command(run,manager_user,task_id,v,'edit',jsonb_build_object('requires_approval',false),gen_random_uuid());
  raise exception 'Manager disabled approval';
 exception when insufficient_privilege then null;end;
 perform public.wf_test_task_command(run,manager_user,task_id,v,'edit',jsonb_build_object('assignee_id',manager_employee,'assignee_admin_id',null,'requires_approval',true),gen_random_uuid());
 select version into v from public.wf_tasks where id=task_id;
 perform public.wf_test_task_command(run,manager_user,task_id,v,'submit','{"summary":"تسليم داخل معاملة ملغاة"}',gen_random_uuid());
 select version into v from public.wf_tasks where id=task_id;
 begin
  perform public.wf_test_task_command(run,manager_user,task_id,v,'edit',jsonb_build_object('assignee_id',member_employee),gen_random_uuid());
  raise exception 'Review task reassigned';
 exception when sqlstate 'PT409' then null;end;
 perform public.wf_test_task_command(run,owner,task_id,v,'review','{"decision":"approved","reason":"اعتماد داخل معاملة ملغاة"}',gen_random_uuid());
 select version into v from public.wf_tasks where id=task_id;
 begin
  perform public.wf_test_task_command(run,manager_user,task_id,v,'edit',jsonb_build_object('assignee_id',member_employee),gen_random_uuid());
  raise exception 'Completed task reassigned';
 exception when sqlstate 'PT409' then null;end;
 perform public.wf_test_run('finish',owner,run);
 if (select count(*) from public.wf_notifications)<>notices or (select count(*) from public.wf_notification_deliveries)<>deliveries then raise exception 'Silent run leaked notices';end if;
end $$;
rollback;
select 'PASS: Noor edits existing admin task and reassigns to Monwa/admin, Monwa denied, approval preserved, review/done protected, no notifications or emails; all rolled back' as result;

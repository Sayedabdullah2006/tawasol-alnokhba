-- Run against an enrolled workforce with one task manager, one regular employee
-- and a configured admin assignee. All writes, including queued emails, roll back.
begin;
set local role service_role;
do $$
#variable_conflict use_variable
declare manager_user uuid; manager_employee uuid; member_user uuid; member_employee uuid; owner uuid;
 task_id uuid:=gen_random_uuid(); owner_task uuid:=gen_random_uuid(); task_key uuid:=gen_random_uuid();
 v integer; result jsonb; payload jsonb; target_column uuid;
begin
 select e.user_id,e.id into strict manager_user,manager_employee from public.wf_employees e
 join public.profiles p on p.id=e.user_id where e.status='active' and e.can_manage_tasks and p.role='employee' limit 1;
 select e.user_id,e.id into strict member_user,member_employee from public.wf_employees e
 join public.profiles p on p.id=e.user_id where e.status='active' and not e.can_manage_tasks and p.role='employee' limit 1;
 select a.user_id into strict owner from public.wf_task_assignment_admins a join public.profiles p on p.id=a.user_id where p.role='admin' limit 1;
 payload:=jsonb_build_object('title','اختبار تفويض داخل معاملة ملغاة','assignee_id',member_employee,'completion_criteria','اختبار الصلاحيات','requires_approval',false,'due_at','2026-10-21T12:00:00+03:00');
 result:=public.wf_task_command(manager_user,task_id,null,'create',payload,task_key);
 if not exists(select 1 from public.wf_tasks where id=task_id and assignee_id=member_employee and requires_approval and assignment_origin='admin' and created_by=manager_user) then raise exception 'Manager assignment/approval invariant failed'; end if;
 if public.wf_task_command(manager_user,task_id,null,'create',payload,task_key) is distinct from result then raise exception 'Idempotency failed'; end if;
 select version into v from public.wf_tasks where id=task_id;
 begin
  perform public.wf_task_command(member_user,task_id,v,'edit',jsonb_build_object('title','غير مسموح'),gen_random_uuid());
  raise exception 'Regular employee edited an assigned task';
 exception when insufficient_privilege then null; end;
 begin
  perform public.wf_task_command(manager_user,task_id,v,'submit',jsonb_build_object('summary','غير مسموح'),gen_random_uuid());
  raise exception 'Manager submitted another employee task';
 exception when insufficient_privilege then null; end;
 begin
  perform public.wf_task_command(manager_user,task_id,v,'edit',jsonb_build_object('requires_approval',false),gen_random_uuid());
  raise exception 'Manager disabled approval';
 exception when insufficient_privilege then null; end;
 perform public.wf_task_command(manager_user,task_id,v,'edit',jsonb_build_object('title','تم تعديل التكليف','assignee_id',null,'assignee_admin_id',owner),gen_random_uuid());
 if not exists(select 1 from public.wf_tasks where id=task_id and assignee_id is null and assignee_admin_id=owner and title='تم تعديل التكليف') then raise exception 'Admin reassignment failed'; end if;
 if not exists(select 1 from public.wf_notifications where wf_notifications.task_id=task_id and recipient_id=owner and kind='assigned' and href='/admin/workforce/tasks/'||task_id) then raise exception 'Admin assignment notification missing'; end if;
 if not exists(select 1 from public.wf_notifications where wf_notifications.task_id=task_id and recipient_id=member_user and kind='reassigned') then raise exception 'Previous employee notification missing'; end if;
 if not exists(select 1 from public.wf_task_events where wf_task_events.task_id=task_id and actor_id=manager_user and 'assignee_admin_id'=any(changed_fields)) then raise exception 'Assignment audit missing'; end if;
 begin
  perform public.wf_task_command(manager_user,task_id,v,'edit',jsonb_build_object('title','نسخة قديمة'),gen_random_uuid());
  raise exception 'Stale version accepted';
 exception when sqlstate 'PT409' then null; end;
 select version into v from public.wf_tasks where id=task_id;
 begin
  perform public.wf_task_command(manager_user,task_id,v,'edit',jsonb_build_object('assignee_admin_id',member_user),gen_random_uuid());
  raise exception 'Non-admin assignee accepted';
 exception when sqlstate 'PT409' then null; end;
 begin
  perform public.wf_task_command(manager_user,task_id,v,'edit',jsonb_build_object('assignee_admin_id',owner,'assignee_id',member_employee),gen_random_uuid());
  raise exception 'Two primary assignees accepted';
 exception when sqlstate 'PT400' then null; end;
 perform public.wf_generate_notification_reminders('2026-10-20T13:00:00+03:00');
 if not exists(select 1 from public.wf_notifications where wf_notifications.task_id=task_id and recipient_id=owner and kind='due_24h') then raise exception 'Admin deadline reminder missing'; end if;
 perform public.wf_task_command(owner,task_id,v,'submit',jsonb_build_object('summary','تسليم المدير'),gen_random_uuid());
 select version into v from public.wf_tasks where id=task_id;
 begin
  perform public.wf_task_command(manager_user,task_id,v,'review',jsonb_build_object('decision','approved','reason','غير مسموح'),gen_random_uuid());
  raise exception 'Manager approved a submission';
 exception when insufficient_privilege then null; end;
 perform public.wf_task_command(owner,task_id,v,'review',jsonb_build_object('decision','changes','reason','تعديل للاختبار'),gen_random_uuid());
 select version into v from public.wf_tasks where id=task_id;
 perform public.wf_task_command(manager_user,task_id,v,'edit',jsonb_build_object('assignee_id',member_employee),gen_random_uuid());
 if not exists(select 1 from public.wf_tasks where id=task_id and assignee_id=member_employee and assignee_admin_id is null) then raise exception 'Reassigning back to employee failed'; end if;
 if not exists(select 1 from public.wf_notifications where wf_notifications.task_id=task_id and recipient_id=owner and kind='reassigned') then raise exception 'Previous admin notification missing'; end if;
 begin
  perform public.wf_task_command(member_user,owner_task,null,'create',payload,gen_random_uuid());
  raise exception 'Regular employee assigned team tasks';
 exception when insufficient_privilege then null; end;
 perform public.wf_assign_weekly_plan(manager_user,gen_random_uuid(),jsonb_build_array(
 jsonb_build_object('id',owner_task,'title','اختبار إسناد للمدير','assignee_admin_id',owner,'due_at','2026-10-22T12:00:00+03:00','completion_criteria','اختبار الخطة')));
 if not exists(select 1 from public.wf_tasks where id=owner_task and assignee_admin_id=owner and assignee_id is null) then raise exception 'Manager weekly admin assignment failed'; end if;
 update public.wf_employees set can_manage_tasks=false,updated_by=owner where id=manager_employee;
 select version into v from public.wf_tasks where id=task_id;
 begin
  perform public.wf_task_command(manager_user,task_id,v,'edit',jsonb_build_object('title','بعد سحب التفويض'),gen_random_uuid());
  raise exception 'Revoked permission remained active';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',owner::text,true);
 perform set_config('workforce.test.owner',owner::text,true);
end $$;
set local role authenticated;
do $$
declare metrics jsonb;
begin
 metrics:=public.wf_admin_dashboard(null,null,current_setting('workforce.test.owner')::uuid,null);
 if (metrics->'totals'->>'assigned')::integer<>1 then raise exception 'Admin assignment missing from filtered metrics'; end if;
 if coalesce((metrics->'unassigned'->>'assigned')::integer,0)<>0 then raise exception 'Admin task counted as unassigned'; end if;
end $$;
rollback;
select 'Task delegation: create, edit, reassign, notifications, reminders, idempotency, conflicts, review isolation and revocation passed' as result;

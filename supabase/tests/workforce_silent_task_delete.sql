begin isolation level repeatable read;
select set_config('workforce.notification_wake','1',true);
create temporary table delete_test(owner_id uuid,manager_user uuid,member_user uuid,member_employee uuid,run_id uuid,task_id uuid,notices bigint,deliveries bigint);
grant select,insert,update on delete_test to service_role;
grant select on delete_test to authenticated;
set local role service_role;
insert into delete_test select (select user_id from wf_task_assignment_admins limit 1),m.user_id,e.user_id,e.id,null,gen_random_uuid(),(select count(*) from wf_notifications),(select count(*) from wf_notification_deliveries)
from wf_employees m cross join wf_employees e where m.can_manage_tasks and m.status='active' and not e.can_manage_tasks and e.status='active';
do $$ declare r record; v integer; begin
 select * into strict r from delete_test;
 update delete_test set run_id=(wf_test_run('start',r.owner_id)->>'id')::uuid;
 select * into strict r from delete_test;
 perform wf_test_task_command(r.run_id,r.owner_id,r.task_id,null,'create',jsonb_build_object('title','حذف داخل معاملة ملغاة','assignee_id',r.member_employee),gen_random_uuid());
 select version into v from wf_tasks where id=r.task_id;
 perform wf_test_task_command(r.run_id,r.member_user,r.task_id,v,'submit','{"summary":"تسليم قبل الحذف"}',gen_random_uuid());
 select version into v from wf_tasks where id=r.task_id;
 begin
  perform wf_test_task_command(r.run_id,r.manager_user,r.task_id,v,'delete','{}',gen_random_uuid());
  raise exception 'Noor deleted a task';
 exception when insufficient_privilege then null; end;
 begin
  perform wf_test_task_command(r.run_id,r.member_user,r.task_id,v,'delete','{}',gen_random_uuid());
  raise exception 'Monwa deleted a task';
 exception when insufficient_privilege then null; end;
 begin
  perform wf_test_task_command(r.run_id,r.owner_id,r.task_id,v-1,'delete','{}',gen_random_uuid());
  raise exception 'Stale deletion accepted';
 exception when sqlstate 'PT409' then null; end;
 perform wf_test_task_command(r.run_id,r.owner_id,r.task_id,v,'delete','{}',gen_random_uuid());
 if not exists(select 1 from wf_tasks where id=r.task_id and deleted_at is not null and deleted_by=r.owner_id and archived_at is not null) then raise exception 'Task not deleted'; end if;
 if (select count(*) from wf_notifications)<>r.notices or (select count(*) from wf_notification_deliveries)<>r.deliveries then raise exception 'Silent deletion leaked notifications/emails'; end if;
 perform wf_test_run('finish',r.owner_id,r.run_id);
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select member_user::text from delete_test),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from wf_tasks where id=(select task_id from delete_test)) or exists(select 1 from wf_task_submissions where task_id=(select task_id from delete_test)) then raise exception 'Deleted task still visible'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select owner_id::text from delete_test),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from wf_tasks where id=(select task_id from delete_test)) then raise exception 'Deleted task visible in admin lists/archive'; end if;
end $$;
rollback;
select 'PASS: admin-only silent deletion during review, optimistic version, hidden from employee/admin/archive, no notifications/emails; rolled back' as result;

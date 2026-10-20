begin isolation level repeatable read;
select set_config('workforce.notification_wake','1',true);
create temporary table scope_test(owner_id uuid,manager_user uuid,manager_employee uuid,member_user uuid,member_employee uuid,run_id uuid,private_task uuid,shared_task uuid,file_id uuid,notices bigint,deliveries bigint);
grant select on scope_test to authenticated,service_role; grant insert,update on scope_test to service_role;
set local role service_role;
insert into scope_test
select (select user_id from wf_task_assignment_admins limit 1),m.user_id,m.id,e.user_id,e.id,null,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),(select count(*) from wf_notifications),(select count(*) from wf_notification_deliveries)
from wf_employees m cross join wf_employees e where m.can_manage_tasks and m.status='active' and not e.can_manage_tasks and e.status='active';
reset role;
grant update on scope_test to service_role;
set local role service_role;
do $$
declare r record; v integer; target uuid;
begin
 select * into strict r from scope_test;
 update scope_test set run_id=(wf_test_run('start',r.owner_id)->>'id')::uuid;
 select * into strict r from scope_test;
 perform wf_test_task_command(r.run_id,r.owner_id,r.private_task,null,'create',jsonb_build_object('title','معاملة خاصة ملغاة','assignee_id',r.manager_employee),gen_random_uuid());
 perform wf_attachment_command(r.manager_user,gen_random_uuid(),r.private_task,'add',jsonb_build_object('title','ملف خاص داخل معاملة ملغاة','filename','private.bin','object_path',r.private_task||'/private.bin','mime_type','application/octet-stream','size_bytes',1,'sha256',repeat('b',64),'purpose','task'));
 perform wf_test_task_command(r.run_id,r.manager_user,r.shared_task,null,'create',jsonb_build_object('title','معاملة مشتركة ملغاة','assignee_id',r.manager_employee,'co_assignee_ids',jsonb_build_array(r.member_employee)),gen_random_uuid());
 select version into v from wf_tasks where id=r.private_task;
 begin
  perform wf_test_task_command(r.run_id,r.member_user,r.private_task,v,'edit',jsonb_build_object('co_assignee_ids',jsonb_build_array(r.member_employee)),gen_random_uuid());
  raise exception 'Unassigned employee changed private task';
 exception when insufficient_privilege then null; end;
 select version into v from wf_tasks where id=r.shared_task;
 select id into target from wf_task_columns where board_id=(select board_id from wf_tasks where id=r.shared_task) and kind='in_progress' and archived_at is null limit 1;
 perform wf_test_task_command(r.run_id,r.member_user,r.shared_task,v,'move',jsonb_build_object('column_id',target),gen_random_uuid());
 perform wf_attachment_command(r.member_user,r.file_id,r.shared_task,'add',jsonb_build_object('title','ملف معاملة ملغاة','filename','shared.bin','object_path',r.shared_task||'/'||r.file_id||'.bin','mime_type','application/octet-stream','size_bytes',1,'sha256',repeat('a',64),'purpose','delivery'));
 select version into v from wf_tasks where id=r.shared_task;
 perform wf_comments_command(r.member_user,r.shared_task,v,'create',jsonb_build_object('comment_id',gen_random_uuid(),'body','تعليق معاملة ملغاة'),gen_random_uuid());
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select member_user::text from scope_test),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$
declare r record;
begin
 select * into strict r from scope_test;
 if exists(select 1 from wf_tasks where id=r.private_task) then raise exception 'Monwa can read Noor private task'; end if;
 if exists(select 1 from wf_task_attachments where task_id=r.private_task) then raise exception 'Monwa can read private task attachments'; end if;
 if exists(select 1 from wf_knowledge_files where object_path like r.private_task||'/%') then raise exception 'Private task files leaked through knowledge center'; end if;
 if not exists(select 1 from wf_tasks where id=r.shared_task) then raise exception 'Monwa cannot read joint task'; end if;
 if not exists(select 1 from wf_task_attachments where id=r.file_id) then raise exception 'Shared attachment hidden'; end if;
 if not exists(select 1 from wf_knowledge_files where task_attachment_id=r.file_id) then raise exception 'Shared indexed file hidden'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select manager_user::text from scope_test),true);
set local role authenticated;
do $$
declare r record;
begin
 select * into strict r from scope_test;
 if (select count(*) from wf_tasks where id in(r.private_task,r.shared_task))<>2 then raise exception 'Noor cannot read private and shared tasks'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select owner_id::text from scope_test),true);
set local role authenticated;
do $$
declare r record; dashboard jsonb; actual bigint; reported bigint;
begin
 select * into strict r from scope_test;
 dashboard:=wf_admin_dashboard();
 select count(*) into actual from wf_tasks t join wf_boards b on b.id=t.board_id where t.archived_at is null and b.archived_at is null;
 if (dashboard->'totals'->>'assigned')::bigint<>actual then raise exception 'Shared tasks counted twice in team total'; end if;
 select count(*) into actual from wf_tasks t join wf_boards b on b.id=t.board_id where t.archived_at is null and b.archived_at is null and (t.assignee_id=r.member_employee or r.member_employee=any(t.co_assignee_ids));
 select (x->'metrics'->>'assigned')::bigint into reported from jsonb_array_elements(dashboard->'employees') x where x->>'id'=r.member_employee::text;
 if reported is distinct from actual then raise exception 'Joint task missing from member metrics'; end if;
end $$;
reset role;
set local role service_role;
do $$
declare r record; v integer;
begin
 select * into strict r from scope_test;
 select version into v from wf_tasks where id=r.shared_task;
 perform wf_test_task_command(r.run_id,r.member_user,r.shared_task,v,'submit',jsonb_build_object('summary','تسليم مشترك داخل معاملة ملغاة','attachment_ids',jsonb_build_array(r.file_id)),gen_random_uuid());
 select version into v from wf_tasks where id=r.shared_task;
 begin
  perform wf_test_task_command(r.run_id,r.member_user,r.shared_task,v,'review','{"decision":"approved","reason":"محاولة غير مخولة"}',gen_random_uuid());
  raise exception 'Employee approved own submission';
 exception when insufficient_privilege then null; end;
 perform wf_test_task_command(r.run_id,r.owner_id,r.shared_task,v,'review','{"decision":"approved","reason":"اعتماد داخل معاملة ملغاة"}',gen_random_uuid());
 if (select count(*) from wf_notifications)<>r.notices or (select count(*) from wf_notification_deliveries)<>r.deliveries then raise exception 'Silent run leaked notifications'; end if;
 perform wf_test_run('finish',r.owner_id,r.run_id);
end $$;
rollback;
select 'PASS: private task isolation, shared visibility, shared move/comment/file/delivery, admin-only approval, no notifications; rolled back' as result;


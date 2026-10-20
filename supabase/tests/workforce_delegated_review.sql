begin isolation level repeatable read;
select set_config('workforce.notification_wake','1',true);
create temporary table review_test(owner_id uuid,manager_user uuid,manager_employee uuid,member_user uuid,member_employee uuid,run_id uuid,task_id uuid,file_id uuid,notices bigint,deliveries bigint);
grant select on review_test to authenticated,service_role;
grant insert,update on review_test to service_role;
set local role service_role;
insert into review_test select (select user_id from wf_task_assignment_admins limit 1),m.user_id,m.id,e.user_id,e.id,null,gen_random_uuid(),gen_random_uuid(),(select count(*) from wf_notifications),(select count(*) from wf_notification_deliveries)
from wf_employees m cross join wf_employees e where m.can_manage_tasks and m.status='active' and not e.can_manage_tasks and e.status='active';
do $$
declare r record; v integer; reason text:=repeat('ملاحظة مفصلة ',15000); sid uuid; target uuid;
begin
 select * into strict r from review_test;
 update review_test set run_id=(wf_test_run('start',r.owner_id)->>'id')::uuid;
 select * into strict r from review_test;
 perform wf_test_task_command(r.run_id,r.owner_id,r.task_id,null,'create',jsonb_build_object('title','مراجعة داخل معاملة ملغاة','assignee_id',r.member_employee),gen_random_uuid());
 select version into v from wf_tasks where id=r.task_id;
 perform wf_test_task_command(r.run_id,r.member_user,r.task_id,v,'submit','{"summary":"تسليم للمراجعة"}',gen_random_uuid());
 -- Managers may add a second assignee without leaving review; details remain locked.
 select version into v from wf_tasks where id=r.task_id;
 perform wf_test_task_command(r.run_id,r.manager_user,r.task_id,v,'edit',jsonb_build_object('co_assignee_ids',jsonb_build_array(r.manager_employee)),gen_random_uuid());
 if (select c.kind from wf_tasks t join wf_task_columns c on c.id=t.column_id where t.id=r.task_id)<>'review' then raise exception 'Reassignment left review'; end if;
 select version into v from wf_tasks where id=r.task_id;
 begin
  perform wf_test_task_command(r.run_id,r.manager_user,r.task_id,v,'edit','{"description":"تعديل محظور"}',gen_random_uuid());
  raise exception 'Details edited during review';
 exception when sqlstate 'PT409' then null; end;
 begin
  perform wf_test_task_command(r.run_id,r.member_user,r.task_id,v,'review','{"decision":"changes","reason":"قرار ذاتي"}',gen_random_uuid());
  raise exception 'Monwa reviewed own task';
 exception when insufficient_privilege then null; end;
 begin
  perform wf_test_task_command(r.run_id,r.manager_user,r.task_id,v,'review','{"decision":"approved","reason":"اعتماد مشترك ذاتي"}',gen_random_uuid());
  raise exception 'Noor approved shared own task';
 exception when insufficient_privilege then null; end;
 perform wf_attachment_command(r.owner_id,r.file_id,r.task_id,'add',jsonb_build_object('title','مرجع التعديل','filename','review.pdf','object_path',r.task_id||'/review.pdf','mime_type','application/pdf','size_bytes',1,'sha256',repeat('b',64),'purpose','task'));
 begin
  perform wf_attachment_command(r.member_user,gen_random_uuid(),r.task_id,'add',jsonb_build_object('title','محظور','filename','denied.txt','object_path',r.task_id||'/denied','mime_type','text/plain','size_bytes',1,'sha256',repeat('c',64),'purpose','task'));
  raise exception 'Assignee uploaded during review';
 exception when sqlstate 'PT409' then null; end;
 select version into v from wf_tasks where id=r.task_id;
 perform wf_test_task_command(r.run_id,r.owner_id,r.task_id,v,'review',jsonb_build_object('decision','changes','reason',reason),gen_random_uuid());
 if (select c.kind from wf_tasks t join wf_task_columns c on c.id=t.column_id where t.id=r.task_id)<>'changes' then raise exception 'Return status incorrect'; end if;
 if not exists(select 1 from wf_task_submissions where task_id=r.task_id and status='changes' and decision_reason=reason) then raise exception 'Long reason truncated'; end if;
 if (select cardinality(co_assignee_ids) from wf_tasks where id=r.task_id)<>1 then raise exception 'Return lost co-assignee'; end if;
 -- Remove manager from the assignees, then let Noor review Monwa's next submission.
 select version into v from wf_tasks where id=r.task_id;
 perform wf_test_task_command(r.run_id,r.owner_id,r.task_id,v,'edit','{"co_assignee_ids":[]}',gen_random_uuid());
 select version into v from wf_tasks where id=r.task_id;
 perform wf_test_task_command(r.run_id,r.member_user,r.task_id,v,'submit','{"summary":"تسليم بعد التعديل"}',gen_random_uuid());
 perform wf_attachment_command(r.manager_user,gen_random_uuid(),r.task_id,'add',jsonb_build_object('title','مرجع من نور','filename','noor.txt','object_path',r.task_id||'/noor','mime_type','text/plain','size_bytes',1,'sha256',repeat('d',64),'purpose','task'));
 select version into v from wf_tasks where id=r.task_id;
 perform wf_test_task_command(r.run_id,r.manager_user,r.task_id,v,'review','{"decision":"changes","reason":"تعديل مطلوب من نور"}',gen_random_uuid());
 select version into v from wf_tasks where id=r.task_id;
 perform wf_test_task_command(r.run_id,r.member_user,r.task_id,v,'submit','{"summary":"التسليم النهائي"}',gen_random_uuid());
 select version into v from wf_tasks where id=r.task_id;
 perform wf_test_task_command(r.run_id,r.manager_user,r.task_id,v,'review','{"decision":"approved","reason":"اعتماد نور"}',gen_random_uuid());
 if (select c.kind from wf_tasks t join wf_task_columns c on c.id=t.column_id where t.id=r.task_id)<>'done' then raise exception 'Noor approval failed'; end if;
 if (select count(*) from wf_notifications)<>r.notices or (select count(*) from wf_notification_deliveries)<>r.deliveries then raise exception 'Silent run leaked notifications/emails'; end if;
 perform wf_test_run('finish',r.owner_id,r.run_id);
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select member_user::text from review_test),true);
set local role authenticated;
do $$ declare r record; begin
 select * into strict r from review_test;
 if not exists(select 1 from wf_task_submissions where task_id=r.task_id and status='changes' and length(decision_reason)>100000) then raise exception 'Employee cannot see full reason'; end if;
 if not exists(select 1 from wf_task_attachments where id=r.file_id) then raise exception 'Employee cannot see reviewer attachment'; end if;
end $$;
rollback;
select 'PASS: delegated review, own/shared review denied, reassignment in review, reviewer attachments, long visible reasons, return/resubmit/approval, no notifications/emails; rolled back' as result;

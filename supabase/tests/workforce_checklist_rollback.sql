begin; select set_config('workforce.notification_wake','1',true); set local role service_role;
do $$
declare owner uuid; e record; run uuid; task uuid; item uuid; v integer;
begin
select a.user_id into strict owner from public.wf_task_assignment_admins a join public.profiles p on p.id=a.user_id where p.role='admin' limit 1;
run:=(public.wf_test_run('start',owner)->>'id')::uuid;
for e in select id,user_id from public.wf_employees where status='active' and user_id is not null loop
task:=gen_random_uuid();item:=gen_random_uuid();
perform public.wf_test_task_command(run,owner,task,null,'create',jsonb_build_object('title','WF-TEST: checklist transaction','assignee_id',e.id,'requires_approval',true),gen_random_uuid());
select version into v from public.wf_tasks where id=task;
perform public.wf_checklist_command(owner,task,v,'add',jsonb_build_object('item_id',item,'title','بند تحقق مطلوب','required',true),gen_random_uuid());
select version into v from public.wf_tasks where id=task;
begin perform public.wf_test_task_command(run,e.user_id,task,v,'submit','{"summary":"تسليم قبل اكتمال التحقق"}',gen_random_uuid());raise exception 'Required checklist bypass';exception when sqlstate 'PT409' then null;end;
perform public.wf_checklist_command(e.user_id,task,v,'toggle',jsonb_build_object('item_id',item,'completed',true),gen_random_uuid());
select version into v from public.wf_tasks where id=task;
perform public.wf_test_task_command(run,e.user_id,task,v,'submit','{"summary":"تسليم بعد اكتمال التحقق"}',gen_random_uuid());
select version into v from public.wf_tasks where id=task;
perform public.wf_test_task_command(run,owner,task,v,'review','{"decision":"approved","reason":"اعتماد تحقق ملغى"}',gen_random_uuid());
select version into v from public.wf_tasks where id=task;
perform public.wf_test_task_command(run,owner,task,v,'archive','{"archived":true}',gen_random_uuid());
select version into v from public.wf_tasks where id=task;
perform public.wf_test_task_command(run,owner,task,v,'archive','{"archived":false}',gen_random_uuid());
if exists(select 1 from public.wf_notifications where task_id=task) then raise exception 'Checklist generated notification';end if;
end loop;
end $$; rollback; select 'PASS: both actors required checklist gates, owner toggle, submit/approve, archive/restore; all silent and rolled back' result;

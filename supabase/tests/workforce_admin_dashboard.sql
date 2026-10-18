-- Full assignment/review/requests cycle; all rows and outbox changes roll back.
begin;
set local role service_role;
do $$
#variable_conflict use_variable
declare owner uuid; staff uuid; staff_user uuid; other_staff uuid;
 task_id uuid:=gen_random_uuid(); other_task uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid(); profile_id uuid:=gen_random_uuid();
 client text:='dashboard-check-'||gen_random_uuid(); v integer;
begin
 select a.user_id into strict owner from public.wf_task_assignment_admins a join public.profiles p on p.id=a.user_id where p.role='admin' limit 1;
 select e.id,e.user_id into strict staff,staff_user from public.wf_employees e where e.status='active' order by e.id limit 1;
 select e.id into strict other_staff from public.wf_employees e where e.status='active' and e.id<>staff limit 1;
 perform public.wf_task_command(owner,task_id,null,'create',jsonb_build_object('title','اختبار تسليم لوحة المدير','assignee_id',staff,'client_name',client,'requires_approval',true,'due_at',now()+interval '1 day','completion_criteria','تسليم اختبار المعاملة'),gen_random_uuid());
 perform public.wf_task_command(owner,other_task,null,'create',jsonb_build_object('title','اختبار توزيع أداء الموظفات','assignee_id',other_staff,'client_name',client,'requires_approval',true,'due_at',now()-interval '1 day','completion_criteria','اختبار متابعة الموعد'),gen_random_uuid());
 select t.version into v from public.wf_tasks t where t.id=task_id;
 perform public.wf_task_command(staff_user,task_id,v,'submit',jsonb_build_object('summary','تسليم لاختبار الاعتماد فقط'),gen_random_uuid());
 insert into public.wf_employee_requests(id,employee_id,kind,title,body,fingerprint) values(request_id,staff,'general','اختبار قرار المدير','اختبار طلب إداري داخل معاملة ملغاة',request_id::text);
 insert into public.wf_profile_change_requests(id,employee_id,field,proposed_value,reason,request_key) values(profile_id,staff,'bank_name','بنك اختبار داخل معاملة','اختبار قائمة تعديلات البيانات',gen_random_uuid());
 perform set_config('workforce.test.owner',owner::text,true);
 perform set_config('workforce.test.staff',staff::text,true);
 perform set_config('workforce.test.staff_user',staff_user::text,true);
 perform set_config('workforce.test.task',task_id::text,true);
 perform set_config('workforce.test.request',request_id::text,true);
 perform set_config('workforce.test.profile',profile_id::text,true);
 perform set_config('workforce.test.client',client,true);
 perform set_config('request.jwt.claim.sub',owner::text,true);
end $$;
set local role authenticated;
do $$
declare summary jsonb; n bigint;
begin
 summary:=public.wf_admin_dashboard(null,null,null,current_setting('workforce.test.client'));
 if (summary->'totals'->>'assigned')::int<>2 or (summary->'totals'->>'pending')::int<>1 or (summary->'totals'->>'overdue')::int<>1 then raise exception 'Dashboard counts mismatch'; end if;
 select count(*) into n from public.wf_task_submissions s join public.wf_tasks t on t.id=s.task_id join public.wf_task_columns c on c.id=t.column_id join public.wf_boards b on b.id=t.board_id
 where s.status='pending' and c.kind='review' and t.archived_at is null and b.archived_at is null and t.client_name=current_setting('workforce.test.client');
 if n<>1 then raise exception 'Pending delivery queue mismatch'; end if;
 if not exists(select 1 from public.wf_employee_requests where id=current_setting('workforce.test.request')::uuid and status='pending') then raise exception 'Admin request queue hidden'; end if;
 if not exists(select 1 from public.wf_profile_change_requests where id=current_setting('workforce.test.profile')::uuid and status='pending') then raise exception 'Focused profile request missing'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('workforce.test.staff_user'),true);
 begin perform public.wf_admin_dashboard(); raise exception 'Employee accessed admin metrics'; exception when insufficient_privilege then null; end;
end $$;
set local role service_role;
do $$
declare owner uuid:=current_setting('workforce.test.owner')::uuid; task_id uuid:=current_setting('workforce.test.task')::uuid; v integer;
begin
 select version into v from public.wf_tasks where id=task_id;
 begin perform public.wf_task_command(current_setting('workforce.test.staff_user')::uuid,task_id,v,'review','{"decision":"approved","reason":"قرار غير مسموح"}',gen_random_uuid()); raise exception 'Employee approved submission'; exception when insufficient_privilege then null; end;
 perform public.wf_task_command(owner,task_id,v,'review','{"decision":"approved","reason":"اعتماد اختبار داخل معاملة ملغاة"}',gen_random_uuid());
 begin perform public.wf_task_command(owner,task_id,v,'review','{"decision":"approved","reason":"نسخة قديمة"}',gen_random_uuid()); raise exception 'Stale review accepted'; exception when sqlstate 'PT409' then null; end;
 perform public.wf_decide_employee_request(current_setting('workforce.test.request')::uuid,owner,1,'approved','اعتماد طلب الاختبار');
 perform public.wf_decide_profile_change(current_setting('workforce.test.profile')::uuid,owner,'approved','اعتماد تعديل الاختبار');
 if not exists(select 1 from public.wf_employee_requests where id=current_setting('workforce.test.request')::uuid and status='approved') then raise exception 'Request approval missing'; end if;
 if not exists(select 1 from public.wf_profile_change_requests where id=current_setting('workforce.test.profile')::uuid and status='approved') then raise exception 'Profile approval missing'; end if;
 perform set_config('request.jwt.claim.sub',owner::text,true);
end $$;
set local role authenticated;
do $$ declare summary jsonb; begin
 summary:=public.wf_admin_dashboard(null,null,null,current_setting('workforce.test.client'));
 if (summary->'totals'->>'completed')::int<>1 or (summary->'totals'->>'pending')::int<>0 then raise exception 'Approved work did not update performance'; end if;
end $$;
rollback;
select 'Admin dashboard: assignment, metrics, pending queues, task and request approvals, stale review and employee isolation passed; rolled back' as result;

-- Internal coordination. No approval here starts an attendance timer or an AI stage.
create table public.vo_coordination (
 id uuid primary key default gen_random_uuid(),
 workspace_id text not null check(length(workspace_id) between 1 and 120),
 kind text not null check(kind in ('handoff','help')),
 task_id uuid not null references public.wf_tasks(id),
 requested_by uuid not null references public.profiles(id),
 sender_employee_id uuid references public.wf_employees(id),
 target_employee_id uuid references public.wf_employees(id),
 request_key uuid not null,
 summary text not null check(length(btrim(summary)) between 3 and 2000),
 next_title text not null default '' check(length(next_title)<=160),
 state text not null default 'pending_manager' check(state in ('pending_manager','approved','requested','accepted','resolved','rejected','cancelled')),
 version integer not null default 1,
 next_task_id uuid references public.wf_tasks(id),
 approved_by uuid references public.profiles(id),
 resolution text not null default '' check(length(resolution)<=2000),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(workspace_id,requested_by,request_key),
 check((kind='handoff' and length(btrim(next_title))>=3 and target_employee_id is not null and state not in ('requested','accepted')) or (kind='help' and next_title='' and state not in ('pending_manager','approved'))),
 check((state='approved')=(next_task_id is not null))
);
create unique index vo_coordination_open on public.vo_coordination(workspace_id,task_id,kind,requested_by) where state in ('pending_manager','requested','accepted');
create index vo_coordination_task on public.vo_coordination(task_id);
create index vo_coordination_target on public.vo_coordination(target_employee_id,updated_at desc);
create index vo_coordination_sender on public.vo_coordination(sender_employee_id);
create index vo_coordination_approver on public.vo_coordination(approved_by);
create index vo_coordination_next_task on public.vo_coordination(next_task_id);
create index vo_coordination_feed on public.vo_coordination(workspace_id,updated_at desc);
alter table public.vo_coordination enable row level security;
alter table public.vo_coordination force row level security;
revoke all on public.vo_coordination from public,anon,authenticated;
grant all on public.vo_coordination to service_role;
create policy vo_coordination_service on public.vo_coordination for all to service_role using(true) with check(true);

-- Host adapter matches the current can_read_task policy: managers, primary and co-assignees.
-- Kept service-only because the actor is supplied by our verified server session.
create function workforce_private.vo_task_visible(p_actor uuid,p_task uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select workforce_private.task_actor_unbanned(p_actor) and exists(
  select 1 from public.profiles p join public.wf_tasks t on t.id=p_task and t.deleted_at is null
  left join public.wf_employees e on e.user_id=p.id and e.status='active'
  where p.id=p_actor and (p.role='admin' or p.role='employee' and e.id is not null and
   (e.id=t.assignee_id or e.id=any(t.co_assignee_ids) or workforce_private.can_manage_tasks(p_actor)))
 );
$$;
revoke all on function workforce_private.vo_task_visible(uuid,uuid) from public,anon,authenticated;
grant execute on function workforce_private.vo_task_visible(uuid,uuid) to service_role;

create function public.vo_coordination_feed(p_actor uuid,p_workspace text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare employee uuid; manager boolean; result jsonb;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 manager:=employee is null or workforce_private.can_manage_tasks(p_actor);
 select coalesce(jsonb_agg(row order by touched desc),'[]'::jsonb) into result from (
  select c.updated_at touched, jsonb_build_object(
   'id',c.id,'kind',c.kind,'state',c.state,'version',c.version,'summary',c.summary,'nextTitle',c.next_title,
   'senderId',c.sender_employee_id,'targetId',c.target_employee_id,'requestedByMe',c.requested_by=p_actor,
   'taskId',case when workforce_private.vo_task_visible(p_actor,c.task_id) then c.task_id end,
   'taskTitle',case when workforce_private.vo_task_visible(p_actor,c.task_id) then t.title else 'تسليم معتمد' end,
   'taskVersion',case when workforce_private.vo_task_visible(p_actor,c.task_id) then t.version end,
   'taskState',case when workforce_private.vo_task_visible(p_actor,c.task_id) then col.kind end,
   'nextTaskId',case when workforce_private.vo_task_visible(p_actor,c.next_task_id) then c.next_task_id end,
   'resolution',c.resolution,'createdAt',c.created_at,'updatedAt',c.updated_at,
   'canApprove',manager and (employee is null or employee is distinct from c.sender_employee_id and employee is distinct from t.assignee_id and not employee=any(t.co_assignee_ids)),
   'canAccept',employee=c.target_employee_id and c.state='requested',
   'canResolve',c.kind='help' and c.state in ('requested','accepted') and (c.requested_by=p_actor or employee=c.target_employee_id or manager),
   'canRoute',manager and c.kind='help' and c.state='requested',
   'canCancel',c.state in ('pending_manager','requested','accepted') and (c.requested_by=p_actor or manager)
  ) row
  from public.vo_coordination c join public.wf_tasks t on t.id=c.task_id and t.deleted_at is null
  join public.wf_task_columns col on col.id=t.column_id
  where c.workspace_id=p_workspace and (
   workforce_private.vo_task_visible(p_actor,c.task_id) and (manager or c.requested_by=p_actor or employee=c.target_employee_id or employee=c.sender_employee_id)
   or c.state='approved' and employee=c.target_employee_id and workforce_private.vo_task_visible(p_actor,c.next_task_id)
  ) order by c.updated_at desc,c.id limit 100
 ) q;
 return result;
end $$;

create function public.vo_help_candidates(p_actor uuid,p_task uuid) returns uuid[]
language plpgsql security invoker set search_path='' as $$
declare employee uuid; result uuid[];
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 if not workforce_private.vo_task_visible(p_actor,p_task) then raise insufficient_privilege;end if;
 select coalesce(array_agg(e.id order by e.id),'{}'::uuid[]) into result
 from public.wf_employees e join public.profiles p on p.id=e.user_id and p.role='employee'
 where e.status='active' and e.id is distinct from coalesce(employee,(select assignee_id from public.wf_tasks where id=p_task))
  and workforce_private.vo_task_visible(e.user_id,p_task);
 return result;
end $$;

create function public.vo_coordination_command(p_actor uuid,p_workspace text,p_command text,p_id uuid,p_version integer,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare employee uuid; manager boolean; item public.vo_coordination; task public.wf_tasks;
 target uuid; target_user uuid; next_id uuid; current_kind text; payload jsonb; expected integer;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 perform workforce_private.assert_task_management_action(p_actor);
 manager:=employee is null or workforce_private.can_manage_tasks(p_actor);
 if p_workspace is null or length(p_workspace) not between 1 and 120 or p_key is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>12000 then raise sqlstate 'PT400' using message='طلب تنسيق غير صحيح';end if;
 if p_command='create' then
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('kind','taskId','taskVersion','targetId','summary','nextTitle'))
   or coalesce(p_payload->>'kind','') not in ('handoff','help')
   or coalesce(length(btrim(p_payload->>'summary')),0) not between 3 and 2000 then raise sqlstate 'PT400' using message='وضح التسليم أو المساعدة من ٣ إلى ٢٠٠٠ حرف';end if;
  select * into item from public.vo_coordination where workspace_id=p_workspace and requested_by=p_actor and request_key=p_key;
  if item.id is not null then
   if item.kind is distinct from p_payload->>'kind' or item.task_id is distinct from (p_payload->>'taskId')::uuid or item.summary is distinct from btrim(p_payload->>'summary') or item.target_employee_id is distinct from nullif(p_payload->>'targetId','')::uuid or item.next_title is distinct from coalesce(btrim(p_payload->>'nextTitle'),'') then raise sqlstate 'PT409' using message='معرف الطلب مستخدم لتنسيق مختلف';end if;
   if not workforce_private.vo_task_visible(p_actor,item.task_id) then raise insufficient_privilege;end if;
   return jsonb_build_object('id',item.id,'version',item.version,'nextTaskId',item.next_task_id);
  end if;
  -- Task locks precede coordination locks, matching the workforce board/task order.
  perform 1 from public.wf_boards b join public.wf_tasks t on t.board_id=b.id where t.id=(p_payload->>'taskId')::uuid for update of b;
  select * into task from public.wf_tasks where id=(p_payload->>'taskId')::uuid for update;
  if task.id is null or task.deleted_at is not null or task.archived_at is not null or task.test_run_id is not null or not workforce_private.vo_task_visible(p_actor,task.id) then raise insufficient_privilege;end if;
  if task.version is distinct from (p_payload->>'taskVersion')::integer then raise sqlstate 'PT409' using message='تغيرت المهمة؛ حدّث بيانات التنسيق';end if;
  if exists(select 1 from public.wf_boards where id=task.board_id and archived_at is not null) then raise sqlstate 'PT409' using message='اللوحة مؤرشفة';end if;
  target:=nullif(p_payload->>'targetId','')::uuid;
  if target is not null then
   select e.user_id into target_user from public.wf_employees e join public.profiles p on p.id=e.user_id and p.role='employee' where e.id=target and e.status='active' for share of e,p;
   if target_user is null or not workforce_private.task_actor_unbanned(target_user) then raise sqlstate 'PT409' using message='الزميل غير متاح';end if;
   if target=employee then raise sqlstate 'PT400' using message='اختر زميلًا آخر';end if;
  end if;
  if p_payload->>'kind'='handoff' then
   if target is null or coalesce(length(btrim(p_payload->>'nextTitle')),0) not between 3 and 160 then raise sqlstate 'PT400' using message='حدد المستلم وعنوان المرحلة التالية';end if;
  elsif target is not null and not workforce_private.vo_task_visible(target_user,task.id) then raise insufficient_privilege;
  end if;
  insert into public.vo_coordination(workspace_id,kind,task_id,requested_by,sender_employee_id,target_employee_id,request_key,summary,next_title,state)
   values(p_workspace,p_payload->>'kind',task.id,p_actor,coalesce(employee,task.assignee_id),target,p_key,btrim(p_payload->>'summary'),coalesce(btrim(p_payload->>'nextTitle'),''),case when p_payload->>'kind'='handoff' then 'pending_manager' else 'requested' end) returning * into item;
 else
  if p_command not in ('approve','reject','accept','resolve','cancel','route') or p_id is null then raise sqlstate 'PT400' using message='إجراء تنسيق غير صحيح';end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('taskVersion','targetId','resolution')) then raise sqlstate 'PT400' using message='حقول غير مسموحة';end if;
  if coalesce(length(p_payload->>'resolution'),0)>2000 then raise sqlstate 'PT400' using message='الملاحظة تتجاوز ٢٠٠٠ حرف';end if;
  select * into item from public.vo_coordination where id=p_id and workspace_id=p_workspace;
  if item.id is null then raise no_data_found;end if;
  perform 1 from public.wf_boards b join public.wf_tasks t on t.board_id=b.id where t.id=item.task_id for update of b;
  select * into task from public.wf_tasks where id=item.task_id for update;
  select * into item from public.vo_coordination where id=p_id and workspace_id=p_workspace for update;
  if task.deleted_at is not null or task.archived_at is not null or not workforce_private.vo_task_visible(p_actor,task.id) then raise insufficient_privilege;end if;
  if p_command<>'cancel' and exists(select 1 from public.wf_boards where id=task.board_id and archived_at is not null) then raise sqlstate 'PT409' using message='اللوحة مؤرشفة';end if;
  if item.state='approved' and p_command='approve' and manager then return jsonb_build_object('id',item.id,'version',item.version,'nextTaskId',item.next_task_id);end if;
  if p_version is null or item.version<>p_version then raise sqlstate 'PT409' using message='تغير التنسيق؛ حدّث المكتب';end if;
  if p_command in ('approve','reject') then
   if item.kind<>'handoff' or item.state<>'pending_manager' then raise sqlstate 'PT409' using message='التسليم لم يعد بانتظار الاعتماد';end if;
   if not manager or employee is not null and (employee=item.sender_employee_id or employee=task.assignee_id or employee=any(task.co_assignee_ids)) then raise insufficient_privilege;end if;
   if p_command='approve' then
    if task.version is distinct from (p_payload->>'taskVersion')::integer then raise sqlstate 'PT409' using message='تغيرت المهمة؛ راجع أحدث تسليم';end if;
    select kind into current_kind from public.wf_task_columns where id=task.column_id;
    if current_kind<>'done' then raise sqlstate 'PT409' using message='اعتمد مخرجات المهمة الأصلية من صفحة المهمة أولًا';end if;
    select e.user_id into target_user from public.wf_employees e join public.profiles p on p.id=e.user_id and p.role='employee' where e.id=item.target_employee_id and e.status='active' for share of e,p;
    if target_user is null or not workforce_private.task_actor_unbanned(target_user) then raise sqlstate 'PT409' using message='المستلم غير نشط';end if;
    next_id:=gen_random_uuid();
    -- Only the explicitly reviewed handoff text crosses to the new task. No private files or source task metadata are copied.
    perform public.wf_task_command(p_actor,next_id,null,'create',jsonb_build_object('title',item.next_title,'description',item.summary,'completion_criteria','تسليم النتيجة للمراجعة والاعتماد قبل أي مرحلة لاحقة.','assignee_id',item.target_employee_id,'requires_approval',true),gen_random_uuid());
    update public.vo_coordination set state='approved',next_task_id=next_id,approved_by=p_actor,version=version+1,updated_at=clock_timestamp() where id=item.id returning * into item;
   else
    if coalesce(length(btrim(p_payload->>'resolution')),0)<3 then raise sqlstate 'PT400' using message='وضح التعديل المطلوب';end if;
    update public.vo_coordination set state='rejected',resolution=btrim(p_payload->>'resolution'),approved_by=p_actor,version=version+1,updated_at=clock_timestamp() where id=item.id returning * into item;
   end if;
  elsif p_command='route' then
   if not manager or item.kind<>'help' or item.state<>'requested' then raise insufficient_privilege;end if;
   target:=nullif(p_payload->>'targetId','')::uuid;
   select user_id into target_user from public.wf_employees where id=target and status='active' for share;
   if target_user is null or target=item.sender_employee_id or not workforce_private.vo_task_visible(target_user,task.id) then raise insufficient_privilege;end if;
   update public.vo_coordination set target_employee_id=target,version=version+1,updated_at=clock_timestamp() where id=item.id returning * into item;
  elsif p_command='accept' then
   if item.kind<>'help' or item.state<>'requested' or employee is distinct from item.target_employee_id then raise insufficient_privilege;end if;
   update public.vo_coordination set state='accepted',version=version+1,updated_at=clock_timestamp() where id=item.id returning * into item;
  elsif p_command='resolve' then
   if item.kind<>'help' or item.state not in ('requested','accepted') or not (manager or item.requested_by=p_actor or employee=item.target_employee_id) then raise insufficient_privilege;end if;
   if coalesce(length(btrim(p_payload->>'resolution')),0)<3 then raise sqlstate 'PT400' using message='اكتب خلاصة المساعدة';end if;
   update public.vo_coordination set state='resolved',resolution=btrim(p_payload->>'resolution'),version=version+1,updated_at=clock_timestamp() where id=item.id returning * into item;
  else
   if item.state not in ('pending_manager','requested','accepted') or not (manager or item.requested_by=p_actor) then raise insufficient_privilege;end if;
   update public.vo_coordination set state='cancelled',version=version+1,updated_at=clock_timestamp() where id=item.id returning * into item;
  end if;
 end if;
 return jsonb_build_object('id',item.id,'version',item.version,'nextTaskId',item.next_task_id);
end $$;
revoke all on function public.vo_coordination_feed(uuid,text),public.vo_help_candidates(uuid,uuid),public.vo_coordination_command(uuid,text,text,uuid,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.vo_coordination_feed(uuid,text),public.vo_help_candidates(uuid,uuid),public.vo_coordination_command(uuid,text,text,uuid,integer,jsonb,uuid) to service_role;

-- Minimal live HR context for admin-initiated AI conversations. No salary, bank,
-- documents, contact information, leave reasons or device identifiers are returned.
create function public.vo_host_staff_context(p_actor uuid,p_workspace text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare tick timestamptz:=workforce_private.work_now(); employee uuid; directory jsonb; rows jsonb; totals jsonb;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 if employee is not null then raise insufficient_privilege;end if;
 directory:=public.vo_staff_directory(p_actor,p_workspace);
 select jsonb_build_object('active',count(*) filter(where status='active'),'suspended',count(*) filter(where status='suspended'),'ended',count(*) filter(where status='ended'),'total',count(*)) into totals from public.wf_employees;
 select coalesce(jsonb_agg(row),'[]'::jsonb) into rows from (
  select jsonb_build_object('name',e.full_name,'jobTitle',e.job_title,'department',d.name,'employmentStatus',e.status,
   'attendance',coalesce((select p->'presence' from jsonb_array_elements(directory->'staff') p where p->>'id'=e.id::text),jsonb_build_object('online',false,'state','offline','detail','attendance','observedAt',tick)),
   'approvedAbsenceNow',case when exists(select 1 from public.wf_employee_requests r where r.employee_id=e.id and r.status='approved' and r.test_run_id is null and r.kind='leave' and r.starts_at<=tick and r.ends_at>tick) then 'leave'
    when exists(select 1 from public.wf_employee_requests r where r.employee_id=e.id and r.status='approved' and r.test_run_id is null and r.kind='permission' and r.starts_at<=tick and r.ends_at>tick) then 'permission' else null end) row
  from public.wf_employees e left join public.wf_departments d on d.id=e.department_id order by e.full_name,e.id limit 100
 ) q;
 return jsonb_build_object('source','سجل الموارد البشرية والحضور في تواصل النخبة','checkedAt',tick,'counts',totals,'employees',rows,'listedLimit',100,'readOnly',true);
end $$;
revoke all on function public.vo_host_staff_context(uuid,text) from public,anon,authenticated;
grant execute on function public.vo_host_staff_context(uuid,text) to service_role;

create function public.vo_record_host_context(p_id uuid,p_lease uuid,p_agent text,p_content text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.vo_sessions where id=p_id and lease_token=p_lease and status='running' for update;
 if not found then return false;end if;
 if length(p_content)>1000 then raise sqlstate 'PT400' using message='سجل المصدر طويل';end if;
 insert into public.vo_messages(session_id,message_key,agent_id,kind,content,citations)
 values(p_id,'host-context:'||p_lease::text,p_agent,'event',p_content,'[]') on conflict(session_id,message_key) do nothing;
 return true;
end $$;
revoke all on function public.vo_record_host_context(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.vo_record_host_context(uuid,uuid,text,text) to service_role;

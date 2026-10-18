-- Task delegation is independent from HR, finance, execution and approval.
alter table public.wf_employees add column can_manage_tasks boolean not null default false;
create table public.wf_task_assignment_admins (
 user_id uuid primary key references public.profiles(id) on delete restrict,
 display_name text not null default 'مدير الشركة' check(length(display_name) between 1 and 150)
);
alter table public.wf_task_assignment_admins enable row level security;
revoke all on public.wf_task_assignment_admins from public,anon,authenticated;
grant select,insert,update,delete on public.wf_task_assignment_admins to service_role;
alter table public.wf_tasks add column assignee_admin_id uuid references public.profiles(id) on delete restrict;
alter table public.wf_tasks add constraint wf_single_task_assignee check(assignee_id is null or assignee_admin_id is null);
create index wf_tasks_admin_due_idx on public.wf_tasks(assignee_admin_id,due_at) where assignee_admin_id is not null and archived_at is null;
create function workforce_private.can_manage_tasks(p_actor uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.wf_employees e join public.profiles p on p.id=e.user_id
 where e.user_id=p_actor and p.role='employee' and e.status='active' and e.can_manage_tasks);
$$;
create function workforce_private.assert_task_admin_assignee(p_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p_id is not null and not exists(select 1 from public.wf_task_assignment_admins a join public.profiles p on p.id=a.user_id
 where a.user_id=p_id and p.role='admin' and workforce_private.notification_recipient_active(p.id)) then
  raise exception 'المسؤول الإداري غير متاح للإسناد' using errcode='PT409';
 end if;
end $$;
revoke all on function workforce_private.can_manage_tasks(uuid),workforce_private.assert_task_admin_assignee(uuid) from public,anon,authenticated;
grant execute on function workforce_private.can_manage_tasks(uuid),workforce_private.assert_task_admin_assignee(uuid) to service_role;
create or replace function workforce_private.validate_task_payload(p_scope text,p_command text,p_payload jsonb) returns void
language plpgsql set search_path='' as $$
declare allowed text[]; field text; value jsonb;
begin
  allowed:=case p_scope||':'||p_command
    when 'board:create' then array['title','description','allow_self_tasks']
    when 'board:edit' then array['title','description','allow_self_tasks']
    when 'board:archive' then array['archived']
    when 'board:members' then array['employee_ids']
    when 'board:column' then array['id','title','kind','position','archived']
    when 'task:create' then array['board_id','title','description','completion_criteria','client_name','assignee_id','assignee_admin_id','shared_with_board','priority','starts_at','due_at','estimate_minutes','requires_approval']
    when 'task:edit' then array['title','description','completion_criteria','client_name','assignee_id','assignee_admin_id','shared_with_board','priority','starts_at','due_at','estimate_minutes','requires_approval']
    when 'task:move' then array['column_id','position']
    when 'task:block' then array['reason']
    when 'task:archive' then array['archived']
    when 'task:submit' then array['summary','attachment_ids']
    when 'task:review' then array['decision','reason']
    else null end;
  if allowed is null then raise exception 'إجراء غير صحيح' using errcode='PT400'; end if;
  for field,value in select * from jsonb_each(p_payload) loop
    if not(field=any(allowed)) then raise exception 'حقل غير مسموح' using errcode='PT400'; end if;
    if field=any(array['allow_self_tasks','shared_with_board','requires_approval','archived']) then
      if jsonb_typeof(value)<>'boolean' then raise exception 'قيمة اختيار غير صحيحة' using errcode='PT400'; end if;
    elsif field='attachment_ids' then
      if jsonb_typeof(value)<>'array' or jsonb_array_length(value)>20 then raise exception 'اختر حتى 20 مرفقًا للتسليم' using errcode='PT400'; end if;
    elsif field='employee_ids' then
      if jsonb_typeof(value)<>'array' or jsonb_array_length(value)>500 then raise exception 'قائمة الموظفين غير صحيحة' using errcode='PT400'; end if;
    elsif field=any(array['position','estimate_minutes']) then
      if (jsonb_typeof(value)<>'number' and not(field='estimate_minutes' and value='null'::jsonb)) or (jsonb_typeof(value)='number' and value::text !~ '^-?[0-9]+$') then raise exception 'قيمة عددية غير صحيحة' using errcode='PT400'; end if;
    elsif jsonb_typeof(value)<>'string' and not(field=any(array['assignee_id','assignee_admin_id','starts_at','due_at']) and value='null'::jsonb) then
      raise exception 'قيمة نصية غير صحيحة' using errcode='PT400';
    end if;
  end loop;
  if p_command='archive' and not(p_payload ? 'archived') then raise exception 'حدد حالة الأرشفة' using errcode='PT400'; end if;
  if p_command='block' and not(p_payload ? 'reason') then raise exception 'حدد سبب التوقف أو إزالة التوقف' using errcode='PT400'; end if;
end $$;
create or replace function public.wf_task_command(p_actor uuid,p_id uuid,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql set search_path='' as $$
declare task_manager boolean; target_admin uuid; employee uuid; previous jsonb; task public.wf_tasks; board public.wf_boards; target_column public.wf_task_columns;
  original_payload jsonb:=p_payload; can_write boolean; self_owned boolean; current_kind text; target_id uuid; submission_id uuid;
begin
  employee:=workforce_private.assert_task_actor(p_actor);
  task_manager:=employee is null or workforce_private.can_manage_tasks(p_actor);
  previous:=workforce_private.command_retry(p_actor,p_key,'task:'||p_command,p_id,p_payload);
  if previous is not null then return previous; end if;
  perform workforce_private.validate_task_payload('task',p_command,p_payload);
  if p_command='create' then
    if nullif(p_payload->>'board_id','') is null then
      if not task_manager then raise exception 'التكليف متاح للإدارة فقط' using errcode='42501'; end if;
      perform pg_advisory_xact_lock(74122,2);
      select * into board from public.wf_boards where is_team_workspace;
      if not found then
        insert into public.wf_boards(title,allow_self_tasks,is_team_workspace,created_by)
          values('مهام الفريق',false,true,p_actor) returning * into board;
        insert into public.wf_task_columns(board_id,title,kind,position) values
          (board.id,'جديدة','new',0),(board.id,'قيد التنفيذ','in_progress',1),
          (board.id,'بانتظار المراجعة','review',2),(board.id,'تحتاج تعديلًا','changes',3),(board.id,'مكتملة','done',4);
      end if;
      p_payload:=p_payload||jsonb_build_object('board_id',board.id);
    end if;
    select * into board from public.wf_boards where id=(p_payload->>'board_id')::uuid and archived_at is null for update;
    if not found then raise exception 'اللوحة غير متاحة' using errcode='P0002'; end if;
    if not task_manager and (not board.allow_self_tasks or not exists(select 1 from public.wf_board_members where board_id=board.id and employee_id=employee)) then raise exception 'لا يسمح بإنشاء مهمة هنا' using errcode='42501'; end if;
    if not task_manager and ((p_payload ? 'assignee_admin_id') or (p_payload ? 'assignee_id' and p_payload->>'assignee_id' is distinct from employee::text) or coalesce((p_payload->>'shared_with_board')::boolean,false)) then raise exception 'المهمة الذاتية تخصك فقط' using errcode='42501'; end if;
    target_id:=case when not task_manager then employee else nullif(p_payload->>'assignee_id','')::uuid end;
    target_admin:=nullif(p_payload->>'assignee_admin_id','')::uuid;
    perform workforce_private.assert_task_admin_assignee(target_admin);
    if target_admin is not null and target_id is not null then raise exception 'اختر مسؤولًا واحدًا للمهمة' using errcode='PT400'; end if;
    if target_id is not null then
      perform 1 from public.wf_employees where id=target_id and status='active' for share;
      if not found then raise exception 'المكلف غير نشط' using errcode='PT409'; end if;
    end if;
    select * into target_column from public.wf_task_columns where board_id=board.id and kind='new' and archived_at is null order by position,id limit 1;
    if not found then raise exception 'اللوحة تحتاج قائمة جديدة' using errcode='PT409'; end if;
    insert into public.wf_tasks(id,board_id,column_id,title,description,completion_criteria,client_name,assignee_id,assignee_admin_id,created_by,updated_by,assignment_origin,shared_with_board,priority,starts_at,due_at,estimate_minutes,requires_approval)
      values(p_id,board.id,target_column.id,btrim(p_payload->>'title'),coalesce(p_payload->>'description',''),coalesce(p_payload->>'completion_criteria',''),btrim(coalesce(p_payload->>'client_name','')),target_id,target_admin,p_actor,p_actor,case when task_manager then 'admin' else 'self' end,coalesce((p_payload->>'shared_with_board')::boolean,false),coalesce(p_payload->>'priority','normal'),nullif(p_payload->>'starts_at','')::timestamptz,nullif(p_payload->>'due_at','')::timestamptz,(p_payload->>'estimate_minutes')::integer,case when employee is null then coalesce((p_payload->>'requires_approval')::boolean,true) else true end) returning * into task;
  else
    -- Use the same lock order as board/column edits and hierarchy validation.
    select b.* into board from public.wf_boards b join public.wf_tasks t on t.board_id=b.id where t.id=p_id for update of b;
    select * into task from public.wf_tasks where id=p_id for update;
    if not found then raise exception 'المهمة غير متاحة' using errcode='P0002'; end if;
    self_owned:=employee is not null and task.assignment_origin='self' and task.created_by=p_actor and task.assignee_id=employee;
    can_write:=employee is null or task.assignee_id=employee or (task_manager and p_command='edit');
    if can_write is not true then raise exception 'المهمة غير متاحة للتعديل' using errcode='42501'; end if;
    if p_version is null or task.version<>p_version then raise exception 'تغيرت المهمة؛ حدّث البيانات' using errcode='PT409'; end if;
    if board.archived_at is not null then raise exception 'اللوحة مؤرشفة' using errcode='PT409'; end if;
    if task.archived_at is not null and p_command<>'archive' then raise exception 'استعد المهمة المؤرشفة أولًا' using errcode='PT409'; end if;
    select kind into current_kind from public.wf_task_columns where id=task.column_id;
    if p_command='edit' then
      if not task_manager and self_owned is not true then raise exception 'تفاصيل التكليف يعدلها المدير' using errcode='42501'; end if;
      if not task_manager and p_payload ?| array['assignee_id','assignee_admin_id','requires_approval','shared_with_board','board_id'] then raise exception 'حقل غير مسموح' using errcode='42501'; end if;
      target_id:=case when p_payload ? 'assignee_id' then nullif(p_payload->>'assignee_id','')::uuid when p_payload ? 'assignee_admin_id' then null else task.assignee_id end;
      target_admin:=case when p_payload ? 'assignee_admin_id' then nullif(p_payload->>'assignee_admin_id','')::uuid when p_payload ? 'assignee_id' then null else task.assignee_admin_id end;
      perform workforce_private.assert_task_admin_assignee(target_admin);
      if target_id is not null and target_admin is not null then raise exception 'اختر مسؤولًا واحدًا للمهمة' using errcode='PT400'; end if;
      if employee is not null and p_payload->>'requires_approval'='false' then raise exception 'اعتماد المدير مطلوب' using errcode='42501'; end if;
      if p_payload ? 'assignee_id' and nullif(p_payload->>'assignee_id','') is not null then
        perform 1 from public.wf_employees where id=(p_payload->>'assignee_id')::uuid and status='active' for share;
        if not found then raise exception 'المكلف غير نشط' using errcode='PT409'; end if;
      end if;
      if current_kind in ('review','done') then raise exception 'أعد المهمة للتنفيذ قبل تعديل تفاصيلها' using errcode='PT409'; end if;
      update public.wf_tasks set title=coalesce(p_payload->>'title',title),description=coalesce(p_payload->>'description',description),completion_criteria=coalesce(p_payload->>'completion_criteria',completion_criteria),client_name=btrim(coalesce(p_payload->>'client_name',client_name)),priority=coalesce(p_payload->>'priority',priority),starts_at=case when p_payload ? 'starts_at' then nullif(p_payload->>'starts_at','')::timestamptz else starts_at end,due_at=case when p_payload ? 'due_at' then nullif(p_payload->>'due_at','')::timestamptz else due_at end,estimate_minutes=case when p_payload ? 'estimate_minutes' then (p_payload->>'estimate_minutes')::integer else estimate_minutes end,assignee_id=target_id,assignee_admin_id=target_admin,requires_approval=coalesce((p_payload->>'requires_approval')::boolean,requires_approval),shared_with_board=coalesce((p_payload->>'shared_with_board')::boolean,shared_with_board),updated_by=p_actor where id=p_id returning * into task;
    elsif p_command='move' then
      select * into target_column from public.wf_task_columns where id=(p_payload->>'column_id')::uuid and board_id=task.board_id and archived_at is null;
      if not found then raise exception 'القائمة غير متاحة' using errcode='P0002'; end if;
      if target_column.kind in ('review','changes') or (target_column.kind='done' and task.requires_approval) then raise exception 'استخدم التسليم أو قرار المراجعة لهذه الحالة' using errcode='PT409'; end if;
      if current_kind='review' or (current_kind='done' and employee is not null) then raise exception 'تحتاج المهمة قرار المدير لإعادة فتحها' using errcode='PT409'; end if;
      if target_column.kind='in_progress' and (task.blocked_reason<>'' or exists(select 1 from public.wf_task_dependencies d join public.wf_tasks t on t.id=d.depends_on_id join public.wf_task_columns c on c.id=t.column_id where d.task_id=p_id and c.kind<>'done')) then raise exception 'عالج العوائق والاعتماديات أولًا' using errcode='PT409'; end if;
      update public.wf_tasks set column_id=target_column.id,position=coalesce((p_payload->>'position')::bigint,position),updated_by=p_actor where id=p_id returning * into task;
    elsif p_command='block' then
      if current_kind in ('review','done') then raise exception 'المهمة قيد المراجعة أو مكتملة' using errcode='PT409'; end if;
      update public.wf_tasks set blocked_reason=coalesce(p_payload->>'reason',''),updated_by=p_actor where id=p_id returning * into task;
    elsif p_command='archive' then
      if employee is not null and self_owned is not true then raise exception 'أرشفة تكليف المدير غير مسموحة' using errcode='42501'; end if;
      if current_kind='review' then raise exception 'عالج التسليم المعلق أولًا' using errcode='PT409'; end if;
      update public.wf_tasks set archived_at=case when (p_payload->>'archived')::boolean then now() else null end,updated_by=p_actor where id=p_id returning * into task;
    elsif p_command='submit' then
      if current_kind in ('review','done') or task.blocked_reason<>'' then raise exception 'المهمة غير جاهزة للتسليم' using errcode='PT409'; end if;
      if exists(select 1 from public.wf_task_checklist where task_id=p_id and required and not completed) or exists(select 1 from public.wf_task_dependencies d join public.wf_tasks t on t.id=d.depends_on_id join public.wf_task_columns c on c.id=t.column_id where d.task_id=p_id and c.kind<>'done') then raise exception 'أكمل المتطلبات قبل التسليم' using errcode='PT409'; end if;
      select * into target_column from public.wf_task_columns where board_id=task.board_id and kind='review' and archived_at is null order by position,id limit 1;
      if not found then raise exception 'اللوحة تحتاج قائمة مراجعة' using errcode='PT409'; end if;
      insert into public.wf_task_submissions(task_id,submitted_by,summary) values(p_id,p_actor,p_payload->>'summary') returning id into submission_id;
      perform workforce_private.link_submission_files(p_id,submission_id,coalesce(p_payload->'attachment_ids','[]'::jsonb));
      update public.wf_tasks set column_id=target_column.id,updated_by=p_actor where id=p_id returning * into task;
    elsif p_command='review' then
      if employee is not null then raise exception 'اعتماد التسليم للمدير فقط' using errcode='42501'; end if;
      if current_kind<>'review' or coalesce(p_payload->>'decision','') not in ('approved','changes') or coalesce(length(btrim(p_payload->>'reason')),0)<3 then raise exception 'قرار المراجعة غير صحيح' using errcode='PT400'; end if;
      select id into submission_id from public.wf_task_submissions where task_id=p_id and status='pending' for update;
      if not found then raise exception 'لا يوجد تسليم معلق' using errcode='PT409'; end if;
      select * into target_column from public.wf_task_columns where board_id=task.board_id and kind=case when p_payload->>'decision'='approved' then 'done' else 'changes' end and archived_at is null order by position,id limit 1;
      if not found then raise exception 'قائمة القرار غير متاحة' using errcode='PT409'; end if;
      update public.wf_task_submissions set status=p_payload->>'decision',decision_reason=p_payload->>'reason',decided_by=p_actor,decided_at=now() where id=submission_id;
      update public.wf_tasks set column_id=target_column.id,updated_by=p_actor where id=p_id returning * into task;
    else raise exception 'إجراء مهمة غير صحيح' using errcode='PT400'; end if;
  end if;
  return workforce_private.save_command(p_actor,p_key,'task:'||p_command,p_id,original_payload,jsonb_build_object('id',p_id,'version',task.version));
end $$;

create or replace function public.wf_assign_weekly_plan(p_actor uuid,p_key uuid,p_tasks jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare previous jsonb; item jsonb; result jsonb; ids jsonb:='[]'; task_id uuid;
begin
  if workforce_private.assert_task_actor(p_actor) is not null and not workforce_private.can_manage_tasks(p_actor) then raise exception 'إسناد الخطة للإدارة فقط' using errcode='42501'; end if;
  if jsonb_typeof(p_tasks) is distinct from 'array' or jsonb_array_length(p_tasks) not between 1 and 100 then raise exception 'الخطة تتطلب من مهمة إلى 100 مهمة' using errcode='PT400'; end if;
  previous:=workforce_private.command_retry(p_actor,p_key,'weekly-plan',p_key,jsonb_build_object('tasks',p_tasks));
  if previous is not null then return previous; end if;
  for item in select value from jsonb_array_elements(p_tasks) loop
    if jsonb_typeof(item) is distinct from 'object' or not(item ?& array['id','due_at','title','completion_criteria']) or (nullif(item->>'assignee_id','') is null and nullif(item->>'assignee_admin_id','') is null) or nullif(item->>'due_at','') is null or length(btrim(item->>'completion_criteria'))<3 then
      raise exception 'كل مهمة تحتاج مسؤولة وموعدًا ومعيار تسليم' using errcode='PT400';
    end if;
    task_id:=(item->>'id')::uuid;
    result:=public.wf_task_command(p_actor,task_id,null,'create',item-'id',gen_random_uuid());
    ids:=ids||jsonb_build_array(result->'id');
  end loop;
  return workforce_private.save_command(p_actor,p_key,'weekly-plan',p_key,jsonb_build_object('tasks',p_tasks),jsonb_build_object('ids',ids,'count',jsonb_array_length(ids)));
end $$;
create or replace function workforce_private.notify_task_change() returns trigger
language plpgsql set search_path='' as $$
declare recipient uuid; message text; event_kind text; state text;
begin
  recipient:=new.assignee_admin_id;
  if recipient is null then select user_id into recipient from public.wf_employees where id=new.assignee_id and status='active'; end if;
  if recipient is null then return new; end if;
  if TG_OP='INSERT' then event_kind:='assigned'; message:='أُسندت إليك مهمة جديدة';
  elsif new.assignee_id is distinct from old.assignee_id or new.assignee_admin_id is distinct from old.assignee_admin_id then event_kind:='assigned'; message:='أُسندت إليك مهمة جديدة';
  elsif new.column_id is distinct from old.column_id then
    select kind into state from public.wf_task_columns where id=new.column_id;
    if state='review' or (state in ('done','changes') and exists(select 1 from public.wf_task_columns where id=old.column_id and kind='review')) then return new; end if;
    event_kind:='state'; message:='تغيرت حالة مهمتك';
  elsif new.due_at is distinct from old.due_at then event_kind:='deadline'; message:='تغير موعد تسليم مهمتك';
  elsif new.title is distinct from old.title or new.description is distinct from old.description or new.completion_criteria is distinct from old.completion_criteria or new.client_name is distinct from old.client_name then
    event_kind:='updated'; message:='تحدثت تفاصيل مهمتك';
  else return new;
  end if;
  if recipient<>new.updated_by then
    insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
    values(recipient,event_kind,message,new.title,new.id,case when new.assignee_admin_id is not null then '/admin/workforce/tasks/' else '/employee/work/tasks/' end||new.id,'task:'||new.id||':'||new.version||':'||event_kind)
    on conflict(recipient_id,event_key) do nothing;
  end if;
  return new;
end $$;

create function workforce_private.notify_previous_admin_assignee() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.assignee_admin_id is not null and old.assignee_admin_id is distinct from new.assignee_admin_id then
  insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
  values(old.assignee_admin_id,'reassigned','أُعيد إسناد المهمة',new.title,new.id,'/admin/workforce/tasks/'||new.id,'task-reassigned:'||new.id||':'||new.version)
  on conflict(recipient_id,event_key) do nothing;
 end if;
 return new;
end $$;
revoke all on function workforce_private.notify_previous_admin_assignee() from public,anon,authenticated;
grant execute on function workforce_private.notify_previous_admin_assignee() to service_role;
create trigger wf_previous_admin_assignee_notification after update of assignee_admin_id on public.wf_tasks
for each row execute function workforce_private.notify_previous_admin_assignee();
create or replace function public.wf_generate_notification_reminders(p_now timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare task record; doc record; contract record; stage text; heading text; key text; day date:=(p_now at time zone 'Asia/Riyadh')::date; added integer:=0; affected integer; pending_count integer; reminder record;
begin
 if not exists(select 1 from public.wf_notification_delivery_settings where id and enabled) then return jsonb_build_object('created',0); end if;
 perform pg_advisory_xact_lock(74122,31);
 for task in select t.*,coalesce(e.user_id,a.user_id) as user_id,coalesce(e.full_name,a.display_name) as full_name,coalesce(s.workdays,array[0,1,2,3,4,6]) as workdays
 from public.wf_tasks t join public.wf_task_columns c on c.id=t.column_id join public.wf_boards b on b.id=t.board_id
 left join public.wf_employees e on e.id=t.assignee_id left join public.wf_task_assignment_admins a on a.user_id=t.assignee_admin_id left join public.wf_attendance_settings s on s.employee_id=e.id
 where t.archived_at is null and b.archived_at is null and c.kind not in ('done','review') and ((e.status='active' and e.start_date<=day) or (a.user_id is not null and workforce_private.notification_recipient_active(a.user_id)))
 and t.due_at is not null and t.due_at<=p_now+interval '24 hours' loop
  if not(extract(dow from day)::integer=any(task.workdays)) then continue; end if;
  if task.due_at>p_now then
   stage:=case when task.due_at<=p_now+interval '2 hours' then 'due_2h' else 'due_24h' end;
   heading:=case stage when 'due_2h' then 'بقيت ساعتان أو أقل على تسليم مهمة' else 'تسليم مهمة خلال 24 ساعة' end;
   key:='task-reminder:'||task.id||':'||extract(epoch from task.due_at)::bigint||':'||stage;
  else
   if extract(hour from p_now at time zone 'Asia/Riyadh')<9 then continue; end if;
   stage:='overdue';heading:='تأخر موعد تسليم مهمة';key:='task-reminder:'||task.id||':'||extract(epoch from task.due_at)::bigint||':overdue:'||day;
  end if;
  insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
  values(task.user_id,stage,heading,task.title,task.id,case when task.assignee_admin_id is not null then '/admin/workforce/tasks/' else '/employee/work/tasks/' end||task.id,key) on conflict(recipient_id,event_key) do nothing;
  get diagnostics affected=row_count;added:=added+affected;
  if stage='overdue' then
   insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
   select p.id,stage,heading,task.full_name||' — '||task.title,task.id,'/admin/workforce/tasks/'||task.id,key
   from public.profiles p where p.role='admin' and workforce_private.notification_recipient_active(p.id) on conflict(recipient_id,event_key) do nothing;
   get diagnostics affected=row_count;added:=added+affected;
  end if;
 end loop;
 if extract(hour from p_now at time zone 'Asia/Riyadh')>=9 and extract(dow from day)<>5 then
  for reminder in
   select 'requests' as category,count(*) as total,'طلبات وظيفية بانتظار قرارك' as title,'/admin/workforce/approvals' as href from public.wf_employee_requests where status='pending' and created_at<p_now-interval '24 hours'
   union all select 'profile',count(*),'تعديلات بيانات بانتظار قرارك','/admin/workforce/approvals?tab=profile' from public.wf_profile_change_requests where status='pending' and created_at<p_now-interval '24 hours'
   union all select 'submissions',count(*),'تسليمات بانتظار اعتمادك','/admin/workforce?state=review' from public.wf_task_submissions s join public.wf_tasks t on t.id=s.task_id where s.status='pending' and t.archived_at is null and s.created_at<p_now-interval '24 hours'
  loop
   if reminder.total>0 then
    insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
    select id,'approval_reminder',reminder.title,reminder.total||' بانتظار المراجعة لأكثر من 24 ساعة',reminder.href,'approval-reminder:'||reminder.category||':'||day
    from public.profiles p where role='admin' and workforce_private.notification_recipient_active(p.id) on conflict(recipient_id,event_key) do nothing;
    get diagnostics affected=row_count;added:=added+affected;
   end if;
  end loop;
  for doc in select d.*,e.user_id from public.wf_employee_documents d join public.wf_employees e on e.id=d.employee_id where d.archived_at is null and e.status='active' and d.expires_on is not null and d.expires_on<=day+7 loop
   stage:=case when doc.expires_on<day then 'expired' when doc.expires_on<=day+1 then '1d' else '7d' end;
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   select p.id,'document_expiry',case when stage='expired' then 'انتهت صلاحية مستند وظيفي' else 'اقترب انتهاء مستند وظيفي' end,'راجعي المستند وموعد انتهائه في الملف الوظيفي.',
   case when p.role='admin' then '/admin/workforce/employees/'||doc.employee_id else '/employee/profile/documents' end,
   'document-expiry:'||doc.id||':'||doc.expires_on||':'||stage
   from public.profiles p where workforce_private.notification_recipient_active(p.id) and (p.role='admin' or (p.id=doc.user_id and doc.employee_visible)) on conflict(recipient_id,event_key) do nothing;
   get diagnostics affected=row_count;added:=added+affected;
  end loop;
  for contract in select * from public.wf_employees where status='active' and contract_end is not null and contract_end between day and day+30 loop
   stage:=case when contract.contract_end<=day+7 then '7d' else '30d' end;
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   select p.id,'contract_expiry','اقترب انتهاء مدة عقد وظيفي','راجعي تفاصيل العقد في الملف الوظيفي.',
   case when p.role='admin' then '/admin/workforce/employees/'||contract.id else '/employee/profile/contract' end,
   'contract-expiry:'||contract.id||':'||contract.contract_end||':'||stage from public.profiles p
   where workforce_private.notification_recipient_active(p.id) and (p.role='admin' or p.id=contract.user_id) on conflict(recipient_id,event_key) do nothing;
   get diagnostics affected=row_count;added:=added+affected;
  end loop;
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
  select p.id,'attendance_reminder','سجل حضور مفتوح يحتاج تصحيحًا','راجعي الحضور وقدمي طلب تصحيح عند الحاجة.',
   case when p.role='admin' then '/admin/workforce/attendance' else '/employee/attendance/overview' end,'attendance-open:'||a.id||':'||day
   from public.wf_attendance_sessions a join public.wf_employees e on e.id=a.employee_id join public.profiles p on p.role='admin' or p.id=e.user_id
   where a.checked_out is null and a.checked_in<p_now-interval '24 hours' and e.status='active' and workforce_private.notification_recipient_active(p.id)
   on conflict(recipient_id,event_key) do nothing;
  get diagnostics affected=row_count;added:=added+affected;
 end if;
 update public.wf_notification_delivery_settings set last_run_at=now() where id;
 return jsonb_build_object('created',added);
end $$;

-- Unified task assignment. Read visibility never grants execution permission.
alter table public.wf_boards add column is_team_workspace boolean not null default false;
create unique index wf_one_team_workspace on public.wf_boards(is_team_workspace) where is_team_workspace;
alter table public.wf_tasks add column client_name text not null default '' check(length(client_name)<=150);
create index wf_tasks_client_due_idx on public.wf_tasks(client_name,due_at) where archived_at is null;

create or replace function workforce_private.can_read_task(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (workforce_private.is_admin() or
    (workforce_private.employee_id() is not null and exists(select 1 from public.wf_tasks where id=p_id)));
$$;
create or replace function workforce_private.can_read_board(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (workforce_private.is_admin() or
    (workforce_private.employee_id() is not null and exists(select 1 from public.wf_boards where id=p_id)));
$$;

-- Notifications are private to their recipient. Only checked server operations write.
create table public.wf_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null,
  title text not null check(length(title) between 1 and 300),
  body text not null default '' check(length(body)<=2000),
  task_id uuid references public.wf_tasks(id) on delete restrict,
  href text not null check(href like '/employee%' or href like '/admin/workforce%'),
  event_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(recipient_id,event_key)
);
create index wf_notifications_recipient_idx on public.wf_notifications(recipient_id,created_at desc,id);
create index wf_notifications_unread_idx on public.wf_notifications(recipient_id) where read_at is null;
alter table public.wf_notifications enable row level security;
revoke all on public.wf_notifications from public,anon,authenticated;
grant select on public.wf_notifications to authenticated;
grant select,insert,update on public.wf_notifications to service_role;
create policy wf_notifications_read on public.wf_notifications for select to authenticated
using(recipient_id=(select auth.uid()) and ((select workforce_private.is_admin()) or (select workforce_private.employee_id()) is not null));

create function workforce_private.notify_employee_created() returns trigger
language plpgsql set search_path='' as $$
begin
  insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
    values(new.user_id,'welcome','أهلًا بك في فريق تواصل النخبة',
      'مرحبًا '||new.full_name||'، من داشبوردك تستطيعين متابعة مهامك وتسليمها، والاطلاع على مهام الفريق للقراءة. ابدئي بمراجعة ملفك الوظيفي.',
      '/employee','welcome:'||new.id);
  return new;
end $$;
create trigger wf_employee_welcome after insert on public.wf_employees
for each row execute function workforce_private.notify_employee_created();

create function workforce_private.notify_task_change() returns trigger
language plpgsql set search_path='' as $$
declare recipient uuid; message text; event_kind text; state text;
begin
  if new.assignee_id is null then return new; end if;
  select user_id into recipient from public.wf_employees where id=new.assignee_id and status='active';
  if recipient is null then return new; end if;
  if TG_OP='INSERT' then event_kind:='assigned'; message:='أُسندت إليك مهمة جديدة';
  elsif new.assignee_id is distinct from old.assignee_id then event_kind:='assigned'; message:='أُسندت إليك مهمة جديدة';
  elsif new.column_id is distinct from old.column_id then
    select kind into state from public.wf_task_columns where id=new.column_id;
    if state='review' then return new; end if;
    event_kind:='state'; message:='تغيرت حالة مهمتك';
  elsif new.due_at is distinct from old.due_at then event_kind:='deadline'; message:='تغير موعد تسليم مهمتك';
  elsif new.title is distinct from old.title or new.description is distinct from old.description or new.completion_criteria is distinct from old.completion_criteria or new.client_name is distinct from old.client_name then
    event_kind:='updated'; message:='تحدثت تفاصيل مهمتك';
  else return new;
  end if;
  if recipient<>new.updated_by then
    insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
    values(recipient,event_kind,message,new.title,new.id,'/employee/work/tasks/'||new.id,'task:'||new.id||':'||new.version||':'||event_kind)
    on conflict(recipient_id,event_key) do nothing;
  end if;
  return new;
end $$;
create trigger wf_task_notifications after insert or update on public.wf_tasks
for each row execute function workforce_private.notify_task_change();

create function workforce_private.notify_task_submission() returns trigger
language plpgsql set search_path='' as $$
declare task public.wf_tasks; recipient uuid;
begin
  select * into task from public.wf_tasks where id=new.task_id;
  if TG_OP='INSERT' then
    insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
    select p.id,'submitted','تسليم جديد بانتظار اعتمادك',task.title,task.id,'/admin/workforce/tasks/'||task.id,'submission:'||new.id
    from public.profiles p where p.role='admin' and p.id<>new.submitted_by;
  elsif new.status is distinct from old.status and new.status<>'pending' then
    select user_id into recipient from public.wf_employees where id=task.assignee_id and status='active';
    if recipient is not null then
      insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
      values(recipient,new.status,case when new.status='approved' then 'تم اعتماد تسليمك' else 'مهمتك تحتاج تعديلًا' end,
        left(task.title||coalesce(' — '||new.decision_reason,''),2000),task.id,'/employee/work/tasks/'||task.id,'decision:'||new.id||':'||new.status)
      on conflict(recipient_id,event_key) do nothing;
    end if;
  end if;
  return new;
end $$;
create trigger wf_submission_notifications after insert or update on public.wf_task_submissions
for each row execute function workforce_private.notify_task_submission();

create function workforce_private.notify_task_comment() returns trigger
language plpgsql set search_path='' as $$
declare task public.wf_tasks;
begin
  select * into task from public.wf_tasks where id=new.task_id;
  insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
  select p.id,'comment','تعليق جديد على مهمة',task.title,task.id,
    case when p.role='admin' then '/admin/workforce/tasks/' else '/employee/work/tasks/' end||task.id,'comment:'||new.id
  from public.profiles p where p.id<>new.author_id and (p.role='admin' or exists(
    select 1 from public.wf_employees e where e.user_id=p.id and e.id=task.assignee_id and e.status='active'));
  return new;
end $$;
create trigger wf_comment_notifications after insert on public.wf_task_comments
for each row execute function workforce_private.notify_task_comment();
revoke all on function workforce_private.notify_employee_created(),workforce_private.notify_task_change(),workforce_private.notify_task_submission(),workforce_private.notify_task_comment() from public,anon,authenticated;
grant execute on function workforce_private.notify_employee_created(),workforce_private.notify_task_change(),workforce_private.notify_task_submission(),workforce_private.notify_task_comment() to service_role;

-- A plan is committed atomically; retries reuse the same tasks and notifications.
create function public.wf_assign_weekly_plan(p_actor uuid,p_key uuid,p_tasks jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare previous jsonb; item jsonb; result jsonb; ids jsonb:='[]'; task_id uuid;
begin
  if workforce_private.assert_task_actor(p_actor) is not null then raise exception 'إسناد الخطة للإدارة فقط' using errcode='42501'; end if;
  if jsonb_typeof(p_tasks) is distinct from 'array' or jsonb_array_length(p_tasks) not between 1 and 100 then raise exception 'الخطة تتطلب من مهمة إلى 100 مهمة' using errcode='PT400'; end if;
  previous:=workforce_private.command_retry(p_actor,p_key,'weekly-plan',p_key,jsonb_build_object('tasks',p_tasks));
  if previous is not null then return previous; end if;
  for item in select value from jsonb_array_elements(p_tasks) loop
    if jsonb_typeof(item) is distinct from 'object' or not(item ?& array['id','assignee_id','due_at','title','completion_criteria']) or nullif(item->>'assignee_id','') is null or nullif(item->>'due_at','') is null or length(btrim(item->>'completion_criteria'))<3 then
      raise exception 'كل مهمة تحتاج مسؤولة وموعدًا ومعيار تسليم' using errcode='PT400';
    end if;
    task_id:=(item->>'id')::uuid;
    result:=public.wf_task_command(p_actor,task_id,null,'create',item-'id',gen_random_uuid());
    ids:=ids||jsonb_build_array(result->'id');
  end loop;
  return workforce_private.save_command(p_actor,p_key,'weekly-plan',p_key,jsonb_build_object('tasks',p_tasks),jsonb_build_object('ids',ids,'count',jsonb_array_length(ids)));
end $$;
revoke all on function public.wf_assign_weekly_plan(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.wf_assign_weekly_plan(uuid,uuid,jsonb) to service_role;

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
    when 'task:create' then array['board_id','title','description','completion_criteria','client_name','assignee_id','shared_with_board','priority','starts_at','due_at','estimate_minutes','requires_approval']
    when 'task:edit' then array['title','description','completion_criteria','client_name','assignee_id','shared_with_board','priority','starts_at','due_at','estimate_minutes','requires_approval']
    when 'task:move' then array['column_id','position']
    when 'task:block' then array['reason']
    when 'task:archive' then array['archived']
    when 'task:submit' then array['summary']
    when 'task:review' then array['decision','reason']
    else null end;
  if allowed is null then raise exception 'إجراء غير صحيح' using errcode='PT400'; end if;
  for field,value in select * from jsonb_each(p_payload) loop
    if not(field=any(allowed)) then raise exception 'حقل غير مسموح' using errcode='PT400'; end if;
    if field=any(array['allow_self_tasks','shared_with_board','requires_approval','archived']) then
      if jsonb_typeof(value)<>'boolean' then raise exception 'قيمة اختيار غير صحيحة' using errcode='PT400'; end if;
    elsif field='employee_ids' then
      if jsonb_typeof(value)<>'array' or jsonb_array_length(value)>500 then raise exception 'قائمة الموظفين غير صحيحة' using errcode='PT400'; end if;
    elsif field=any(array['position','estimate_minutes']) then
      if (jsonb_typeof(value)<>'number' and not(field='estimate_minutes' and value='null'::jsonb)) or (jsonb_typeof(value)='number' and value::text !~ '^-?[0-9]+$') then raise exception 'قيمة عددية غير صحيحة' using errcode='PT400'; end if;
    elsif jsonb_typeof(value)<>'string' and not(field=any(array['assignee_id','starts_at','due_at']) and value='null'::jsonb) then
      raise exception 'قيمة نصية غير صحيحة' using errcode='PT400';
    end if;
  end loop;
  if p_command='archive' and not(p_payload ? 'archived') then raise exception 'حدد حالة الأرشفة' using errcode='PT400'; end if;
  if p_command='block' and not(p_payload ? 'reason') then raise exception 'حدد سبب التوقف أو إزالة التوقف' using errcode='PT400'; end if;
end $$;
create or replace function public.wf_task_command(p_actor uuid,p_id uuid,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql set search_path='' as $$
declare employee uuid; previous jsonb; task public.wf_tasks; board public.wf_boards; target_column public.wf_task_columns;
  original_payload jsonb:=p_payload; can_write boolean; self_owned boolean; current_kind text; target_id uuid; submission_id uuid;
begin
  employee:=workforce_private.assert_task_actor(p_actor);
  previous:=workforce_private.command_retry(p_actor,p_key,'task:'||p_command,p_id,p_payload);
  if previous is not null then return previous; end if;
  perform workforce_private.validate_task_payload('task',p_command,p_payload);
  if p_command='create' then
    if nullif(p_payload->>'board_id','') is null then
      if employee is not null then raise exception 'التكليف متاح للإدارة فقط' using errcode='42501'; end if;
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
    if employee is not null and (not board.allow_self_tasks or not exists(select 1 from public.wf_board_members where board_id=board.id and employee_id=employee)) then raise exception 'لا يسمح بإنشاء مهمة هنا' using errcode='42501'; end if;
    if employee is not null and ((p_payload ? 'assignee_id' and p_payload->>'assignee_id' is distinct from employee::text) or coalesce((p_payload->>'shared_with_board')::boolean,false)) then raise exception 'المهمة الذاتية تخصك فقط' using errcode='42501'; end if;
    target_id:=case when employee is not null then employee else nullif(p_payload->>'assignee_id','')::uuid end;
    if target_id is not null then
      perform 1 from public.wf_employees where id=target_id and status='active' for share;
      if not found then raise exception 'المكلف غير نشط' using errcode='PT409'; end if;
    end if;
    select * into target_column from public.wf_task_columns where board_id=board.id and kind='new' and archived_at is null order by position,id limit 1;
    if not found then raise exception 'اللوحة تحتاج قائمة جديدة' using errcode='PT409'; end if;
    insert into public.wf_tasks(id,board_id,column_id,title,description,completion_criteria,client_name,assignee_id,created_by,updated_by,assignment_origin,shared_with_board,priority,starts_at,due_at,estimate_minutes,requires_approval)
      values(p_id,board.id,target_column.id,btrim(p_payload->>'title'),coalesce(p_payload->>'description',''),coalesce(p_payload->>'completion_criteria',''),btrim(coalesce(p_payload->>'client_name','')),target_id,p_actor,p_actor,case when employee is null then 'admin' else 'self' end,coalesce((p_payload->>'shared_with_board')::boolean,false),coalesce(p_payload->>'priority','normal'),nullif(p_payload->>'starts_at','')::timestamptz,nullif(p_payload->>'due_at','')::timestamptz,(p_payload->>'estimate_minutes')::integer,case when employee is null then coalesce((p_payload->>'requires_approval')::boolean,true) else true end) returning * into task;
  else
    -- Use the same lock order as board/column edits and hierarchy validation.
    select b.* into board from public.wf_boards b join public.wf_tasks t on t.board_id=b.id where t.id=p_id for update of b;
    select * into task from public.wf_tasks where id=p_id for update;
    if not found then raise exception 'المهمة غير متاحة' using errcode='P0002'; end if;
    self_owned:=employee is not null and task.assignment_origin='self' and task.created_by=p_actor and task.assignee_id=employee;
    can_write:=employee is null or task.assignee_id=employee;
    if can_write is not true then raise exception 'المهمة غير متاحة للتعديل' using errcode='42501'; end if;
    if p_version is null or task.version<>p_version then raise exception 'تغيرت المهمة؛ حدّث البيانات' using errcode='PT409'; end if;
    if board.archived_at is not null then raise exception 'اللوحة مؤرشفة' using errcode='PT409'; end if;
    if task.archived_at is not null and p_command<>'archive' then raise exception 'استعد المهمة المؤرشفة أولًا' using errcode='PT409'; end if;
    select kind into current_kind from public.wf_task_columns where id=task.column_id;
    if p_command='edit' then
      if employee is not null and self_owned is not true then raise exception 'تفاصيل التكليف يعدلها المدير' using errcode='42501'; end if;
      if employee is not null and p_payload ?| array['assignee_id','requires_approval','shared_with_board','board_id'] then raise exception 'حقل غير مسموح' using errcode='42501'; end if;
      if p_payload ? 'assignee_id' and nullif(p_payload->>'assignee_id','') is not null then
        perform 1 from public.wf_employees where id=(p_payload->>'assignee_id')::uuid and status='active' for share;
        if not found then raise exception 'المكلف غير نشط' using errcode='PT409'; end if;
      end if;
      if current_kind in ('review','done') then raise exception 'أعد المهمة للتنفيذ قبل تعديل تفاصيلها' using errcode='PT409'; end if;
      update public.wf_tasks set title=coalesce(p_payload->>'title',title),description=coalesce(p_payload->>'description',description),completion_criteria=coalesce(p_payload->>'completion_criteria',completion_criteria),client_name=btrim(coalesce(p_payload->>'client_name',client_name)),priority=coalesce(p_payload->>'priority',priority),starts_at=case when p_payload ? 'starts_at' then nullif(p_payload->>'starts_at','')::timestamptz else starts_at end,due_at=case when p_payload ? 'due_at' then nullif(p_payload->>'due_at','')::timestamptz else due_at end,estimate_minutes=case when p_payload ? 'estimate_minutes' then (p_payload->>'estimate_minutes')::integer else estimate_minutes end,assignee_id=case when p_payload ? 'assignee_id' then nullif(p_payload->>'assignee_id','')::uuid else assignee_id end,requires_approval=coalesce((p_payload->>'requires_approval')::boolean,requires_approval),shared_with_board=coalesce((p_payload->>'shared_with_board')::boolean,shared_with_board),updated_by=p_actor where id=p_id returning * into task;
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
      insert into public.wf_task_submissions(task_id,submitted_by,summary) values(p_id,p_actor,p_payload->>'summary');
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

create or replace function public.wf_checklist_command(p_actor uuid,p_id uuid,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql set search_path='' as $$
declare employee uuid; task public.wf_tasks; board public.wf_boards; item public.wf_task_checklist;
  previous jsonb; allowed text[]; field text; value jsonb; current_kind text; can_edit boolean;
begin
  employee:=workforce_private.assert_task_actor(p_actor);
  previous:=workforce_private.command_retry(p_actor,p_key,'checklist:'||p_command,p_id,p_payload);
  if previous is not null then return previous; end if;
  allowed:=case p_command when 'add' then array['item_id','title','required'] when 'edit' then array['item_id','title','required'] when 'toggle' then array['item_id','completed'] when 'remove' then array['item_id'] else null end;
  if allowed is null then raise exception 'إجراء تحقق غير صحيح' using errcode='PT400'; end if;
  for field,value in select * from jsonb_each(p_payload) loop
    if not(field=any(allowed)) or (field in ('required','completed') and jsonb_typeof(value)<>'boolean') or (field in ('title','item_id') and jsonb_typeof(value)<>'string') then
      raise exception 'بيانات التحقق غير صحيحة' using errcode='PT400';
    end if;
  end loop;
  if not(p_payload ? 'item_id') or (p_command in ('add','edit') and (not(p_payload ?& array['title','required']) or length(btrim(p_payload->>'title')) not between 1 and 500)) or (p_command='toggle' and not(p_payload ? 'completed')) then
    raise exception 'أكمل بيانات بند التحقق' using errcode='PT400';
  end if;
  select b.* into board from public.wf_boards b join public.wf_tasks t on t.board_id=b.id where t.id=p_id for update of b;
  select * into task from public.wf_tasks where id=p_id for update;
  if not found then raise exception 'المهمة غير متاحة' using errcode='P0002'; end if;
  if employee is not null and task.assignee_id is distinct from employee then
    raise exception 'المهمة غير متاحة للتعديل' using errcode='42501';
  end if;
  can_edit:=employee is null or (task.assignment_origin='self' and task.created_by=p_actor and task.assignee_id=employee);
  if p_command<>'toggle' and can_edit is not true then raise exception 'بنود التكليف يحددها المدير' using errcode='42501'; end if;
  if p_version is null or p_version<>task.version then raise exception 'تغيرت المهمة؛ حدّث البيانات' using errcode='PT409'; end if;
  select kind into current_kind from public.wf_task_columns where id=task.column_id;
  if board.archived_at is not null or task.archived_at is not null or current_kind in ('review','done') then
    raise exception 'أعد المهمة للتنفيذ قبل تعديل التحقق' using errcode='PT409';
  end if;
  if p_command='add' then
    if (select count(*) from public.wf_task_checklist where task_id=p_id)>=200 then raise exception 'الحد الأقصى 200 بند؛ استخدم مهام فرعية لتقسيم العمل' using errcode='PT409'; end if;
    insert into public.wf_task_checklist(id,task_id,title,required,position)
      values((p_payload->>'item_id')::uuid,p_id,btrim(p_payload->>'title'),(p_payload->>'required')::boolean,coalesce((select max(position)+1 from public.wf_task_checklist where task_id=p_id),0)) returning * into item;
  else
    select * into item from public.wf_task_checklist where id=(p_payload->>'item_id')::uuid and task_id=p_id for update;
    if not found then raise exception 'البند غير متاح' using errcode='P0002'; end if;
    if p_command='edit' then
      -- Editing a fulfilled requirement needs a fresh check against its new wording.
      update public.wf_task_checklist set title=btrim(p_payload->>'title'),required=(p_payload->>'required')::boolean,completed=false,completed_by=null,completed_at=null where id=item.id returning * into item;
    elsif p_command='toggle' then
      update public.wf_task_checklist set completed=(p_payload->>'completed')::boolean,completed_by=case when (p_payload->>'completed')::boolean then p_actor else null end,completed_at=case when (p_payload->>'completed')::boolean then now() else null end where id=item.id returning * into item;
    else
      delete from public.wf_task_checklist where id=item.id;
    end if;
  end if;
  update public.wf_tasks set updated_by=p_actor where id=p_id returning * into task;
  insert into public.wf_task_events(task_id,actor_id,action,summary,changed_fields)
    values(p_id,p_actor,'checklist:'||p_command,item.title||case when p_command='toggle' then case when item.completed then ' — مكتمل' else ' — غير مكتمل' end else case when item.required then ' — مطلوب' else ' — اختياري' end end,array['checklist']);
  return workforce_private.save_command(p_actor,p_key,'checklist:'||p_command,p_id,p_payload,jsonb_build_object('id',p_id,'version',task.version,'item_id',item.id));
end $$;

create or replace function public.wf_comments_command(p_actor uuid,p_id uuid,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql set search_path='' as $$
declare employee uuid; previous jsonb; task public.wf_tasks; board public.wf_boards; comment public.wf_task_comments;
  field text; value jsonb; allowed text[]; event_action text;
begin
  employee:=workforce_private.assert_task_actor(p_actor);
  previous:=workforce_private.command_retry(p_actor,p_key,'comments:'||p_command,p_id,p_payload);
  if previous is not null then return previous; end if;
  allowed:=case p_command when 'create' then array['comment_id','body'] when 'edit' then array['comment_id','body'] when 'archive' then array['comment_id','archived'] else null end;
  if allowed is null or not(p_payload ?& allowed) then raise exception 'بيانات التعليق غير مكتملة' using errcode='PT400'; end if;
  for field,value in select * from jsonb_each(p_payload) loop
    if not(field=any(allowed)) or (field='archived' and jsonb_typeof(value)<>'boolean') or (field<>'archived' and jsonb_typeof(value)<>'string') then raise exception 'بيانات التعليق غير صحيحة' using errcode='PT400'; end if;
  end loop;
  if p_command in ('create','edit') and length(btrim(p_payload->>'body')) not between 1 and 10000 then raise exception 'اكتب تعليقًا بين حرف واحد و10000 حرف' using errcode='PT400'; end if;
  select b.* into board from public.wf_boards b join public.wf_tasks t on t.board_id=b.id where t.id=p_id for update of b;
  select * into task from public.wf_tasks where id=p_id for update;
  if not found then raise exception 'المهمة غير متاحة' using errcode='P0002'; end if;
  if employee is not null and task.assignee_id is distinct from employee then raise exception 'التعليق متاح للمدير ومنفذي المهمة فقط' using errcode='42501'; end if;
  if board.archived_at is not null or task.archived_at is not null then raise exception 'تعليقات المهمة المؤرشفة للقراءة فقط' using errcode='PT409'; end if;
  if p_command='create' then
    insert into public.wf_task_comments(id,task_id,author_id,body) values((p_payload->>'comment_id')::uuid,p_id,p_actor,btrim(p_payload->>'body')) returning * into comment;
    event_action:='create';
  else
    select * into comment from public.wf_task_comments where id=(p_payload->>'comment_id')::uuid and task_id=p_id for update;
    if not found then raise exception 'التعليق غير متاح' using errcode='P0002'; end if;
    if (p_command='edit' and comment.author_id<>p_actor) or (p_command='archive' and employee is not null and comment.author_id<>p_actor) then raise exception 'لا يمكنك تعديل تعليق شخص آخر؛ المدير يستطيع أرشفته مع حفظ تاريخه' using errcode='42501'; end if;
    if p_version is null or p_version<>comment.version then raise exception 'تغير التعليق؛ حدّث التعليقات قبل التعديل' using errcode='PT409'; end if;
    if p_command='edit' then
      if comment.archived_at is not null then raise exception 'استعد التعليق قبل تعديل نصه' using errcode='PT409'; end if;
      update public.wf_task_comments set body=btrim(p_payload->>'body'),edited_at=now(),version=version+1 where id=comment.id returning * into comment;
      event_action:='edit';
    else
      update public.wf_task_comments set archived_at=case when (p_payload->>'archived')::boolean then coalesce(archived_at,now()) else null end,version=version+1 where id=comment.id returning * into comment;
      event_action:=case when comment.archived_at is null then 'restore' else 'archive' end;
    end if;
  end if;
  insert into public.wf_task_comment_revisions(comment_id,version,body,archived,action,changed_by)
    values(comment.id,comment.version,comment.body,comment.archived_at is not null,event_action,p_actor);
  insert into public.wf_task_events(task_id,actor_id,action,changed_fields)
    values(p_id,p_actor,'comment:'||event_action,array['comments']);
  return workforce_private.save_command(p_actor,p_key,'comments:'||p_command,p_id,p_payload,jsonb_build_object('id',comment.id,'version',comment.version));
end $$;

create or replace function public.wf_time_command(p_actor uuid,p_id uuid,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql set search_path='' as $$
declare employee uuid; owner_id uuid; previous jsonb; task public.wf_tasks; board public.wf_boards;
  entry public.wf_task_time_entries; start_time timestamptz; end_time timestamptz;
  field text; value jsonb; allowed text[]; event_action text; change_reason text;
begin
  employee:=workforce_private.assert_task_actor(p_actor);
  previous:=workforce_private.command_retry(p_actor,p_key,'time:'||p_command,p_id,p_payload);
  if previous is not null then return previous; end if;
  allowed:=case p_command when 'create' then array['entry_id','starts_at','ends_at','note'] when 'edit' then array['entry_id','starts_at','ends_at','note','reason'] when 'archive' then array['entry_id','archived','reason'] else null end;
  if allowed is null or not(p_payload ?& allowed) then raise exception 'بيانات الوقت غير مكتملة' using errcode='PT400'; end if;
  for field,value in select * from jsonb_each(p_payload) loop
    if not(field=any(allowed)) or (field='archived' and jsonb_typeof(value)<>'boolean') or (field<>'archived' and jsonb_typeof(value)<>'string') then raise exception 'بيانات الوقت غير صحيحة' using errcode='PT400'; end if;
  end loop;
  change_reason:=btrim(coalesce(p_payload->>'reason','تسجيل وقت عمل'));
  if length(change_reason) not between 3 and 1000 then raise exception 'اكتب سببًا واضحًا للتصحيح أو الأرشفة بين3 و1000 حرف' using errcode='PT400'; end if;
  if p_command='create' then
    if employee is null then raise exception 'يسجل الموظف وقت عمله من حسابه' using errcode='42501'; end if;
    owner_id:=employee;
  else
    select employee_id into owner_id from public.wf_task_time_entries where id=(p_payload->>'entry_id')::uuid and task_id=p_id;
    if not found then raise exception 'سجل الوقت غير متاح' using errcode='P0002'; end if;
    if employee is not null and employee<>owner_id then raise exception 'لا يمكنك تغيير وقت زميلك' using errcode='42501'; end if;
    if p_command='edit' and employee is null then raise exception 'صاحب السجل يصحح وقته؛ يستطيع المدير أرشفته بسبب موثق' using errcode='42501'; end if;
  end if;
  -- Serialize the employee's periods across every task before taking board/task locks.
  perform pg_advisory_xact_lock(hashtextextended('wf-time:'||owner_id::text,0));
  select b.* into board from public.wf_boards b join public.wf_tasks t on t.board_id=b.id where t.id=p_id for update of b;
  select * into task from public.wf_tasks where id=p_id for update;
  if not found then raise exception 'المهمة غير متاحة' using errcode='P0002'; end if;
  if employee is not null and task.assignee_id is distinct from employee then raise exception 'تسجيل الوقت متاح لمنفذي المهمة فقط' using errcode='42501'; end if;
  if board.archived_at is not null or task.archived_at is not null then raise exception 'سجل وقت المهمة المؤرشفة للقراءة فقط' using errcode='PT409'; end if;
  if p_command<>'create' then
    select * into entry from public.wf_task_time_entries where id=(p_payload->>'entry_id')::uuid and task_id=p_id for update;
    if p_version is null or p_version<>entry.version then raise exception 'تغير سجل الوقت؛ حدّث القائمة قبل التصحيح' using errcode='PT409'; end if;
  end if;
  if p_command in ('create','edit') then
    if length(btrim(p_payload->>'note')) not between 3 and 2000 then raise exception 'اكتب وصف العمل بين3 و2000 حرف' using errcode='PT400'; end if;
    begin
      if (p_payload->>'starts_at') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or (p_payload->>'ends_at') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'timezone required'; end if;
      start_time:=(p_payload->>'starts_at')::timestamptz;
      end_time:=(p_payload->>'ends_at')::timestamptz;
    exception when others then raise exception 'حدد بداية ونهاية صحيحتين بتوقيت الشركة' using errcode='PT400'; end;
    if start_time<'2000-01-01'::timestamptz or end_time>clock_timestamp() or end_time<=start_time or end_time>start_time+interval '24 hours' then raise exception 'سجل فترة عمل سابقة موجبة لا تتجاوز24 ساعة' using errcode='PT400'; end if;
    if entry.archived_at is not null then raise exception 'استعد السجل قبل تصحيحه' using errcode='PT409'; end if;
  else
    start_time:=entry.starts_at; end_time:=entry.ends_at;
  end if;
  if p_command in ('create','edit') or (p_command='archive' and not (p_payload->>'archived')::boolean) then
    if exists(select 1 from public.wf_task_time_entries e where e.employee_id=owner_id and e.id<>(p_payload->>'entry_id')::uuid and e.archived_at is null
      and tstzrange(e.starts_at,e.ends_at,'[)') && tstzrange(start_time,end_time,'[)')) then
      raise exception 'تتداخل الفترة مع وقت مسجل لك؛ راجع سجل وقتك بدل احتسابها مرتين' using errcode='PT409'; end if;
  end if;
  if p_command='create' then
    insert into public.wf_task_time_entries(id,task_id,employee_id,starts_at,ends_at,note,created_by)
      values((p_payload->>'entry_id')::uuid,p_id,owner_id,start_time,end_time,btrim(p_payload->>'note'),p_actor) returning * into entry;
    event_action:='create';
  elsif p_command='edit' then
    update public.wf_task_time_entries set starts_at=start_time,ends_at=end_time,note=btrim(p_payload->>'note'),version=version+1 where id=entry.id returning * into entry;
    event_action:='edit';
  else
    update public.wf_task_time_entries set archived_at=case when (p_payload->>'archived')::boolean then coalesce(archived_at,now()) else null end,version=version+1 where id=entry.id returning * into entry;
    event_action:=case when entry.archived_at is null then 'restore' else 'archive' end;
  end if;
  insert into public.wf_task_time_revisions(entry_id,version,starts_at,ends_at,note,archived,action,reason,changed_by)
    values(entry.id,entry.version,entry.starts_at,entry.ends_at,entry.note,entry.archived_at is not null,event_action,change_reason,p_actor);
  -- Other task readers see that time changed, never the employee's private period or note.
  insert into public.wf_task_events(task_id,actor_id,action,changed_fields) values(p_id,p_actor,'time:'||event_action,array['time']);
  return workforce_private.save_command(p_actor,p_key,'time:'||p_command,p_id,p_payload,jsonb_build_object('id',entry.id,'version',entry.version));
end $$;

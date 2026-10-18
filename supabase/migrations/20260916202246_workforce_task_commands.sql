-- Submission order must remain deterministic across multiple attempts in one transaction.
alter table public.wf_task_submissions add column submission_number bigint generated always as identity;
create unique index wf_task_submission_number_idx on public.wf_task_submissions(submission_number);
grant usage,select on sequence public.wf_task_submissions_submission_number_seq to service_role;
create or replace function workforce_private.guard_task_record() returns trigger
language plpgsql set search_path='' as $$
declare target_kind text;
begin
  if TG_OP='UPDATE' then
    if new.id<>old.id or new.board_id<>old.board_id or new.created_by<>old.created_by or new.assignment_origin<>old.assignment_origin then
      raise exception 'هوية المهمة ومصدر التكليف غير قابلين للتغيير' using errcode='42501';
    end if;
    new.version:=old.version+1;
    new.updated_at:=now();
  end if;
  -- Parent tasks stay in the same board by FK; serialize hierarchy edits per board.
  if new.parent_id is not null then
    perform 1 from public.wf_boards where id=new.board_id for update;
    if exists (
      with recursive ancestors(id,parent_id) as (
        select t.id,t.parent_id from public.wf_tasks t where t.id=new.parent_id
        union
        select t.id,t.parent_id from public.wf_tasks t join ancestors a on t.id=a.parent_id
      ) select 1 from ancestors where id=new.id
    ) then raise exception 'لا يمكن إنشاء تسلسل دائري للمهام الفرعية' using errcode='PT409'; end if;
  end if;
  select c.kind into target_kind from public.wf_task_columns c where c.id=new.column_id and c.board_id=new.board_id;
  if target_kind='done' then
    if exists(select 1 from public.wf_task_checklist where task_id=new.id and required and not completed) then
      raise exception 'أكمل عناصر التحقق المطلوبة أولًا' using errcode='PT409';
    end if;
    if new.blocked_reason<>'' then raise exception 'المهمة متوقفة؛ عالج سبب التوقف أولًا' using errcode='PT409'; end if;
    if exists(select 1 from public.wf_task_dependencies d join public.wf_tasks t on t.id=d.depends_on_id join public.wf_task_columns c on c.id=t.column_id where d.task_id=new.id and c.kind<>'done') then
      raise exception 'توجد مهام تعتمد عليها لم تكتمل' using errcode='PT409';
    end if;
    if exists(select 1 from public.wf_tasks t join public.wf_task_columns c on c.id=t.column_id where t.parent_id=new.id and t.archived_at is null and c.kind<>'done') then
      raise exception 'توجد مهام فرعية لم تكتمل' using errcode='PT409';
    end if;
    if new.requires_approval and coalesce((select s.status from public.wf_task_submissions s where s.task_id=new.id order by s.submission_number desc limit 1),'')<>'approved' then
      raise exception 'المهمة تتطلب اعتماد التسليم' using errcode='PT409';
    end if;
    new.completed_at:=coalesce(new.completed_at,now());
  else new.completed_at:=null;
  end if;
  return new;
end $$;

-- Atomic, service-only workforce commands. Actor identity comes from server auth.getUser().
create table workforce_private.command_receipts (
  actor_id uuid not null references public.profiles(id),
  request_id uuid not null,
  command text not null,
  entity_id uuid not null,
  payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id,request_id)
);
alter table workforce_private.command_receipts enable row level security;
revoke all on workforce_private.command_receipts from public,anon,authenticated;
grant all on workforce_private.command_receipts to service_role;

-- Auth's table is intentionally not granted to service_role. This private lookup
-- exposes only account eligibility to the trusted server, never auth records.
create function workforce_private.task_actor_unbanned(p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select current_setting('role',true)='service_role' and exists(
    select 1 from auth.users where id=p_actor and (banned_until is null or banned_until<now())
  );
$$;
revoke all on function workforce_private.task_actor_unbanned(uuid) from public,anon,authenticated;
grant execute on function workforce_private.task_actor_unbanned(uuid) to service_role;

create function workforce_private.assert_task_actor(p_actor uuid) returns uuid
language plpgsql set search_path='' as $$
declare actor_role text; employee uuid;
begin
  select p.role into actor_role from public.profiles p
    where p.id=p_actor and workforce_private.task_actor_unbanned(p_actor) for share of p;
  if actor_role='admin' then return null; end if;
  if actor_role is distinct from 'employee' then raise exception 'غير مصرح' using errcode='42501'; end if;
  select id into employee from public.wf_employees where user_id=p_actor and status='active' for share;
  if employee is null then raise exception 'الحساب الوظيفي غير نشط' using errcode='42501'; end if;
  return employee;
end $$;
create function workforce_private.command_retry(p_actor uuid,p_key uuid,p_command text,p_id uuid,p_payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare receipt workforce_private.command_receipts;
begin
  if p_key is null or p_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>100000 then
    raise exception 'طلب غير صحيح' using errcode='PT400';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text||p_key::text,0));
  select * into receipt from workforce_private.command_receipts where actor_id=p_actor and request_id=p_key;
  if found then
    if receipt.command<>p_command or receipt.entity_id<>p_id or receipt.payload<>p_payload then raise exception 'مفتاح إعادة المحاولة مستخدم لطلب مختلف' using errcode='PT409'; end if;
    return receipt.response;
  end if;
  return null;
end $$;
create function workforce_private.save_command(p_actor uuid,p_key uuid,p_command text,p_id uuid,p_payload jsonb,p_response jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
  insert into workforce_private.command_receipts(actor_id,request_id,command,entity_id,payload,response) values(p_actor,p_key,p_command,p_id,p_payload,p_response);
  return p_response;
end $$;

-- Reject unknown and malformed fields rather than silently dropping user changes.
create function workforce_private.validate_task_payload(p_scope text,p_command text,p_payload jsonb) returns void
language plpgsql set search_path='' as $$
declare allowed text[]; field text; value jsonb;
begin
  allowed:=case p_scope||':'||p_command
    when 'board:create' then array['title','description','allow_self_tasks']
    when 'board:edit' then array['title','description','allow_self_tasks']
    when 'board:archive' then array['archived']
    when 'board:members' then array['employee_ids']
    when 'board:column' then array['id','title','kind','position','archived']
    when 'task:create' then array['board_id','title','description','completion_criteria','assignee_id','shared_with_board','priority','starts_at','due_at','estimate_minutes','requires_approval']
    when 'task:edit' then array['title','description','completion_criteria','assignee_id','shared_with_board','priority','starts_at','due_at','estimate_minutes','requires_approval']
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
revoke all on function workforce_private.validate_task_payload(text,text,jsonb) from public,anon,authenticated;
grant execute on function workforce_private.validate_task_payload(text,text,jsonb) to service_role;

create function public.wf_board_command(p_actor uuid,p_id uuid,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql set search_path='' as $$
declare employee uuid; previous jsonb; board public.wf_boards; member_id uuid; v_column_id uuid; column_kind text;
begin
  employee:=workforce_private.assert_task_actor(p_actor);
  if employee is not null then raise exception 'إدارة اللوحات للمدير فقط' using errcode='42501'; end if;
  previous:=workforce_private.command_retry(p_actor,p_key,'board:'||p_command,p_id,p_payload);
  if previous is not null then return previous; end if;
  perform workforce_private.validate_task_payload('board',p_command,p_payload);
  if p_command='create' then
    insert into public.wf_boards(id,title,description,allow_self_tasks,created_by)
      values(p_id,btrim(p_payload->>'title'),coalesce(p_payload->>'description',''),coalesce((p_payload->>'allow_self_tasks')::boolean,true),p_actor) returning * into board;
    insert into public.wf_task_columns(board_id,title,kind,position) values
      (p_id,'جديدة','new',0),(p_id,'قيد التنفيذ','in_progress',1),(p_id,'بانتظار المراجعة','review',2),(p_id,'تحتاج تعديلًا','changes',3),(p_id,'مكتملة','done',4);
  else
    select * into board from public.wf_boards where id=p_id for update;
    if not found then raise exception 'اللوحة غير متاحة' using errcode='P0002'; end if;
    if p_version is null or board.version<>p_version then raise exception 'تغيرت اللوحة؛ حدّث البيانات' using errcode='PT409'; end if;
    if p_command='edit' then
      update public.wf_boards set title=coalesce(p_payload->>'title',title),description=coalesce(p_payload->>'description',description),allow_self_tasks=coalesce((p_payload->>'allow_self_tasks')::boolean,allow_self_tasks) where id=p_id;
    elsif p_command='archive' then
      update public.wf_boards set archived_at=case when (p_payload->>'archived')::boolean then now() else null end where id=p_id;
    elsif p_command='members' then
      if jsonb_typeof(p_payload->'employee_ids') is distinct from 'array' then raise exception 'قائمة الموظفين غير صحيحة' using errcode='PT400'; end if;
      for member_id in select distinct value::uuid from jsonb_array_elements_text(p_payload->'employee_ids') loop
        perform 1 from public.wf_employees e join public.profiles p on p.id=e.user_id where e.id=member_id and e.status='active' and p.role='employee' for share of e;
        if not found then raise exception 'أحد الموظفين غير نشط' using errcode='PT409'; end if;
      end loop;
      delete from public.wf_board_members where board_id=p_id;
      insert into public.wf_board_members(board_id,employee_id,created_by) select p_id,value::uuid,p_actor from (select distinct value from jsonb_array_elements_text(p_payload->'employee_ids')) members;
    elsif p_command='column' then
      v_column_id:=(p_payload->>'id')::uuid;
      if v_column_id is null then v_column_id:=gen_random_uuid(); end if;
      if exists(select 1 from public.wf_task_columns where id=v_column_id) then
        select kind into column_kind from public.wf_task_columns where id=v_column_id and board_id=p_id for update;
        if not found then raise exception 'القائمة غير متاحة' using errcode='P0002'; end if;
        if p_payload ? 'kind' and p_payload->>'kind'<>column_kind then raise exception 'لا تغير معنى قائمة مستخدمة؛ أنشئ قائمة أخرى' using errcode='PT409'; end if;
        if coalesce((p_payload->>'archived')::boolean,false) and exists(select 1 from public.wf_tasks where wf_tasks.column_id=v_column_id) then raise exception 'انقل المهام قبل أرشفة القائمة' using errcode='PT409'; end if;
        update public.wf_task_columns c set title=coalesce(p_payload->>'title',c.title),position=coalesce((p_payload->>'position')::integer,c.position),archived_at=case when p_payload ? 'archived' then case when (p_payload->>'archived')::boolean then now() else null end else c.archived_at end where c.id=v_column_id and c.board_id=p_id;
      else
        insert into public.wf_task_columns(id,board_id,title,kind,position) values(v_column_id,p_id,p_payload->>'title',p_payload->>'kind',coalesce((p_payload->>'position')::integer,0));
      end if;
    else raise exception 'إجراء لوحة غير صحيح' using errcode='PT400'; end if;
    update public.wf_boards set version=version+1,updated_at=now() where id=p_id returning * into board;
  end if;
  insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields) values('wf_boards',p_id::text,p_command,p_actor,array(select jsonb_object_keys(p_payload)));
  return workforce_private.save_command(p_actor,p_key,'board:'||p_command,p_id,p_payload,jsonb_build_object('id',p_id,'version',board.version));
end $$;

create function public.wf_task_command(p_actor uuid,p_id uuid,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql set search_path='' as $$
declare employee uuid; previous jsonb; task public.wf_tasks; board public.wf_boards; target_column public.wf_task_columns;
  can_write boolean; self_owned boolean; current_kind text; target_id uuid; submission_id uuid;
begin
  employee:=workforce_private.assert_task_actor(p_actor);
  previous:=workforce_private.command_retry(p_actor,p_key,'task:'||p_command,p_id,p_payload);
  if previous is not null then return previous; end if;
  perform workforce_private.validate_task_payload('task',p_command,p_payload);
  if p_command='create' then
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
    insert into public.wf_tasks(id,board_id,column_id,title,description,completion_criteria,assignee_id,created_by,updated_by,assignment_origin,shared_with_board,priority,starts_at,due_at,estimate_minutes,requires_approval)
      values(p_id,board.id,target_column.id,btrim(p_payload->>'title'),coalesce(p_payload->>'description',''),coalesce(p_payload->>'completion_criteria',''),target_id,p_actor,p_actor,case when employee is null then 'admin' else 'self' end,coalesce((p_payload->>'shared_with_board')::boolean,false),coalesce(p_payload->>'priority','normal'),nullif(p_payload->>'starts_at','')::timestamptz,nullif(p_payload->>'due_at','')::timestamptz,(p_payload->>'estimate_minutes')::integer,case when employee is null then coalesce((p_payload->>'requires_approval')::boolean,true) else true end) returning * into task;
  else
    -- Use the same lock order as board/column edits and hierarchy validation.
    select b.* into board from public.wf_boards b join public.wf_tasks t on t.board_id=b.id where t.id=p_id for update of b;
    select * into task from public.wf_tasks where id=p_id for update;
    if not found then raise exception 'المهمة غير متاحة' using errcode='P0002'; end if;
    self_owned:=employee is not null and task.assignment_origin='self' and task.created_by=p_actor and task.assignee_id=employee;
    can_write:=employee is null or task.assignee_id=employee or exists(select 1 from public.wf_task_members where task_id=p_id and employee_id=employee and participation='participant');
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
      update public.wf_tasks set title=coalesce(p_payload->>'title',title),description=coalesce(p_payload->>'description',description),completion_criteria=coalesce(p_payload->>'completion_criteria',completion_criteria),priority=coalesce(p_payload->>'priority',priority),starts_at=case when p_payload ? 'starts_at' then nullif(p_payload->>'starts_at','')::timestamptz else starts_at end,due_at=case when p_payload ? 'due_at' then nullif(p_payload->>'due_at','')::timestamptz else due_at end,estimate_minutes=case when p_payload ? 'estimate_minutes' then (p_payload->>'estimate_minutes')::integer else estimate_minutes end,assignee_id=case when p_payload ? 'assignee_id' then nullif(p_payload->>'assignee_id','')::uuid else assignee_id end,requires_approval=coalesce((p_payload->>'requires_approval')::boolean,requires_approval),shared_with_board=coalesce((p_payload->>'shared_with_board')::boolean,shared_with_board),updated_by=p_actor where id=p_id returning * into task;
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
  return workforce_private.save_command(p_actor,p_key,'task:'||p_command,p_id,p_payload,jsonb_build_object('id',p_id,'version',task.version));
end $$;
revoke all on function workforce_private.assert_task_actor(uuid), workforce_private.command_retry(uuid,uuid,text,uuid,jsonb), workforce_private.save_command(uuid,uuid,text,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function workforce_private.assert_task_actor(uuid), workforce_private.command_retry(uuid,uuid,text,uuid,jsonb), workforce_private.save_command(uuid,uuid,text,uuid,jsonb,jsonb) to service_role;
revoke all on function public.wf_board_command(uuid,uuid,integer,text,jsonb,uuid), public.wf_task_command(uuid,uuid,integer,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.wf_board_command(uuid,uuid,integer,text,jsonb,uuid), public.wf_task_command(uuid,uuid,integer,text,jsonb,uuid) to service_role;

-- Private objects have no client Storage policies. Every download rechecks the session and task RLS.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('workforce-task-files','workforce-task-files',false,4194304,
array['application/pdf','image/png','image/jpeg','image/webp','application/zip','text/plain','text/csv',
'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
'application/vnd.openxmlformats-officedocument.presentationml.presentation']);

alter table public.wf_task_attachments add column sha256 text check(sha256 ~ '^[a-f0-9]{64}$');
alter table public.wf_task_attachments add column purpose text not null default 'task' check(purpose in ('task','delivery'));
alter table public.wf_task_attachments drop constraint wf_task_attachments_mime_type_check;
alter table public.wf_task_attachments add constraint wf_task_attachments_mime_type_check check(mime_type in (
'application/pdf','image/png','image/jpeg','image/webp','application/zip','text/plain','text/csv',
'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
'application/vnd.openxmlformats-officedocument.presentationml.presentation'));

create table public.wf_submission_attachments (
 submission_id uuid not null references public.wf_task_submissions(id) on delete restrict,
 attachment_id uuid not null references public.wf_task_attachments(id) on delete restrict,
 primary key(submission_id,attachment_id)
);
create index wf_submission_attachments_attachment_idx on public.wf_submission_attachments(attachment_id);
alter table public.wf_submission_attachments enable row level security;
revoke all on public.wf_submission_attachments from public,anon,authenticated;
grant select on public.wf_submission_attachments to authenticated;
grant select,insert on public.wf_submission_attachments to service_role;
create policy wf_submission_attachments_read on public.wf_submission_attachments for select to authenticated
using(exists(select 1 from public.wf_task_submissions s where s.id=submission_id and workforce_private.can_read_task(s.task_id)));

create function public.wf_attachment_command(p_actor uuid,p_id uuid,p_task uuid,p_command text,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare employee uuid; task public.wf_tasks; board public.wf_boards; file public.wf_task_attachments; kind text;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,74125));
 select b.* into board from public.wf_boards b join public.wf_tasks t on t.board_id=b.id where t.id=p_task for update of b;
 select * into task from public.wf_tasks where id=p_task for update;
 if not found then raise exception 'المهمة غير متاحة' using errcode='P0002'; end if;
 if employee is not null and task.assignee_id is distinct from employee then raise exception 'يمكنك الإرفاق على مهامك فقط' using errcode='42501'; end if;
 select * into file from public.wf_task_attachments where id=p_id;
 if p_command='add' and file.id is not null then
   if file.task_id<>p_task or file.created_by<>p_actor or file.sha256 is distinct from p_payload->>'sha256'
    or file.filename is distinct from p_payload->>'filename' or file.title is distinct from p_payload->>'title'
    or file.purpose is distinct from p_payload->>'purpose' then
    raise exception 'مفتاح الرفع مستخدم لملف آخر' using errcode='PT409'; end if;
   return jsonb_build_object('id',file.id,'object_path',file.object_path);
 end if;
 select c.kind into kind from public.wf_task_columns c where c.id=task.column_id;
 if board.archived_at is not null or task.archived_at is not null or kind in ('review','done') then
   raise exception 'المرفقات للقراءة أثناء المراجعة أو الإكمال أو الأرشفة' using errcode='PT409'; end if;
 if p_command='add' then
   if (select count(*) from public.wf_task_attachments where task_id=p_task and archived_at is null)>=100 then
     raise exception 'الحد الأقصى 100 مرفق نشط للمهمة' using errcode='PT409'; end if;
   if p_payload->>'object_path' not like p_task::text||'/%' or p_payload->>'sha256' is null then
     raise exception 'بيانات الملف غير صحيحة' using errcode='PT400'; end if;
   insert into public.wf_task_attachments(id,task_id,title,filename,object_path,mime_type,size_bytes,created_by,sha256,purpose)
   values(p_id,p_task,p_payload->>'title',p_payload->>'filename',p_payload->>'object_path',p_payload->>'mime_type',
   (p_payload->>'size_bytes')::integer,p_actor,p_payload->>'sha256',p_payload->>'purpose') returning * into file;
 elsif p_command in ('archive','restore') then
   if file.id is null or file.task_id<>p_task then raise exception 'المرفق غير متاح' using errcode='P0002'; end if;
   if employee is not null and file.created_by<>p_actor then raise exception 'يمكنك إدارة مرفقاتك فقط' using errcode='42501'; end if;
   if exists(select 1 from public.wf_submission_attachments where attachment_id=p_id) then
     raise exception 'مرفق التسليم محفوظ مع المحاولة ولا يمكن إخفاؤه أو استبداله' using errcode='PT409'; end if;
   if (file.archived_at is not null)=(p_command='archive') then return jsonb_build_object('id',p_id); end if;
   update public.wf_task_attachments set archived_at=case when p_command='archive' then now() else null end where id=p_id;
 else raise exception 'إجراء غير صحيح' using errcode='PT400'; end if;
 insert into public.wf_task_events(task_id,actor_id,action,changed_fields,summary)
 values(p_task,p_actor,'attachment:'||p_command,array['attachments'],file.title);
 return jsonb_build_object('id',p_id,'object_path',file.object_path);
end $$;
revoke all on function public.wf_attachment_command(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.wf_attachment_command(uuid,uuid,uuid,text,jsonb) to service_role;

-- Called inside the existing task command transaction, after the same board/task locks.
create function workforce_private.link_submission_files(p_task uuid,p_submission uuid,p_files jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare total integer; unique_total integer; found_total integer;
begin
 if jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files)>20 then
   raise exception 'اختر حتى 20 مرفقًا للتسليم' using errcode='PT400'; end if;
 select count(*),count(distinct v) into total,unique_total from jsonb_array_elements_text(p_files) v;
 select count(*) into found_total from public.wf_task_attachments a
 where a.task_id=p_task and a.archived_at is null and a.id in(select value::uuid from jsonb_array_elements_text(p_files));
 if total<>unique_total or total<>found_total then raise exception 'أحد مرفقات التسليم مكرر أو مؤرشف أو لا يخص المهمة' using errcode='PT409'; end if;
 insert into public.wf_submission_attachments(submission_id,attachment_id)
 select p_submission,value::uuid from jsonb_array_elements_text(p_files);
end $$;
revoke all on function workforce_private.link_submission_files(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function workforce_private.link_submission_files(uuid,uuid,jsonb) to service_role;

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

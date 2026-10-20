CREATE OR REPLACE FUNCTION public.wf_task_command(p_actor uuid, p_id uuid, p_version integer, p_command text, p_payload jsonb, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    can_write:=employee is null or task.assignee_id=employee or employee=any(task.co_assignee_ids) or (task_manager and p_command='edit') or (p_command='review' and (task_manager and task.assignee_id is distinct from employee and not employee=any(task.co_assignee_ids)));
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
      if current_kind='done' or (current_kind='review' and (not task_manager or exists(select 1 from jsonb_object_keys(p_payload) f where f not in ('assignee_id','assignee_admin_id','co_assignee_ids')))) then raise exception 'أثناء المراجعة يمكن تعديل المسند إليهم فقط' using errcode='PT409'; end if;
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
      if employee is not null and not (task_manager and task.assignee_id is distinct from employee and not employee=any(task.co_assignee_ids)) then raise exception 'لا يمكنك مراجعة هذا التسليم' using errcode='42501'; end if;
      if current_kind<>'review' or coalesce(p_payload->>'decision','') not in ('approved','changes') or coalesce(length(btrim(p_payload->>'reason')),0)<3 then raise exception 'قرار المراجعة غير صحيح' using errcode='PT400'; end if;
      select id into submission_id from public.wf_task_submissions where task_id=p_id and status='pending' for update;
      if not found then raise exception 'لا يوجد تسليم معلق' using errcode='PT409'; end if;
      select * into target_column from public.wf_task_columns where board_id=task.board_id and kind=case when p_payload->>'decision'='approved' then 'done' else 'changes' end and archived_at is null order by position,id limit 1;
      if not found then raise exception 'قائمة القرار غير متاحة' using errcode='PT409'; end if;
      update public.wf_task_submissions set status=p_payload->>'decision',decision_reason=p_payload->>'reason',decided_by=p_actor,decided_at=now() where id=submission_id;
      update public.wf_tasks set column_id=target_column.id,updated_by=p_actor where id=p_id returning * into task;
    else raise exception 'إجراء مهمة غير صحيح' using errcode='PT400'; end if;
  end if;
  if p_command in ('create','edit') and p_payload ? 'co_assignee_ids' then
    if not task_manager then raise exception 'تحديد المسؤولين للمدير أو المفوض فقط' using errcode='42501'; end if;
    if exists(select 1 from jsonb_array_elements(p_payload->'co_assignee_ids') x where jsonb_typeof(x)<>'string') then raise exception 'قائمة المسؤولين غير صحيحة' using errcode='PT400'; end if;
    if exists(select 1 from jsonb_array_elements_text(p_payload->'co_assignee_ids') x where not exists(select 1 from public.wf_employees e where e.id=x::uuid and e.status='active')) then raise exception 'أحد المسؤولين غير نشط' using errcode='PT409'; end if;
    update public.wf_tasks set co_assignee_ids=coalesce((select array_agg(distinct x::uuid order by x::uuid) from jsonb_array_elements_text(p_payload->'co_assignee_ids') x where x::uuid is distinct from task.assignee_id),'{}'),updated_by=p_actor
    where id=p_id and co_assignee_ids is distinct from coalesce((select array_agg(distinct x::uuid order by x::uuid) from jsonb_array_elements_text(p_payload->'co_assignee_ids') x where x::uuid is distinct from task.assignee_id),'{}')
    returning * into task;
    if not found then select * into task from public.wf_tasks where id=p_id; end if;
  end if;
  return workforce_private.save_command(p_actor,p_key,'task:'||p_command,p_id,original_payload,jsonb_build_object('id',p_id,'version',task.version));
end $function$;

CREATE OR REPLACE FUNCTION public.wf_attachment_command(p_actor uuid, p_id uuid, p_task uuid, p_command text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare employee uuid; task public.wf_tasks; board public.wf_boards; file public.wf_task_attachments; kind text; reviewer boolean;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,74125));
 select b.* into board from public.wf_boards b join public.wf_tasks t on t.board_id=b.id where t.id=p_task for update of b;
 select * into task from public.wf_tasks where id=p_task for update;
 if not found then raise exception 'المهمة غير متاحة' using errcode='P0002'; end if;
 select c.kind into kind from public.wf_task_columns c where c.id=task.column_id;
 reviewer:=employee is null or (workforce_private.can_manage_tasks(p_actor) and task.assignee_id is distinct from employee and not employee=any(task.co_assignee_ids));
 if employee is not null and not (kind='review' and reviewer) and task.assignee_id is distinct from employee and not employee=any(task.co_assignee_ids) then raise exception 'يمكنك الإرفاق على مهامك فقط' using errcode='42501'; end if;
 select * into file from public.wf_task_attachments where id=p_id;
 if p_command='add' and file.id is not null then
   if file.task_id<>p_task or file.created_by<>p_actor or file.sha256 is distinct from p_payload->>'sha256'
    or file.filename is distinct from p_payload->>'filename' or file.title is distinct from p_payload->>'title'
    or file.purpose is distinct from p_payload->>'purpose' then
    raise exception 'مفتاح الرفع مستخدم لملف آخر' using errcode='PT409'; end if;
   return jsonb_build_object('id',file.id,'object_path',file.object_path);
 end if;
 select c.kind into kind from public.wf_task_columns c where c.id=task.column_id;
 if board.archived_at is not null or task.archived_at is not null or kind='done' or (kind='review' and not reviewer) then
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
   if p_command='restore' and (select count(*) from public.wf_task_attachments where task_id=p_task and archived_at is null)>=100 then
     raise exception 'الحد الأقصى 100 مرفق نشط للمهمة' using errcode='PT409'; end if;
   update public.wf_task_attachments set archived_at=case when p_command='archive' then now() else null end where id=p_id;
 else raise exception 'إجراء غير صحيح' using errcode='PT400'; end if;
 insert into public.wf_task_events(task_id,actor_id,action,changed_fields,summary)
 values(p_task,p_actor,'attachment:'||p_command,array['attachments'],file.title);
 return jsonb_build_object('id',p_id,'object_path',file.object_path);
end $function$;

-- Review reasons are text without a character cap, including notification/email snapshots.
alter table public.wf_notifications drop constraint wf_notifications_body_check;

CREATE OR REPLACE FUNCTION workforce_private.notify_task_submission() RETURNS trigger
LANGUAGE plpgsql SET search_path TO '' AS $function$
declare task public.wf_tasks; files text;
begin
 select * into task from public.wf_tasks where id=new.task_id;
 if TG_OP='INSERT' then
  insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
  select p.id,'submitted','تسليم جديد بانتظار مراجعتك',task.title,task.id,
   case when p.role='admin' then '/admin/workforce/tasks/' else '/employee/work/tasks/' end||task.id,'submission:'||new.id
  from public.profiles p where p.id<>new.submitted_by and (p.role='admin' or exists(
   select 1 from public.wf_employees e where e.user_id=p.id and e.status='active' and e.can_manage_tasks
    and task.assignee_id is distinct from e.id and not e.id=any(task.co_assignee_ids)))
  on conflict(recipient_id,event_key) do nothing;
 elsif new.status is distinct from old.status and new.status<>'pending' then
  select string_agg(a.filename,E'
' order by a.created_at,a.id) into files from public.wf_task_attachments a
   where a.task_id=task.id and a.created_by=new.decided_by and a.created_at>=new.created_at and a.archived_at is null;
  insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
  select p.id,new.status,case when new.status='approved' then 'تم اعتماد تسليمك' else 'مهمتك تحتاج تعديلًا' end,
   task.title||E'
'||coalesce(new.decision_reason,'')||case when files is null then '' else E'
مرفقات المراجعة:
'||files end,
   task.id,case when p.role='admin' then '/admin/workforce/tasks/' else '/employee/work/tasks/' end||task.id,
   'decision:'||new.id||':'||new.status
  from public.profiles p where p.id=task.assignee_admin_id or exists(select 1 from public.wf_employees e
   where e.user_id=p.id and e.status='active' and (e.id=task.assignee_id or e.id=any(task.co_assignee_ids)))
  on conflict(recipient_id,event_key) do nothing;
 end if;
 return new;
end $function$;

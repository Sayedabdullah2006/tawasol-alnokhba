alter table public.wf_tasks add column co_assignee_ids uuid[] not null default '{}' check(cardinality(co_assignee_ids)<=50 and array_position(co_assignee_ids,null) is null);
create index wf_tasks_co_assignees on public.wf_tasks using gin(co_assignee_ids);

CREATE OR REPLACE FUNCTION public.wf_attachment_command(p_actor uuid, p_id uuid, p_task uuid, p_command text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare employee uuid; task public.wf_tasks; board public.wf_boards; file public.wf_task_attachments; kind text;
begin
 employee:=workforce_private.assert_task_actor(p_actor);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,74125));
 select b.* into board from public.wf_boards b join public.wf_tasks t on t.board_id=b.id where t.id=p_task for update of b;
 select * into task from public.wf_tasks where id=p_task for update;
 if not found then raise exception 'المهمة غير متاحة' using errcode='P0002'; end if;
 if employee is not null and task.assignee_id is distinct from employee and not employee=any(task.co_assignee_ids) then raise exception 'يمكنك الإرفاق على مهامك فقط' using errcode='42501'; end if;
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
   if p_command='restore' and (select count(*) from public.wf_task_attachments where task_id=p_task and archived_at is null)>=100 then
     raise exception 'الحد الأقصى 100 مرفق نشط للمهمة' using errcode='PT409'; end if;
   update public.wf_task_attachments set archived_at=case when p_command='archive' then now() else null end where id=p_id;
 else raise exception 'إجراء غير صحيح' using errcode='PT400'; end if;
 insert into public.wf_task_events(task_id,actor_id,action,changed_fields,summary)
 values(p_task,p_actor,'attachment:'||p_command,array['attachments'],file.title);
 return jsonb_build_object('id',p_id,'object_path',file.object_path);
end $function$;


CREATE OR REPLACE FUNCTION public.wf_admin_dashboard(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_employee uuid DEFAULT NULL::uuid, p_client text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  if not workforce_private.is_admin() then raise exception 'لوحة الأداء للإدارة فقط' using errcode='42501'; end if;
  if p_from is not null and p_to is not null and p_to<p_from then raise exception 'نهاية الفترة تسبق بدايتها' using errcode='PT400'; end if;
  if length(coalesce(p_client,''))>150 then raise exception 'اسم العميل طويل جدًا' using errcode='PT400'; end if;
  with tasks as materialized (
    select t.*,c.kind,exists(select 1 from public.wf_task_submissions s where s.task_id=t.id and s.status='pending') as has_submission
    from public.wf_tasks t join public.wf_task_columns c on c.id=t.column_id join public.wf_boards b on b.id=t.board_id
    where t.archived_at is null and b.archived_at is null
      and (p_from is null or t.due_at >= (p_from::timestamp at time zone 'Asia/Riyadh'))
      and (p_to is null or t.due_at < ((p_to+1)::timestamp at time zone 'Asia/Riyadh'))
      and (p_employee is null or t.assignee_id=p_employee or t.assignee_admin_id=p_employee or p_employee=any(t.co_assignee_ids))
      and (nullif(btrim(p_client),'') is null or t.client_name=btrim(p_client))
  ), counts as (
    select coalesce(assignee_id,assignee_admin_id,co_assignee_ids[1]) as assignee_id,grouping(coalesce(assignee_id,assignee_admin_id,co_assignee_ids[1]))=1 as is_total,
      count(*) as assigned,
      count(*) filter(where kind='done') as completed,
      count(*) filter(where kind<>'done') as open,
      count(*) filter(where kind='in_progress') as in_progress,
      count(*) filter(where kind<>'done' and due_at<now()) as overdue,
      count(*) filter(where kind='review' and has_submission) as pending,
      count(*) filter(where kind<>'done' and blocked_reason<>'') as blocked,
      count(*) filter(where kind='done' and due_at is not null and completed_at is not null) as dated_completed,
      count(*) filter(where kind='done' and due_at is not null and completed_at<=due_at) as on_time
    from tasks group by grouping sets ((coalesce(assignee_id,assignee_admin_id,co_assignee_ids[1])),())
  ), staff as (
    select e.id,e.full_name,e.job_title,e.status,
      coalesce((select jsonb_build_object(
'assigned',count(*),'completed',count(*) filter(where kind='done'),'open',count(*) filter(where kind<>'done'),
'in_progress',count(*) filter(where kind='in_progress'),'overdue',count(*) filter(where kind<>'done' and due_at<now()),
'pending',count(*) filter(where kind='review' and has_submission),'blocked',count(*) filter(where kind<>'done' and blocked_reason<>''),
'dated_completed',count(*) filter(where kind='done' and due_at is not null and completed_at is not null),
'on_time',count(*) filter(where kind='done' and due_at is not null and completed_at<=due_at))
from tasks t where t.assignee_id=e.id or e.id=any(t.co_assignee_ids)),
        jsonb_build_object('assigned',0,'completed',0,'open',0,'in_progress',0,'overdue',0,'pending',0,'blocked',0,'dated_completed',0,'on_time',0)) as metrics
    from public.wf_employees e where (p_employee is null or e.id=p_employee)
      and (e.status='active' or e.id=p_employee or exists(select 1 from tasks t where t.assignee_id=e.id or e.id=any(t.co_assignee_ids)))
  )
  select jsonb_build_object(
    'generated_at',now(),
    'totals',(select to_jsonb(c)-'assignee_id'-'is_total' from counts c where c.is_total),
    'unassigned',(select to_jsonb(c)-'assignee_id'-'is_total' from counts c where not c.is_total and c.assignee_id is null),
    'employees',coalesce((select jsonb_agg(to_jsonb(s) order by s.full_name,s.id) from staff s),'[]'::jsonb),
    'clients',coalesce((select jsonb_agg(x.client_name order by x.client_name) from (
      select distinct t.client_name from public.wf_tasks t join public.wf_boards b on b.id=t.board_id
      where t.archived_at is null and b.archived_at is null and t.client_name<>''
    ) x),'[]'::jsonb)
  ) into result;
  return result;
end $function$;


CREATE OR REPLACE FUNCTION public.wf_time_command(p_actor uuid, p_id uuid, p_version integer, p_command text, p_payload jsonb, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  if employee is not null and task.assignee_id is distinct from employee and not employee=any(task.co_assignee_ids) then raise exception 'تسجيل الوقت متاح لمنفذي المهمة فقط' using errcode='42501'; end if;
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
end $function$;


CREATE OR REPLACE FUNCTION workforce_private.validate_task_payload(p_scope text, p_command text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare allowed text[]; field text; value jsonb;
begin
  allowed:=case p_scope||':'||p_command
    when 'board:create' then array['title','description','allow_self_tasks']
    when 'board:edit' then array['title','description','allow_self_tasks']
    when 'board:archive' then array['archived']
    when 'board:members' then array['employee_ids']
    when 'board:column' then array['id','title','kind','position','archived']
    when 'task:create' then array['board_id','title','description','completion_criteria','client_name','assignee_id','assignee_admin_id','co_assignee_ids','shared_with_board','priority','starts_at','due_at','estimate_minutes','requires_approval']
    when 'task:edit' then array['title','description','completion_criteria','client_name','assignee_id','assignee_admin_id','co_assignee_ids','shared_with_board','priority','starts_at','due_at','estimate_minutes','requires_approval']
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
    elsif field='co_assignee_ids' then
      if jsonb_typeof(value)<>'array' or jsonb_array_length(value)>50 then raise exception 'قائمة المسؤولين غير صحيحة' using errcode='PT400'; end if;
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
end $function$;


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
    can_write:=employee is null or task.assignee_id=employee or employee=any(task.co_assignee_ids) or (task_manager and p_command='edit');
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


CREATE OR REPLACE FUNCTION public.wf_checklist_command(p_actor uuid, p_id uuid, p_version integer, p_command text, p_payload jsonb, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  if employee is not null and task.assignee_id is distinct from employee and not employee=any(task.co_assignee_ids) then
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
end $function$;


CREATE OR REPLACE FUNCTION public.wf_comments_command(p_actor uuid, p_id uuid, p_version integer, p_command text, p_payload jsonb, p_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  if employee is not null and task.assignee_id is distinct from employee and not employee=any(task.co_assignee_ids) then raise exception 'التعليق متاح للمدير ومنفذي المهمة فقط' using errcode='42501'; end if;
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
end $function$;


-- Delegated task managers see the team; other employees see only their assignments.
-- Keep the existing private RLS helper as the single read boundary for task children.
create or replace function workforce_private.can_read_task(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
  workforce_private.is_admin() or (
   workforce_private.employee_id() is not null and exists(
    select 1 from public.wf_tasks t where t.id=p_id and (
     t.assignee_id=workforce_private.employee_id() or workforce_private.employee_id()=any(t.co_assignee_ids)
     or workforce_private.can_manage_tasks(auth.uid())
    )
   )
  )
 );
$$;

-- Indexed task files inherit task visibility, including in the knowledge center.
alter policy wf_knowledge_files_read on public.wf_knowledge_files to authenticated using(
 ((select workforce_private.is_admin()) or (select workforce_private.employee_id()) is not null)
 and (deleted_at is null or created_by=(select auth.uid()) or (select workforce_private.is_admin()))
 and (task_attachment_id is null or exists(
  select 1 from public.wf_task_attachments a
  where a.id=task_attachment_id and workforce_private.can_read_task(a.task_id)
 ))
);

alter policy wf_notifications_read on public.wf_notifications to authenticated using(
 recipient_id=(select auth.uid())
 and ((select workforce_private.is_admin()) or (select workforce_private.employee_id()) is not null)
 and (task_id is null or workforce_private.can_read_task(task_id))
);


create function workforce_private.notify_shared_task_change() returns trigger
language plpgsql set search_path='' as $$
declare recipient record; heading text; kind text; message text; previous_title text; next_title text;
begin
 for recipient in select e.id,e.user_id from public.wf_employees e
  where e.id=any(new.co_assignee_ids) and e.status='active' and e.user_id<>new.updated_by
 loop
  kind:=null;
  if tg_op='INSERT' then kind:='assigned'; heading:='أُسندت إليك مهمة مشتركة';
  elsif not recipient.id=any(old.co_assignee_ids) then kind:='assigned'; heading:='أُسندت إليك مهمة مشتركة';
  elsif new.column_id is distinct from old.column_id then kind:='state'; heading:='تغيرت حالة مهمتك المشتركة';
  elsif new.due_at is distinct from old.due_at then kind:='deadline'; heading:='تغير موعد تسليم مهمتك المشتركة';
  elsif new.title is distinct from old.title or new.description is distinct from old.description or new.completion_criteria is distinct from old.completion_criteria then kind:='updated'; heading:='تحدثت تفاصيل مهمتك المشتركة';
  end if;
  if kind is null then continue; end if;
  message:=new.title;
  if kind='state' then
   select title into previous_title from public.wf_task_columns where id=old.column_id;
   select title into next_title from public.wf_task_columns where id=new.column_id;
   message:=message||chr(10)||'الحالة السابقة: '||previous_title||chr(10)||'الحالة الجديدة: '||next_title;
  end if;
  insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
   values(recipient.user_id,kind,heading,message,new.id,'/employee/work/tasks/'||new.id,'shared-task:'||new.id||':'||new.version||':'||kind)
   on conflict(recipient_id,event_key) do nothing;
 end loop;
 return new;
end $$;
revoke all on function workforce_private.notify_shared_task_change() from public,anon,authenticated;
create trigger wf_shared_task_notifications after insert or update on public.wf_tasks for each row execute function workforce_private.notify_shared_task_change();

CREATE OR REPLACE FUNCTION public.wf_claim_notification_deliveries(p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare batch uuid:=gen_random_uuid(); result jsonb;
begin
 update public.wf_notification_delivery_settings set worker_token=batch,worker_until=now()+interval '3 minutes'
 where id and enabled and (worker_until is null or worker_until<now());
 if not found then return jsonb_build_object('deliveries','[]'::jsonb); end if;
 update public.wf_notification_deliveries set status=case when attempts>=6 then 'failed' else 'pending' end,lease_token=null,lease_until=null
 where status='processing' and lease_until<now();
 update public.wf_notification_deliveries d set status='cancelled',last_error='لم يعد تذكير الحضور مطلوبًا'
 from public.wf_notifications n
 where n.id=d.notification_id and d.status='pending' and n.kind='attendance_missing'
 and not workforce_private.attendance_reminder_current(n.recipient_id,n.event_key);
 update public.wf_notification_deliveries d set status='cancelled',last_error='لم يعد تنبيه المدير للحضور مطلوبًا'
 from public.wf_notifications n
 where n.id=d.notification_id and d.status='pending' and n.kind='attendance_missing_admin'
 and not workforce_private.attendance_escalation_current(n.recipient_id,n.event_key);
 update public.wf_notification_deliveries d set status='cancelled',last_error='لم يعد المستلم أو الإشعار متاحًا'
 where d.status='pending' and (not workforce_private.notification_recipient_matches_email(d.recipient_id,d.snapshot->>'email')
 or exists(select 1 from public.wf_notifications n join public.wf_tasks t on t.id=n.task_id join public.wf_task_columns c on c.id=t.column_id
 join public.wf_boards b on b.id=t.board_id where n.id=d.notification_id and n.kind in ('due_24h','due_2h','overdue')
 and (t.archived_at is not null or b.archived_at is not null or c.kind in ('done','review')
 or t.due_at is distinct from (d.snapshot->>'dueAt')::timestamptz
 or (d.snapshot->>'href' like '/employee%' and not exists(select 1 from public.wf_employees e where (e.id=t.assignee_id or e.id=any(t.co_assignee_ids)) and e.user_id=d.recipient_id)))));
 update public.wf_notification_deliveries set status='failed',last_error='انتهت نافذة إعادة المحاولة الآمنة'
 where status='pending' and first_attempt_at<now()-interval '23 hours';
 with picked as(select id from public.wf_notification_deliveries where status='pending' and available_at<=now() and attempts<6 order by available_at,id for update skip locked limit greatest(1,least(p_limit,8))),
 claimed as(update public.wf_notification_deliveries d set status='processing',attempts=attempts+1,lease_token=batch,
 lease_until=now()+interval '3 minutes',first_attempt_at=coalesce(first_attempt_at,now()) from picked where d.id=picked.id returning d.id,d.snapshot)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'snapshot',snapshot)),'[]'::jsonb) into result from claimed;
 return jsonb_build_object('token',batch,'deliveries',result);
end $function$;

CREATE OR REPLACE FUNCTION public.wf_generate_notification_reminders(p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare task record; doc record; contract record; stage text; heading text; key text; day date:=(p_now at time zone 'Asia/Riyadh')::date; added integer:=0; affected integer; pending_count integer; reminder record;
begin
 if not exists(select 1 from public.wf_notification_delivery_settings where id and enabled) then return jsonb_build_object('created',0); end if;
 perform pg_advisory_xact_lock(74122,31);
 for task in select t.*,coalesce(e.user_id,a.user_id) as user_id,coalesce(e.full_name,a.display_name) as full_name,coalesce(s.workdays,array[0,1,2,3,4,6]) as workdays,assignment.admin_id is not null as recipient_is_admin
 from public.wf_tasks t join public.wf_task_columns c on c.id=t.column_id join public.wf_boards b on b.id=t.board_id
 cross join lateral (
select x as employee_id,null::uuid as admin_id from unnest(array_remove(array_prepend(t.assignee_id,t.co_assignee_ids),null)) x
union select null::uuid,t.assignee_admin_id where t.assignee_admin_id is not null
) assignment
left join public.wf_employees e on e.id=assignment.employee_id left join public.wf_task_assignment_admins a on a.user_id=assignment.admin_id left join public.wf_attendance_settings s on s.employee_id=e.id
 where t.test_run_id is null and t.archived_at is null and b.archived_at is null and c.kind not in ('done','review') and ((e.status='active' and e.user_id is not null and workforce_private.notification_recipient_active(e.user_id)) or (a.user_id is not null and workforce_private.notification_recipient_active(a.user_id)))
 and t.due_at is not null and t.due_at<=p_now+interval '24 hours' loop

  if task.due_at>p_now then
   stage:=case when task.due_at<=p_now+interval '2 hours' then 'due_2h' else 'due_24h' end;
   heading:=case stage when 'due_2h' then 'بقيت ساعتان أو أقل على تسليم مهمة' else 'تسليم مهمة خلال 24 ساعة' end;
   key:='task-reminder:'||task.id||':'||extract(epoch from task.due_at)::bigint||':'||stage;
  else
   stage:='overdue';heading:='تأخر موعد تسليم مهمة';key:='task-reminder:'||task.id||':overdue:'||day;
  end if;
  insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
  select task.user_id,stage,heading,task.title,task.id,case when task.recipient_is_admin then '/admin/workforce/tasks/' else '/employee/work/tasks/' end||task.id,key
  where stage<>'overdue' or not exists(select 1 from public.wf_notifications n where n.recipient_id=task.user_id and n.task_id=task.id and n.kind='overdue'
   and n.event_key like 'task-reminder:'||task.id||':%overdue:'||day) on conflict(recipient_id,event_key) do nothing;
  get diagnostics affected=row_count;added:=added+affected;
  if stage='overdue' then
   insert into public.wf_notifications(recipient_id,kind,title,body,task_id,href,event_key)
   select p.id,stage,heading,task.full_name||' — '||task.title,task.id,'/admin/workforce/tasks/'||task.id,key
   from public.profiles p where p.role='admin' and workforce_private.notification_recipient_active(p.id)
   and not exists(select 1 from public.wf_notifications n where n.recipient_id=p.id and n.task_id=task.id and n.kind='overdue'
    and n.event_key like 'task-reminder:'||task.id||':%overdue:'||day) on conflict(recipient_id,event_key) do nothing;
   get diagnostics affected=row_count;added:=added+affected;
  end if;
 end loop;
 if extract(hour from p_now at time zone 'Asia/Riyadh')>=9 and extract(dow from day)<>5 then
  for reminder in
   select 'requests' as category,count(*) as total,'طلبات وظيفية بانتظار قرارك' as title,'/admin/workforce/approvals' as href from public.wf_employee_requests where test_run_id is null and status='pending' and created_at<p_now-interval '24 hours'
   union all select 'profile',count(*),'تعديلات بيانات بانتظار قرارك','/admin/workforce/approvals?tab=profile' from public.wf_profile_change_requests where status='pending' and created_at<p_now-interval '24 hours'
   union all select 'submissions',count(*),'تسليمات بانتظار اعتمادك','/admin/workforce?state=review' from public.wf_task_submissions s join public.wf_tasks t on t.id=s.task_id where t.test_run_id is null and s.status='pending' and t.archived_at is null and s.created_at<p_now-interval '24 hours'
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

 -- Daily employee reminder: first cron pass in the 09:45–09:59 Riyadh window.
 if (p_now at time zone 'Asia/Riyadh')::time>=time '09:45'
  and (p_now at time zone 'Asia/Riyadh')::time<time '10:00' then
  for reminder in select e.id,e.user_id from public.wf_employees e
   where workforce_private.attendance_reminder_needed(e.id,day)
  loop
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   values(reminder.user_id,'attendance_missing','تذكير بتسجيل الحضور',
    'لم يظهر تسجيل حضورك ليوم '||day||'. إذا بدأت دوامك، سجّلي الحضور من الرابط.',
    '/employee/attendance/overview','attendance-missing:'||reminder.id||':'||day)
   on conflict(recipient_id,event_key) do nothing;
   get diagnostics affected=row_count;added:=added+affected;
  end loop;
 end if;

 -- Manager escalation: once per employee and Riyadh business day, from 10:00.
 if (p_now at time zone 'Asia/Riyadh')::time>=time '10:00' then
  for reminder in select e.id,e.full_name,r.user_id as manager_id
   from public.wf_employees e cross join workforce_private.notification_email_routes r
   join public.profiles p on p.id=r.user_id and p.role='admin'
   where workforce_private.attendance_reminder_needed(e.id,day)
    and workforce_private.notification_recipient_active(r.user_id)
  loop
   insert into public.wf_notifications(recipient_id,kind,title,body,href,event_key)
   values(reminder.manager_id,'attendance_missing_admin','عدم تسجيل الحضور حتى 10 صباحًا',
    reminder.full_name||' لم تسجّل الحضور حتى الساعة 10 صباحًا بتوقيت الرياض ليوم '||day||'.',
    '/admin/workforce/attendance?employee_id='||reminder.id,
    'attendance-escalation:'||reminder.id||':'||day)
   on conflict(recipient_id,event_key) do nothing;
   get diagnostics affected=row_count;added:=added+affected;
  end loop;
 end if;

 update public.wf_notification_delivery_settings set last_run_at=now() where id;
 return jsonb_build_object('created',added);
end $function$;




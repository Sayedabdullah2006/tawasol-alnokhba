-- Checklist requirements belong to the assigner; completion belongs to task workers.
-- All commands use the task version, locking board then task as the core commands do.
create function public.wf_checklist_command(p_actor uuid,p_id uuid,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb
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
  if employee is not null and task.assignee_id is distinct from employee and not exists(select 1 from public.wf_task_members where task_id=p_id and employee_id=employee and participation='participant') then
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
revoke all on function public.wf_checklist_command(uuid,uuid,integer,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.wf_checklist_command(uuid,uuid,integer,text,jsonb,uuid) to service_role;

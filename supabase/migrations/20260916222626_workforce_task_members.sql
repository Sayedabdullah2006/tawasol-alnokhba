create function public.wf_members_command(p_actor uuid,p_id uuid,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql set search_path='' as $$
declare previous jsonb; task public.wf_tasks; board public.wf_boards; item jsonb; employee uuid; participant_type text; names text;
begin
  employee:=workforce_private.assert_task_actor(p_actor);
  if employee is not null then raise exception 'إدارة المشاركين والمتابعين للمدير فقط' using errcode='42501'; end if;
  previous:=workforce_private.command_retry(p_actor,p_key,'members:'||p_command,p_id,p_payload);
  if previous is not null then return previous; end if;
  if p_command is distinct from 'save' or (select count(*) from jsonb_object_keys(p_payload))<>1 or jsonb_typeof(p_payload->'members') is distinct from 'array' then raise exception 'قائمة المشاركين غير صحيحة' using errcode='PT400'; end if;
  if jsonb_array_length(p_payload->'members')>100 then raise exception 'الحد الأقصى 100 مشارك ومتابع للمهمة' using errcode='PT400'; end if;
  select b.* into board from public.wf_boards b join public.wf_tasks t on t.board_id=b.id where t.id=p_id for update of b;
  select * into task from public.wf_tasks where id=p_id for update;
  if not found then raise exception 'المهمة غير متاحة' using errcode='P0002'; end if;
  if p_version is null or task.version<>p_version then raise exception 'تغيرت المهمة؛ أعد تحميل المشاركين قبل الحفظ' using errcode='PT409'; end if;
  if task.archived_at is not null or board.archived_at is not null then raise exception 'استعد المهمة واللوحة قبل تغيير المشاركين' using errcode='PT409'; end if;
  for item in select value from jsonb_array_elements(p_payload->'members') loop
    if jsonb_typeof(item)<>'object' then raise exception 'بيانات المشارك غير صحيحة' using errcode='PT400'; end if;
    if not(item ?& array['employee_id','participation']) or (select count(*) from jsonb_object_keys(item))<>2 or jsonb_typeof(item->'employee_id')<>'string' or jsonb_typeof(item->'participation')<>'string' then raise exception 'بيانات المشارك غير صحيحة' using errcode='PT400'; end if;
    employee:=(item->>'employee_id')::uuid; participant_type:=item->>'participation';
    if participant_type not in ('participant','watcher') then raise exception 'نوع المشاركة غير صحيح' using errcode='PT400'; end if;
    if employee=task.assignee_id then raise exception 'المسؤول الأساسي لديه صلاحية التنفيذ بالفعل؛ لا تضفه كمتابع' using errcode='PT400'; end if;
    perform 1 from public.wf_employees e join public.profiles p on p.id=e.user_id where e.id=employee and e.status='active' and p.role='employee' and workforce_private.task_actor_unbanned(p.id) for share of e,p;
    if not found then raise exception 'أحد المشاركين غير نشط أو لم يعد موظفًا' using errcode='PT409'; end if;
  end loop;
  if (select count(distinct value->>'employee_id') from jsonb_array_elements(p_payload->'members'))<>jsonb_array_length(p_payload->'members') then raise exception 'الموظف مكرر في قائمة المشاركين' using errcode='PT400'; end if;
  -- Remove only obsolete entries; retained memberships preserve their join date.
  delete from public.wf_task_members m where m.task_id=p_id and not exists(select 1 from jsonb_array_elements(p_payload->'members') j where (j->>'employee_id')::uuid=m.employee_id);
  insert into public.wf_task_members(task_id,employee_id,participation)
    select p_id,(value->>'employee_id')::uuid,value->>'participation' from jsonb_array_elements(p_payload->'members')
    on conflict(task_id,employee_id) do update set participation=excluded.participation;
  update public.wf_tasks set updated_by=p_actor where id=p_id returning * into task;
  select string_agg(e.full_name||case when m.participation='participant' then ' (مشارك في التنفيذ)' else ' (متابع)' end,'، ' order by e.full_name) into names from public.wf_task_members m join public.wf_employees e on e.id=m.employee_id where m.task_id=p_id;
  insert into public.wf_task_events(task_id,actor_id,action,summary,changed_fields) values(p_id,p_actor,'members:save',left(coalesce(names,'لا يوجد مشاركون إضافيون أو متابعون'),2000),array['members']);
  return workforce_private.save_command(p_actor,p_key,'members:'||p_command,p_id,p_payload,jsonb_build_object('id',p_id,'version',task.version));
end $$;
revoke all on function public.wf_members_command(uuid,uuid,integer,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.wf_members_command(uuid,uuid,integer,text,jsonb,uuid) to service_role;

-- A reassigned participant becomes the primary assignee, not a second contradictory row.
create function workforce_private.sync_primary_task_member() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null then
    delete from public.wf_task_members where task_id=new.id and employee_id=new.assignee_id;
    if found then insert into public.wf_task_events(task_id,actor_id,action,summary,changed_fields) values(new.id,new.updated_by,'members:primary','أصبحت المشاركة الإضافية ضمن مسؤولية المكلف الأساسي',array['members']); end if;
  end if;
  return new;
end $$;
create trigger wf_task_primary_member_sync after update of assignee_id on public.wf_tasks for each row execute function workforce_private.sync_primary_task_member();
revoke all on function workforce_private.sync_primary_task_member() from public,anon,authenticated;

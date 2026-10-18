-- Protect operational states even when a legacy single-column command is used.
create function workforce_private.guard_work_column() returns trigger
language plpgsql set search_path='' as $$
declare board public.wf_boards;
begin
  select * into board from public.wf_boards where id=new.board_id for update;
  if board.archived_at is not null then raise exception 'استعد اللوحة قبل تعديل مراحلها' using errcode='PT409'; end if;
  if TG_OP='INSERT' then
    if not exists(select 1 from public.wf_task_columns where id=new.id) and (select count(*) from public.wf_task_columns where board_id=new.board_id)>=100 then raise exception 'الحد الأقصى 100 مرحلة لكل لوحة' using errcode='PT409'; end if;
  else
    if new.id<>old.id or new.board_id<>old.board_id or new.kind<>old.kind then raise exception 'لا يمكن تغيير معنى مرحلة محفوظة أو نقلها؛ أضف مرحلة جديدة' using errcode='PT409'; end if;
    if old.archived_at is null and new.archived_at is not null then
      if exists(select 1 from public.wf_tasks where column_id=new.id) then raise exception 'انقل جميع مهام المرحلة قبل أرشفتها، بما فيها المهام المؤرشفة' using errcode='PT409'; end if;
      if not exists(select 1 from public.wf_task_columns where board_id=new.board_id and kind=new.kind and archived_at is null and id<>new.id) then raise exception 'يجب إبقاء مرحلة متاحة لكل حالة أساسية حتى تستمر دورة العمل' using errcode='PT409'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger wf_work_column_guard before insert or update on public.wf_task_columns
for each row execute function workforce_private.guard_work_column();
revoke all on function workforce_private.guard_work_column() from public,anon,authenticated;

create function public.wf_columns_command(p_actor uuid,p_id uuid,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql set search_path='' as $$
declare employee uuid; previous jsonb; board public.wf_boards; item jsonb; n integer; item_id uuid; kind text; existing public.wf_task_columns;
begin
  employee:=workforce_private.assert_task_actor(p_actor);
  if employee is not null then raise exception 'تخصيص مراحل اللوحة للمدير فقط' using errcode='42501'; end if;
  previous:=workforce_private.command_retry(p_actor,p_key,'columns:'||p_command,p_id,p_payload);
  if previous is not null then return previous; end if;
  if p_command is distinct from 'save' or (select count(*) from jsonb_object_keys(p_payload))<>1 or jsonb_typeof(p_payload->'columns') is distinct from 'array' then raise exception 'بيانات المراحل غير صحيحة' using errcode='PT400'; end if;
  if jsonb_array_length(p_payload->'columns') not between 5 and 100 then raise exception 'احتفظ بالمراحل الأساسية، وبحد أقصى 100 مرحلة' using errcode='PT400'; end if;
  select * into board from public.wf_boards where id=p_id for update;
  if not found then raise exception 'اللوحة غير متاحة' using errcode='P0002'; end if;
  if p_version is null or p_version<>board.version then raise exception 'تغيرت اللوحة؛ حدّث المراحل قبل الحفظ' using errcode='PT409'; end if;
  if board.archived_at is not null then raise exception 'استعد اللوحة قبل تعديل مراحلها' using errcode='PT409'; end if;
  for item in select value from jsonb_array_elements(p_payload->'columns') loop
    if jsonb_typeof(item)<>'object' then raise exception 'صيغة المرحلة غير صحيحة' using errcode='PT400'; end if;
    if not(item ?& array['id','title','kind','archived']) or (select count(*) from jsonb_object_keys(item))<>4
      or jsonb_typeof(item->'id')<>'string' or jsonb_typeof(item->'title')<>'string' or jsonb_typeof(item->'kind')<>'string' or jsonb_typeof(item->'archived')<>'boolean'
      or length(btrim(item->>'title')) not between 1 and 100 or item->>'kind' not in ('new','in_progress','review','changes','done') then raise exception 'تحقق من أسماء المراحل وأنواعها' using errcode='PT400'; end if;
    item_id:=(item->>'id')::uuid;
    select * into existing from public.wf_task_columns where id=item_id;
    if found and (existing.board_id<>p_id or existing.kind<>item->>'kind') then raise exception 'لا يمكن تغيير معنى مرحلة محفوظة أو نقلها' using errcode='PT409'; end if;
  end loop;
  if (select count(distinct (value->>'id')::uuid) from jsonb_array_elements(p_payload->'columns'))<>jsonb_array_length(p_payload->'columns') then raise exception 'قائمة المراحل تحتوي معرفًا مكررًا' using errcode='PT400'; end if;
  if exists(select 1 from public.wf_task_columns c where c.board_id=p_id and not exists(select 1 from jsonb_array_elements(p_payload->'columns') j where (j->>'id')::uuid=c.id)) then raise exception 'لا تحذف مرحلة محفوظة؛ استخدم الأرشفة' using errcode='PT409'; end if;
  foreach kind in array array['new','in_progress','review','changes','done'] loop
    if not exists(select 1 from jsonb_array_elements(p_payload->'columns') j where j->>'kind'=kind and not (j->>'archived')::boolean) then raise exception 'يجب إبقاء مرحلة متاحة لكل حالة أساسية حتى تستمر دورة العمل' using errcode='PT409'; end if;
  end loop;
  -- Activate replacements before archiving their predecessors; preserve submitted order.
  for item,n in select value,ordinality::integer-1 from jsonb_array_elements(p_payload->'columns') with ordinality order by (value->>'archived')::boolean,ordinality loop
    insert into public.wf_task_columns(id,board_id,title,kind,position,archived_at)
      values((item->>'id')::uuid,p_id,btrim(item->>'title'),item->>'kind',n,case when (item->>'archived')::boolean then now() else null end)
    on conflict(id) do update set title=excluded.title,position=excluded.position,archived_at=case when excluded.archived_at is not null then coalesce(wf_task_columns.archived_at,excluded.archived_at) else null end;
  end loop;
  update public.wf_boards set version=version+1,updated_at=now() where id=p_id returning * into board;
  insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields) values('wf_boards',p_id::text,'columns',p_actor,array['columns']);
  return workforce_private.save_command(p_actor,p_key,'columns:'||p_command,p_id,p_payload,jsonb_build_object('id',p_id,'version',board.version));
end $$;
revoke all on function public.wf_columns_command(uuid,uuid,integer,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.wf_columns_command(uuid,uuid,integer,text,jsonb,uuid) to service_role;

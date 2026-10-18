alter table public.wf_task_time_entries
  add column version integer not null default 1 check(version>0),
  add column archived_at timestamptz;

create table public.wf_task_time_revisions (
  entry_id uuid not null references public.wf_task_time_entries(id) on delete restrict,
  version integer not null check(version>0),
  starts_at timestamptz not null,
  ends_at timestamptz,
  note text not null,
  archived boolean not null,
  action text not null check(action in ('create','edit','archive','restore')),
  reason text not null,
  changed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(entry_id,version)
);
create index wf_task_time_revision_actor_idx on public.wf_task_time_revisions(changed_by);
alter table public.wf_task_time_revisions enable row level security;
revoke all on public.wf_task_time_revisions from public,anon,authenticated,service_role;
grant select on public.wf_task_time_revisions to authenticated;
grant select,insert on public.wf_task_time_revisions to service_role;
create policy wf_task_time_revisions_read on public.wf_task_time_revisions for select to authenticated
using(exists(select 1 from public.wf_task_time_entries e where e.id=entry_id));
insert into public.wf_task_time_revisions(entry_id,version,starts_at,ends_at,note,archived,action,reason,changed_by)
select id,version,starts_at,ends_at,note,false,'create','سجل سابق',created_by from public.wf_task_time_entries;

-- Reading uses the caller's RLS, including aggregate values; no peer time leakage.
create function public.wf_time_summary(p_task uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('seconds',coalesce(sum(extract(epoch from ends_at-starts_at)) filter(where ends_at is not null),0)::bigint,
    'entries',count(*) filter(where ends_at is not null),'running',count(*) filter(where ends_at is null))
  from public.wf_task_time_entries where task_id=p_task and archived_at is null
$$;
revoke all on function public.wf_time_summary(uuid) from public,anon;
grant execute on function public.wf_time_summary(uuid) to authenticated,service_role;

create function public.wf_time_command(p_actor uuid,p_id uuid,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb
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
  if employee is not null and task.assignee_id is distinct from employee and not exists(select 1 from public.wf_task_members where task_id=p_id and employee_id=employee and participation='participant') then raise exception 'تسجيل الوقت متاح لمنفذي المهمة فقط' using errcode='42501'; end if;
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
revoke all on function public.wf_time_command(uuid,uuid,integer,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.wf_time_command(uuid,uuid,integer,text,jsonb,uuid) to service_role;

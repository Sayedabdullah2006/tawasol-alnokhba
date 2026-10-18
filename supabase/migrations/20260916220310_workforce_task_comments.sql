alter table public.wf_task_comments add column version integer not null default 1 check(version>0);
create table public.wf_task_comment_revisions (
  comment_id uuid not null references public.wf_task_comments(id) on delete restrict,
  version integer not null check(version>0),
  body text not null check(length(btrim(body)) between 1 and 10000),
  archived boolean not null,
  action text not null check(action in ('create','edit','archive','restore')),
  changed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(comment_id,version)
);
create index wf_task_comment_revision_actor_idx on public.wf_task_comment_revisions(changed_by);
alter table public.wf_task_comment_revisions enable row level security;
revoke all on public.wf_task_comment_revisions from public,anon,authenticated,service_role;
grant select on public.wf_task_comment_revisions to authenticated;
grant select,insert on public.wf_task_comment_revisions to service_role;
create policy wf_task_comment_revisions_read on public.wf_task_comment_revisions for select to authenticated
using(exists(select 1 from public.wf_task_comments c where c.id=comment_id and workforce_private.can_read_task(c.task_id)));
insert into public.wf_task_comment_revisions(comment_id,version,body,archived,action,changed_by,created_at)
select id,version,body,archived_at is not null,'create',author_id,created_at from public.wf_task_comments;

-- Comments have their own version; a conversation never invalidates the task's
-- assignment version, review decision, completion timestamp or checklist.
create function public.wf_comments_command(p_actor uuid,p_id uuid,p_version integer,p_command text,p_payload jsonb,p_key uuid) returns jsonb
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
  if employee is not null and task.assignee_id is distinct from employee and not exists(select 1 from public.wf_task_members where task_id=p_id and employee_id=employee and participation='participant') then raise exception 'التعليق متاح للمدير ومنفذي المهمة فقط' using errcode='42501'; end if;
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
revoke all on function public.wf_comments_command(uuid,uuid,integer,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.wf_comments_command(uuid,uuid,integer,text,jsonb,uuid) to service_role;

-- Review decisions already have a dedicated notification with the decision reason.
create or replace function workforce_private.notify_task_change() returns trigger
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
    if state in ('review','changes') or (state='done' and new.requires_approval) then return new; end if;
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

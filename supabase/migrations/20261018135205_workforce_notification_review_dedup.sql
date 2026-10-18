-- Review decisions already create one recipient notification. Network wakeups never block business writes.
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
    if state='review' or (state in ('done','changes') and exists(select 1 from public.wf_task_columns where id=old.column_id and kind='review')) then return new; end if;
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
create or replace function workforce_private.wake_notifications() returns void
language plpgsql security definer set search_path='' as $$
declare endpoint text; token text;
begin
 if not exists(select 1 from public.wf_notification_delivery_settings where id and enabled) then return; end if;
 if current_setting('workforce.notification_wake',true)='1' then return; end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='workforce_project_url';
 select decrypted_secret into token from vault.decrypted_secrets where name='workforce_service_role_key';
 if endpoint is null or token is null then return; end if;
 perform set_config('workforce.notification_wake','1',true);
 perform net.http_post(url:=endpoint||'/functions/v1/workforce-notifications',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),
   body:='{}'::jsonb,timeout_milliseconds:=120000);
exception when others then return;
end $$;

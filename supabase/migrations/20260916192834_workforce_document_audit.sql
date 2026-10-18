create function workforce_private.audit_document_creation() returns trigger
language plpgsql security invoker set search_path='' as $$
declare actor_role text; employee_status text;
begin
  select role into actor_role from public.profiles where id=new.created_by;
  if actor_role='employee' then
    select status into employee_status from public.wf_employees where id=new.employee_id and user_id=new.created_by for share;
    if employee_status is distinct from 'active' or not new.employee_visible then raise exception 'غير مصرح' using errcode='42501'; end if;
  elsif actor_role is distinct from 'admin' then raise exception 'غير مصرح' using errcode='42501'; end if;
  insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields)
    values('wf_employee_documents',new.id::text,'INSERT',new.created_by,array['document']);
  return new;
end $$;
create trigger wf_audit_document_insert before insert on public.wf_employee_documents for each row execute function workforce_private.audit_document_creation();

create function public.wf_archive_document(p_id uuid,p_actor uuid,p_archived boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare document_id uuid;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'غير مصرح' using errcode='42501'; end if;
  update public.wf_employee_documents set archived_at=case when p_archived then now() else null end
    where id=p_id returning id into document_id;
  if document_id is null then raise exception 'المستند غير متاح' using errcode='P0002'; end if;
  insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields)
    values('wf_employee_documents',p_id::text,case when p_archived then 'ARCHIVE' else 'RESTORE' end,p_actor,array['archived_at']);
  return document_id;
end $$;
revoke all on function public.wf_archive_document(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.wf_archive_document(uuid,uuid,boolean) to service_role;

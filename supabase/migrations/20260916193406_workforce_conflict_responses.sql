-- Business conflicts must be HTTP 409, not PostgreSQL serialization failures.
create or replace function public.wf_decide_profile_change(p_id uuid,p_actor uuid,p_decision text,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare r public.wf_profile_change_requests; e public.wf_employees;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin') then
    raise exception 'غير مصرح' using errcode='42501';
  end if;
  if p_decision not in ('approved','rejected') or length(btrim(coalesce(p_reason,'')))<3 then
    raise exception 'القرار وسببه مطلوبان' using errcode='22023';
  end if;
  select * into r from public.wf_profile_change_requests where id=p_id for update;
  if not found or r.status<>'pending' then raise exception 'الطلب غير متاح أو تمت معالجته' using errcode='PT409'; end if;
  select * into e from public.wf_employees where id=r.employee_id for update;
  if e.status<>'active' then raise exception 'حساب الموظف غير نشط' using errcode='22023'; end if;
  if p_decision='approved' then
    if r.field='full_name' then
      update public.wf_employees set full_name=r.proposed_value,updated_by=p_actor where id=e.id;
      update public.profiles set full_name=r.proposed_value where id=e.user_id;
    else
      insert into public.wf_employee_bank_details(employee_id,iban,bank_name,updated_by)
        values(e.id,case when r.field='iban' then r.proposed_value else '' end,case when r.field='bank_name' then r.proposed_value else '' end,p_actor)
        on conflict(employee_id) do update set
          iban=case when r.field='iban' then r.proposed_value else public.wf_employee_bank_details.iban end,
          bank_name=case when r.field='bank_name' then r.proposed_value else public.wf_employee_bank_details.bank_name end,
          updated_by=p_actor,updated_at=now();
    end if;
  end if;
  update public.wf_profile_change_requests set status=p_decision,decision_reason=p_reason,decided_by=p_actor,decided_at=now() where id=p_id;
  insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields)
    values('wf_profile_change_requests',p_id::text,p_decision,p_actor,array[r.field]);
end $$;

create or replace function public.wf_save_employee_notes(p_employee uuid,p_actor uuid,p_version integer,p_notes text)
returns void language plpgsql security invoker set search_path='' as $$
declare e public.wf_employees;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'غير مصرح' using errcode='42501'; end if;
  select * into e from public.wf_employees where id=p_employee for update;
  if not found or e.version<>p_version then raise exception 'تغير الملف منذ فتحه' using errcode='PT409'; end if;
  insert into public.wf_employee_admin_notes(employee_id,notes,updated_by)
    values(p_employee,p_notes,p_actor) on conflict(employee_id) do update set notes=p_notes,updated_by=p_actor,updated_at=now();
  update public.wf_employees set updated_by=p_actor where id=p_employee;
  insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields)
    values('wf_employee_admin_notes',p_employee::text,'UPDATE',p_actor,array['notes']);
end $$;

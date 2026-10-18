alter table public.wf_employees add column responsibilities text not null default '' check(length(responsibilities)<=10000);

-- Immutable employment terms; these are not earned commissions or payroll payments.
create table public.wf_compensation_versions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.wf_employees(id),
  revision integer not null check(revision>0),
  effective_from date not null,
  currency text not null default 'SAR' check(currency='SAR'),
  basic_salary numeric(11,2) not null check(basic_salary between 0 and 999999999.99),
  allowances jsonb not null default '[]' check(jsonb_typeof(allowances)='array' and jsonb_array_length(allowances)<=30),
  commissions jsonb not null default '[]' check(jsonb_typeof(commissions)='array' and jsonb_array_length(commissions)<=30),
  reason text not null check(length(btrim(reason)) between 3 and 2000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(employee_id,revision)
);
create index wf_compensation_effective_idx on public.wf_compensation_versions(employee_id,effective_from desc,revision desc);
create index wf_compensation_creator_idx on public.wf_compensation_versions(created_by);
alter table public.wf_compensation_versions enable row level security;
revoke all on public.wf_compensation_versions from public,anon,authenticated,service_role;
grant select on public.wf_compensation_versions to authenticated;
grant select,insert on public.wf_compensation_versions to service_role;
create policy wf_compensation_read on public.wf_compensation_versions for select to authenticated
using((select workforce_private.is_admin()) or employee_id=(select workforce_private.employee_id()));

create function public.wf_save_compensation(p_actor uuid,p_employee uuid,p_revision integer,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql set search_path='' as $$
declare previous jsonb; latest public.wf_compensation_versions; employee public.wf_employees; saved public.wf_compensation_versions;
  item jsonb; collection text; amount text; rate boolean; field text;
begin
  if workforce_private.assert_task_actor(p_actor) is not null then raise exception 'إعداد المستحقات للمدير فقط' using errcode='42501'; end if;
  previous:=workforce_private.command_retry(p_actor,p_key,'compensation:save',p_employee,p_payload);
  if previous is not null then return previous; end if;
  for field in select jsonb_object_keys(p_payload) loop
    if field<>all(array['basic_salary','effective_from','allowances','commissions','reason']) then raise exception 'حقل غير مسموح' using errcode='PT400'; end if;
  end loop;
  if jsonb_typeof(p_payload->'basic_salary') is distinct from 'string' or coalesce(p_payload->>'basic_salary','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' then raise exception 'الراتب الأساسي غير صحيح' using errcode='PT400'; end if;
  if jsonb_typeof(p_payload->'effective_from') is distinct from 'string' or coalesce(p_payload->>'effective_from','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'تاريخ السريان غير صحيح' using errcode='PT400'; end if;
  if jsonb_typeof(p_payload->'reason') is distinct from 'string' then raise exception 'سبب التعديل مطلوب' using errcode='PT400'; end if;
  foreach collection in array array['allowances','commissions'] loop
    if jsonb_typeof(p_payload->collection) is distinct from 'array' then raise exception 'بنود المستحقات غير صحيحة' using errcode='PT400'; end if;
    if jsonb_array_length(p_payload->collection)>30 then raise exception 'الحد الأقصى ثلاثون بندًا لكل نوع' using errcode='PT400'; end if;
    for item in select value from jsonb_array_elements(p_payload->collection) loop
      if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'name') is distinct from 'string' or coalesce(length(btrim(item->>'name')),0) not between 2 and 150 then raise exception 'اسم البند غير صحيح' using errcode='PT400'; end if;
      for field in select jsonb_object_keys(item) loop
        if (collection='allowances' and field<>all(array['name','amount'])) or (collection='commissions' and field<>all(array['name','mode','value','basis','conditions'])) then raise exception 'حقل بند غير مسموح' using errcode='PT400'; end if;
      end loop;
      rate:=collection='commissions' and item->>'mode'='percent';
      if collection='commissions' and (coalesce(item->>'mode','') not in ('percent','fixed') or coalesce(item->>'basis','') not in ('sales','collections','revenue','profit','custom') or jsonb_typeof(item->'conditions') is distinct from 'string' or length(item->>'conditions')>2000 or (item->>'basis'='custom' and length(btrim(item->>'conditions'))<3)) then raise exception 'حدد نوع العمولة وأساسها وشروطها' using errcode='PT400'; end if;
      field:=case when collection='allowances' then 'amount' else 'value' end;
      amount:=item->>field;
      if jsonb_typeof(item->field) is distinct from 'string' or coalesce(amount,'') !~ (case when rate then '^[0-9]{1,3}(\.[0-9]{1,4})?$' else '^[0-9]{1,9}(\.[0-9]{1,2})?$' end) then raise exception 'قيمة البند غير صحيحة' using errcode='PT400'; end if;
      if rate and amount::numeric>100 then raise exception 'النسبة تتجاوز مئة بالمئة' using errcode='PT400'; end if;
    end loop;
  end loop;
  select * into employee from public.wf_employees where id=p_employee for update;
  if not found then raise exception 'الموظف غير متاح' using errcode='P0002'; end if;
  select * into latest from public.wf_compensation_versions where employee_id=p_employee order by revision desc limit 1;
  if p_revision is null or p_revision<>coalesce(latest.revision,0) then raise exception 'تغيرت إعدادات المستحقات؛ حدّث البيانات' using errcode='PT409'; end if;
  if (p_payload->>'effective_from')::date<employee.start_date or (latest.id is not null and (p_payload->>'effective_from')::date<latest.effective_from) then raise exception 'تاريخ السريان يسبق الانضمام أو آخر إعداد محفوظ' using errcode='PT400'; end if;
  insert into public.wf_compensation_versions(employee_id,revision,effective_from,basic_salary,allowances,commissions,reason,created_by)
  values(p_employee,coalesce(latest.revision,0)+1,(p_payload->>'effective_from')::date,(p_payload->>'basic_salary')::numeric,p_payload->'allowances',p_payload->'commissions',btrim(p_payload->>'reason'),p_actor) returning * into saved;
  insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields)
    values('wf_compensation_versions',p_employee::text,'INSERT',p_actor,array['employment_compensation']);
  return workforce_private.save_command(p_actor,p_key,'compensation:save',p_employee,p_payload,jsonb_build_object('id',saved.id,'revision',saved.revision));
end $$;
revoke all on function public.wf_save_compensation(uuid,uuid,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.wf_save_compensation(uuid,uuid,integer,jsonb,uuid) to service_role;

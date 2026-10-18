-- Additive workforce foundation. Existing client accounts and business tables remain intact.
create schema if not exists workforce_private;
revoke all on schema workforce_private from public, anon, authenticated;
grant usage on schema workforce_private to authenticated, service_role;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('client','admin','employee'));

create or replace function workforce_private.protect_profile_role() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('postgres','service_role','supabase_admin') then
    if (TG_OP = 'INSERT' and new.role <> 'client') or
       (TG_OP = 'UPDATE' and (new.role is distinct from old.role or new.id is distinct from old.id)) then
      raise exception 'لا يمكن تغيير صلاحيات الحساب' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger workforce_protect_profile_role before insert or update on public.profiles
for each row execute function workforce_private.protect_profile_role();

-- Private authorization helper; only reads the authenticated actor, never user metadata.
create function workforce_private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=auth.uid() and p.role='admin' and (u.banned_until is null or u.banned_until < now())
  );
$$;
revoke all on function workforce_private.is_admin() from public, anon;
grant execute on function workforce_private.is_admin() to authenticated, service_role;

create table public.wf_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create table public.wf_employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) between 2 and 150),
  email text not null unique,
  phone text not null default '' check (length(phone)<=30),
  city text not null default '' check (length(city)<=100),
  department_id uuid references public.wf_departments(id) on delete restrict,
  job_title text not null default '' check (length(job_title)<=150),
  contract_type text not null default 'full_time' check (contract_type in ('full_time','part_time','contractor','temporary')),
  start_date date not null,
  contract_end date,
  status text not null default 'active' check (status in ('active','suspended','ended')),
  status_reason text not null default '',
  version integer not null default 1,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contract_end is null or contract_end >= start_date),
  check (status='active' or length(btrim(status_reason))>=3)
);
create index wf_employees_department_status_idx on public.wf_employees(department_id,status);
create index wf_employees_name_idx on public.wf_employees(full_name,id);

create table public.wf_employee_admin_notes (
  employee_id uuid primary key references public.wf_employees(id) on delete restrict,
  notes text not null default '' check (length(notes)<=10000),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table public.wf_employee_bank_details (
  employee_id uuid primary key references public.wf_employees(id) on delete restrict,
  iban text not null default '' check (length(iban)<=34),
  bank_name text not null default '' check (length(bank_name)<=150),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table public.wf_profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.wf_employees(id) on delete restrict,
  field text not null check (field in ('full_name','iban','bank_name')),
  proposed_value text not null check (length(btrim(proposed_value)) between 2 and 150),
  reason text not null check (length(btrim(reason)) between 3 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decision_reason text,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  request_key uuid not null unique
);
create unique index wf_one_pending_profile_change on public.wf_profile_change_requests(employee_id,field) where status='pending';
create index wf_profile_change_status_idx on public.wf_profile_change_requests(status,created_at desc);
create table public.wf_employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.wf_employees(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 150),
  object_path text not null unique,
  filename text not null,
  mime_type text not null check (mime_type in ('application/pdf','image/png','image/jpeg')),
  size_bytes integer not null check(size_bytes between 1 and 10485760),
  employee_visible boolean not null default true,
  expires_on date,
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index wf_documents_employee_idx on public.wf_employee_documents(employee_id,created_at desc);
create table public.wf_audit_events (
  id bigint generated always as identity primary key,
  entity_table text not null,
  entity_id text not null,
  action text not null,
  actor_id uuid references public.profiles(id),
  changed_fields text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index wf_audit_entity_idx on public.wf_audit_events(entity_table,entity_id,created_at desc);

create function workforce_private.employee_audit() returns trigger language plpgsql set search_path='' as $$
declare fields text[];
begin
  if TG_OP='UPDATE' then
    select array_agg(key) into fields from jsonb_each(to_jsonb(new))
      where value is distinct from to_jsonb(old)->key and key not in ('updated_at','version','updated_by');
    new.version := old.version+1;
    new.updated_at := now();
  else fields := array['created']; end if;
  insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields)
  values ('wf_employees',new.id::text,TG_OP,new.updated_by,coalesce(fields,'{}'));
  return new;
end $$;
create trigger wf_employee_audit before insert or update on public.wf_employees
for each row execute function workforce_private.employee_audit();

alter table public.wf_departments enable row level security;
alter table public.wf_employees enable row level security;
alter table public.wf_employee_admin_notes enable row level security;
alter table public.wf_employee_bank_details enable row level security;
alter table public.wf_profile_change_requests enable row level security;
alter table public.wf_employee_documents enable row level security;
alter table public.wf_audit_events enable row level security;
revoke all on public.wf_departments,public.wf_employees,public.wf_employee_admin_notes,public.wf_employee_bank_details,
 public.wf_profile_change_requests,public.wf_employee_documents,public.wf_audit_events from anon,authenticated;
grant select on public.wf_departments,public.wf_employees,public.wf_employee_admin_notes,public.wf_employee_bank_details,
 public.wf_profile_change_requests,public.wf_employee_documents,public.wf_audit_events to authenticated;
grant all on public.wf_departments,public.wf_employees,public.wf_employee_admin_notes,public.wf_employee_bank_details,
 public.wf_profile_change_requests,public.wf_employee_documents,public.wf_audit_events to service_role;
grant usage,select on sequence public.wf_audit_events_id_seq to service_role;

create policy wf_employees_read on public.wf_employees for select to authenticated
using ((select workforce_private.is_admin()) or (user_id=(select auth.uid()) and status='active'));
create policy wf_departments_read on public.wf_departments for select to authenticated
using ((select workforce_private.is_admin()) or exists(select 1 from public.wf_employees where user_id=(select auth.uid()) and status='active'));
create policy wf_notes_read on public.wf_employee_admin_notes for select to authenticated using ((select workforce_private.is_admin()));
create policy wf_bank_read on public.wf_employee_bank_details for select to authenticated
using ((select workforce_private.is_admin()) or exists(select 1 from public.wf_employees where id=employee_id and user_id=(select auth.uid()) and status='active'));
create policy wf_changes_read on public.wf_profile_change_requests for select to authenticated
using ((select workforce_private.is_admin()) or exists(select 1 from public.wf_employees where id=employee_id and user_id=(select auth.uid()) and status='active'));
create policy wf_documents_read on public.wf_employee_documents for select to authenticated
using ((select workforce_private.is_admin()) or (employee_visible and archived_at is null and exists(select 1 from public.wf_employees where id=employee_id and user_id=(select auth.uid()) and status='active')));
create policy wf_audit_read on public.wf_audit_events for select to authenticated using ((select workforce_private.is_admin()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('workforce-private','workforce-private',false,10485760,array['application/pdf','image/png','image/jpeg']);
-- No client storage policies: authenticated download is streamed through the checked server API.

-- Multi-record decision is atomic and service-only. The API verifies the actor first.
create function public.wf_decide_profile_change(p_id uuid,p_actor uuid,p_decision text,p_reason text)
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
  if not found or r.status<>'pending' then raise exception 'الطلب غير متاح أو تمت معالجته' using errcode='40001'; end if;
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
revoke all on function public.wf_decide_profile_change(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.wf_decide_profile_change(uuid,uuid,text,text) to service_role;

create function public.wf_save_employee_notes(p_employee uuid,p_actor uuid,p_version integer,p_notes text)
returns void language plpgsql security invoker set search_path='' as $$
declare e public.wf_employees;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'غير مصرح' using errcode='42501'; end if;
  select * into e from public.wf_employees where id=p_employee for update;
  if not found or e.version<>p_version then raise exception 'تغير الملف منذ فتحه' using errcode='40001'; end if;
  insert into public.wf_employee_admin_notes(employee_id,notes,updated_by)
    values(p_employee,p_notes,p_actor) on conflict(employee_id) do update set notes=p_notes,updated_by=p_actor,updated_at=now();
  update public.wf_employees set updated_by=p_actor where id=p_employee;
  insert into public.wf_audit_events(entity_table,entity_id,action,actor_id,changed_fields)
    values('wf_employee_admin_notes',p_employee::text,'UPDATE',p_actor,array['notes']);
end $$;
revoke all on function public.wf_save_employee_notes(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.wf_save_employee_notes(uuid,uuid,integer,text) to service_role;

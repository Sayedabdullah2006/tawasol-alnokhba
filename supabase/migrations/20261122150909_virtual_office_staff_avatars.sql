-- Appearance preferences only. Never changes employment, tasks, attendance or pay.
create table public.vo_staff_avatars (
  workspace_id text not null default 'nukhba',
  employee_id uuid not null references public.wf_employees(id) on delete cascade,
  preset text not null check(preset in ('unset','shemagh','hijab','hair')),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key(workspace_id,employee_id)
);
create index vo_staff_avatars_employee_idx on public.vo_staff_avatars(employee_id);
create index vo_staff_avatars_updated_by_idx on public.vo_staff_avatars(updated_by);
alter table public.vo_staff_avatars enable row level security;
revoke all on public.vo_staff_avatars from anon,authenticated;
grant select on public.vo_staff_avatars to authenticated;
grant all on public.vo_staff_avatars to service_role;
create policy vo_admin_read_staff_avatars on public.vo_staff_avatars for select to authenticated
  using(exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'));

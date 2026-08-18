begin;

-- Both tables live in the exposed public schema. Keep discount codes server-only,
-- and allow members to access only their own profile without being able to
-- promote themselves by changing the role column.
alter table public.discount_codes enable row level security;
alter table public.profiles enable row level security;

revoke all privileges on table public.discount_codes from anon, authenticated;
grant all privileges on table public.discount_codes to service_role;

revoke all privileges on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant insert (id, full_name, phone, city, x_handle, created_at, updated_at)
  on table public.profiles to authenticated;
grant update (full_name, phone, city, x_handle, updated_at)
  on table public.profiles to authenticated;
grant all privileges on table public.profiles to service_role;

drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Users can create own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = id);

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = id
    and role = 'client'
  );

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = id);

-- This helper is used by existing admin RLS policies. Pin its search path so a
-- caller cannot shadow referenced objects in a SECURITY DEFINER function.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

commit;

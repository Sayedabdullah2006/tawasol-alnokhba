create table if not exists public.daily_social_runs (
  run_date date primary key,
  status text not null check (status in ('running', 'completed', 'failed')),
  requested_count integer not null default 5 check (requested_count between 1 and 5),
  generated_count integer not null default 0 check (generated_count between 0 and 5),
  email_sent boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text,
  updated_at timestamptz not null default now()
);

alter table public.daily_social_runs enable row level security;
revoke all on table public.daily_social_runs from public, anon, authenticated;
grant all on table public.daily_social_runs to service_role;

create or replace function public.claim_daily_social_run(
  p_run_date date,
  p_requested_count integer default 5
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.daily_social_runs (
    run_date,
    status,
    requested_count,
    generated_count,
    email_sent,
    started_at,
    completed_at,
    error,
    updated_at
  ) values (
    p_run_date,
    'running',
    greatest(1, least(5, p_requested_count)),
    0,
    false,
    now(),
    null,
    null,
    now()
  )
  on conflict (run_date) do update
  set status = 'running',
      requested_count = excluded.requested_count,
      generated_count = 0,
      email_sent = false,
      started_at = now(),
      completed_at = null,
      error = null,
      updated_at = now()
  where public.daily_social_runs.status = 'failed'
     or (
       public.daily_social_runs.status = 'running'
       and public.daily_social_runs.started_at < now() - interval '30 minutes'
     );

  return found;
end;
$$;

revoke all on function public.claim_daily_social_run(date, integer) from public, anon, authenticated;
grant execute on function public.claim_daily_social_run(date, integer) to service_role;

comment on table public.daily_social_runs is
  'One atomic automatic daily-social generation run per Riyadh calendar day.';

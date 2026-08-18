create table if not exists public.request_recovery_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  access_token_hash text not null,
  client_email text not null,
  client_name text null,
  client_phone text null,
  selected_package text not null,
  estimated_total numeric(12,2) null,
  draft_payload jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'recovered', 'completed', 'expired', 'unsubscribed')),
  first_reminder_sent_at timestamptz null,
  second_reminder_sent_at timestamptz null,
  offer_sent_at timestamptz null,
  offer_code text null,
  offer_expires_at timestamptz null,
  recovered_request_id uuid null references public.publish_requests(id) on delete set null,
  last_activity_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists request_recovery_drafts_access_token_hash_idx
  on public.request_recovery_drafts(access_token_hash);
create index if not exists request_recovery_drafts_pending_idx
  on public.request_recovery_drafts(status, last_activity_at)
  where status = 'active';
create index if not exists request_recovery_drafts_email_idx
  on public.request_recovery_drafts(lower(client_email));

alter table public.request_recovery_drafts enable row level security;
revoke all on table public.request_recovery_drafts from anon, authenticated;
grant all on table public.request_recovery_drafts to service_role;

alter table public.discount_codes
  add column if not exists max_discount_amount numeric(10,2) null,
  add column if not exists recovery_draft_id uuid null references public.request_recovery_drafts(id) on delete set null;

create unique index if not exists discount_codes_recovery_draft_idx
  on public.discount_codes(recovery_draft_id)
  where recovery_draft_id is not null;

comment on table public.request_recovery_drafts is
  'Server-side request drafts used only for consent-based abandoned package recovery.';
comment on column public.discount_codes.max_discount_amount is
  'Optional monetary cap applied after discount_pct calculation.';

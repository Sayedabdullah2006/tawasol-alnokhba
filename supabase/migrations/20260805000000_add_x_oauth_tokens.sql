create table if not exists public.x_oauth_tokens (
  id boolean primary key default true check (id),
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_type text,
  scope text,
  expires_at timestamptz,
  x_user_id text,
  x_username text,
  x_name text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.x_oauth_tokens enable row level security;
revoke all on table public.x_oauth_tokens from anon, authenticated;

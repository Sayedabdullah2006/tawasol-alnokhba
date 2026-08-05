create table if not exists public.x_radar_scans (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('manual', 'scheduled')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  found integer not null default 0,
  stats jsonb not null default '{}'::jsonb,
  triggered_at timestamptz not null default now()
);

alter table public.x_radar_items
  add column if not exists last_seen_scan_id uuid references public.x_radar_scans(id) on delete set null;

create index if not exists x_radar_items_last_seen_scan_id_idx
  on public.x_radar_items (last_seen_scan_id, posted_at desc);

create table if not exists public.x_radar_scan_items (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.x_radar_scans(id) on delete cascade,
  radar_item_id uuid references public.x_radar_items(id) on delete set null,
  x_post_id text not null,
  source_type text not null check (source_type in ('verified_topic', 'verified_reply_to_first1', 'saudi_cabinet')),
  author_username text,
  author_name text,
  post_text text not null,
  post_url text not null,
  relevance_score integer not null default 0,
  created_at timestamptz not null default now(),
  unique (scan_id, x_post_id)
);

create index if not exists x_radar_scan_items_scan_id_idx
  on public.x_radar_scan_items (scan_id, relevance_score desc);

alter table public.x_radar_scans enable row level security;
alter table public.x_radar_scan_items enable row level security;
revoke all on table public.x_radar_scans from anon, authenticated;
revoke all on table public.x_radar_scan_items from anon, authenticated;

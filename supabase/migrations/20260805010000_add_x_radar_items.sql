create table if not exists public.x_radar_items (
  id uuid primary key default gen_random_uuid(),
  x_post_id text not null unique,
  source_type text not null check (source_type in ('verified_topic', 'verified_reply_to_first1')),
  parent_post_id text,
  author_id text not null,
  author_username text,
  author_name text,
  author_verified boolean not null default false,
  post_text text not null,
  post_url text not null,
  posted_at timestamptz,
  relevance_score integer not null default 0 check (relevance_score between 0 and 100),
  recommendation text not null default 'ignore' check (recommendation in ('reply', 'quote', 'ignore')),
  draft_text text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'ignored', 'published')),
  scanned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists x_radar_items_status_posted_at_idx
  on public.x_radar_items (status, posted_at desc);

alter table public.x_radar_items enable row level security;
revoke all on table public.x_radar_items from anon, authenticated;

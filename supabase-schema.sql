-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- مؤثرون / KSA-Influencers — Database Schema
-- نفّذ هذا الملف في Supabase SQL Editor
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. Profiles
create table if not exists profiles (
  id          uuid references auth.users on delete cascade primary key,
  full_name   text,
  phone       text,
  city        text,
  x_handle    text,
  role        text default 'client' check (role in ('client', 'admin')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table profiles enable row level security;

create policy "users_own_profile" on profiles
  for all using (auth.uid() = id);

create policy "admin_read_all_profiles" on profiles
  for select using (
    exists(select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- 2. Influencers
create table if not exists influencers (
  id              uuid primary key default gen_random_uuid(),
  name_ar         text not null,
  name_en         text,
  x_handle        text,
  x_followers     int default 0,
  ig_handle       text,
  ig_followers    int default 0,
  li_handle       text,
  li_followers    int default 0,
  tk_handle       text,
  tk_followers    int default 0,
  avatar_url      text,
  bio             text,
  is_active       boolean default true,
  price_multiplier numeric default 1.0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table influencers enable row level security;

-- Everyone can read active influencers
create policy "anyone_read_active_influencers" on influencers
  for select using (is_active = true);

-- Admin can do everything
create policy "admin_all_influencers" on influencers
  for all using (
    exists(select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Insert sample influencer
insert into influencers (name_ar, name_en, x_handle, x_followers, ig_followers, li_followers, tk_followers, bio)
values (
  'أول سعودي',
  'First1Saudi',
  '@First1Saudi',
  330000,
  145000,
  81000,
  26000,
  'أول سعودي — منصة إعلامية سعودية لنشر الإنجازات والأخبار'
);

-- 3. Publish Requests
create table if not exists publish_requests (
  id              uuid primary key default gen_random_uuid(),
  request_number  serial,
  user_id         uuid references profiles on delete set null,
  influencer_id   uuid references influencers on delete set null,
  client_type     text check (client_type in ('individual', 'business')),
  category        text not null,
  sub_option      text,
  scope           text not null check (scope in ('single', 'all')),
  images          text not null check (images in ('one', 'multi')),
  extras          jsonb default '[]',
  num_posts       int default 1,
  title           text not null,
  content         text not null,
  link            text,
  hashtags        text,
  preferred_date  date,
  client_name     text not null,
  client_phone    text not null,
  client_email    text not null,
  client_city     text,
  x_handle        text,
  -- Pricing fields
  base_price      numeric,
  scope_mult      numeric,
  img_mult        numeric,
  is_free         boolean default false,
  is_half_off     boolean default false,
  extras_total    numeric,
  per_post_price  numeric,
  discount_pct    numeric,
  discount_amt    numeric,
  subtotal        numeric,
  vat_amount      numeric,
  total_amount    numeric,
  -- Management
  receipt_url     text,
  status          text default 'pending' check (status in ('pending','verified','in_progress','completed','rejected')),
  admin_notes     text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table publish_requests enable row level security;

create policy "users_see_own_requests" on publish_requests
  for select using (auth.uid() = user_id);

create policy "anyone_can_insert_request" on publish_requests
  for insert with check (true);

create policy "admin_all_requests" on publish_requests
  for all using (
    exists(select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- 4. Storage bucket for receipts
-- Run in Supabase Dashboard > Storage > Create bucket:
--   Name: receipts
--   Public: false
-- Then add policies:
--   INSERT: authenticated users
--   SELECT: admin only (via signed URLs in code)

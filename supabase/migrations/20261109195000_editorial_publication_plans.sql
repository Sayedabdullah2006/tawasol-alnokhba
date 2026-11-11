begin;

create table public.editorial_plans (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 150),
 start_date date not null, end_date date not null check(end_date>=start_date), timezone text not null default 'Asia/Riyadh' check(timezone='Asia/Riyadh'),
 times text[] not null default array['20:30','22:30'] check(cardinality(times) between 1 and 2),
 instructions text not null, proposal jsonb not null, attachment_path text, attachment_name text,
 status text not null default 'draft' check(status in ('draft','active','paused','archived')),
 revision integer not null default 1, winning_format text check(winning_format in ('story','thread','carousel','number-card')),
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), activated_at timestamptz, archived_at timestamptz
);
create unique index editorial_one_active_plan on public.editorial_plans ((true)) where status='active';
create index editorial_plans_status_dates on public.editorial_plans(status,start_date,end_date);
create table public.editorial_plan_revisions (
 plan_id uuid not null references public.editorial_plans(id), revision integer not null,
 instructions text not null, proposal jsonb not null, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 primary key(plan_id,revision)
);
create table public.editorial_sources (
 id uuid primary key default gen_random_uuid(), wp_post_id bigint unique, url text not null unique,
 title text not null, content text not null, excerpt text not null default '', published_at timestamptz,
 categories jsonb not null default '[]', image_url text, image_caption text, image_alt text,
 status text not null default 'new' check(status in ('new','excluded')), exclusion_reason text,
 raw jsonb not null default '{}', imported_via text not null default 'wordpress',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index editorial_sources_date on public.editorial_sources(published_at desc);
create index editorial_sources_available on public.editorial_sources(published_at desc) where status='new';
create table public.editorial_items (
 id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.editorial_plans(id), day date not null,
 slot smallint not null check(slot between 0 and 1), scheduled_at timestamptz not null,
 post_type text not null check(post_type in ('story','thread','carousel','number-card','discussion','quote')),
 phase text not null, brief jsonb not null default '{}', source_ids uuid[] not null default '{}',
 status text not null default 'draft' check(status in ('draft','generating','held','failed','approved','published')),
 copy jsonb, analysis jsonb, concepts jsonb, chosen_concept text, design_urls text[] not null default '{}',
 fallback_used boolean not null default false, notice text, error text, generation_token uuid, generation_started_at timestamptz,
 generated_at timestamptz, approved_at timestamptz, approved_by uuid references auth.users(id), published_at timestamptz,
 publication_receipts jsonb not null default '[]', history jsonb not null default '[]', version integer not null default 1,
 prompt_version text not null default 'v3-engagement-2026-11-09', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(plan_id,day,slot)
);
create index editorial_items_plan_day on public.editorial_items(plan_id,day,slot);
create index editorial_items_source_ids on public.editorial_items using gin(source_ids);
create index editorial_items_live_generation on public.editorial_items(status,generation_started_at) where status='generating';
create table public.editorial_archive_groups (
 id uuid primary key default gen_random_uuid(), name text not null, plan_id uuid unique references public.editorial_plans(id),
 legacy boolean not null default false, created_at timestamptz not null default now()
);
create table public.editorial_archive_entries (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.editorial_archive_groups(id),
 origin_table text not null, origin_id text not null, title text not null default '', body text not null default '',
 design_urls text[] not null default '{}', post_type text not null default 'story', owner_name text not null default '',
 status text not null default 'draft', source_url text, occurred_at timestamptz, snapshot jsonb not null,
 created_at timestamptz not null default now(), unique(origin_table,origin_id)
);
create index editorial_archive_filter on public.editorial_archive_entries(group_id,occurred_at desc);
create index editorial_archive_status_type on public.editorial_archive_entries(status,post_type);
create table public.editorial_sync_runs (
 id uuid primary key default gen_random_uuid(), status text not null check(status in ('running','completed','failed')),
 imported_count integer not null default 0, new_count integer not null default 0, source text not null default 'wordpress',
 error text, started_at timestamptz not null default now(), completed_at timestamptz
);
create table public.editorial_notices (
 id uuid primary key default gen_random_uuid(), event_key text not null unique, title text not null, body text not null,
 plan_id uuid references public.editorial_plans(id), day date, created_at timestamptz not null default now(), read_at timestamptz
);

-- Only the authenticated admin API exposes these tables; browser clients have no direct grants.
do $$ declare t text; begin
 foreach t in array array['editorial_plans','editorial_plan_revisions','editorial_sources','editorial_items','editorial_archive_groups','editorial_archive_entries','editorial_sync_runs','editorial_notices'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function public.editorial_archive_plan(p_plan_id uuid) returns void language plpgsql security invoker set search_path='' as $$
declare g uuid; p public.editorial_plans; begin
 select * into p from public.editorial_plans where id=p_plan_id for update;
 if not found then raise exception 'الخطة غير موجودة'; end if;
 insert into public.editorial_archive_groups(name,plan_id) values(p.name||' ('||p.start_date||' — '||p.end_date||')',p.id)
 on conflict(plan_id) do update set name=excluded.name returning id into g;
 insert into public.editorial_archive_entries(group_id,origin_table,origin_id,title,body,design_urls,post_type,owner_name,status,source_url,occurred_at,snapshot)
 select g,'editorial_items',i.id::text,coalesce(i.analysis->>'name',i.brief->>'topic',''),coalesce(i.copy->>'main',''),i.design_urls,i.post_type,
 coalesce(i.analysis->>'name',''),i.status,(select s.url from public.editorial_sources s where s.id=i.source_ids[1]),i.scheduled_at,to_jsonb(i)
 from public.editorial_items i where i.plan_id=p.id on conflict(origin_table,origin_id) do nothing;
 update public.editorial_plans set status='archived',archived_at=coalesce(archived_at,now()),updated_at=now() where id=p.id;
end $$;

create function public.editorial_activate_plan(p_plan_id uuid,p_revision integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.editorial_plans; previous record; begin
 perform pg_catalog.pg_advisory_xact_lock(9109,1);
 select * into p from public.editorial_plans where id=p_plan_id for update;
 if not found or p.revision<>p_revision or p.status not in ('draft','paused') then raise exception 'تغيرت الخطة؛ أعد فتح جدول المراجعة'; end if;
 if length(trim(p.instructions))=0 or jsonb_array_length(p.proposal->'days')<>p.end_date-p.start_date+1 then raise exception 'إرشادات الخطة أو جدولها غير مكتمل'; end if;
 if p.end_date < (now() at time zone 'Asia/Riyadh')::date then raise exception 'انتهت مدة هذه الخطة؛ عدل التواريخ قبل التفعيل'; end if;
 for previous in select id from public.editorial_plans where id<>p.id and status in ('active','paused') for update loop
  perform public.editorial_archive_plan(previous.id);
 end loop;
 update public.editorial_plans set status='active',activated_at=coalesce(activated_at,now()),updated_at=now() where id=p.id;
 return jsonb_build_object('id',p.id,'status','active');
end $$;

create function public.editorial_close_expired_plans() returns integer language plpgsql security invoker set search_path='' as $$
declare p record; n integer:=0; begin
 perform pg_catalog.pg_advisory_xact_lock(9109,1);
 for p in select id from public.editorial_plans where status in ('active','paused') and end_date<(now() at time zone 'Asia/Riyadh')::date for update loop
  perform public.editorial_archive_plan(p.id); n:=n+1;
 end loop;return n;
end $$;

create function public.editorial_claim_item(p_item uuid,p_token uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare i public.editorial_items; begin
 select * into i from public.editorial_items where id=p_item for update;
 if not found or not exists(select 1 from public.editorial_plans p where p.id=i.plan_id and p.status='active' and i.day between p.start_date and p.end_date) then return false;end if;
 if i.status in ('approved','published') or (i.status='generating' and i.generation_started_at>now()-interval '20 minutes') or (i.generated_at is not null and i.status='draft') then return false; end if;
 update public.editorial_items set status='generating',generation_token=p_token,generation_started_at=now(),updated_at=now(),error=null where id=i.id;
 return true;
end $$;

create function public.editorial_reserve_sources(p_item uuid,p_token uuid,p_sources uuid[]) returns boolean language plpgsql security invoker set search_path='' as $$
declare i public.editorial_items; begin
 perform pg_catalog.pg_advisory_xact_lock(9109,2);
 select * into i from public.editorial_items where id=p_item and generation_token=p_token and status='generating' for update;
 if not found or cardinality(p_sources)=0 then return false;end if;
 if exists(select 1 from unnest(p_sources) s(id) left join public.editorial_sources n on n.id=s.id where n.id is null or n.status='excluded') then return false;end if;
 if i.post_type<>'quote' and exists(
  select 1 from public.editorial_items other join public.editorial_plans p on p.id=other.plan_id
  where other.id<>i.id and other.source_ids&&p_sources and other.post_type<>'quote' and abs(other.day-i.day)<30
  and (other.status='published' or (p.status in ('active','paused') and other.status in ('generating','draft','approved')))
 ) then return false;end if;
 update public.editorial_items set source_ids=p_sources,updated_at=now() where id=i.id;
 return true;
end $$;

revoke all on function public.editorial_archive_plan(uuid),public.editorial_activate_plan(uuid,integer),public.editorial_close_expired_plans(),public.editorial_claim_item(uuid,uuid),public.editorial_reserve_sources(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.editorial_archive_plan(uuid),public.editorial_activate_plan(uuid,integer),public.editorial_close_expired_plans(),public.editorial_claim_item(uuid,uuid),public.editorial_reserve_sources(uuid,uuid,uuid[]) to service_role;

-- Immutable snapshots preserve old rows, images, publication receipts and full raw payloads.
insert into public.editorial_archive_groups(name,legacy) values('قبل نظام الخطط',true);
insert into public.editorial_archive_entries(group_id,origin_table,origin_id,title,body,design_urls,status,source_url,occurred_at,snapshot)
select (select id from public.editorial_archive_groups where legacy),'social_schedule',s.id::text,coalesce(s.post_title,''),coalesce(s.tweets,''),array_remove(array[s.design_image_url],null),coalesce(s.status,'draft'),s.post_url,s.created_at,to_jsonb(s) from public.social_schedule s;
insert into public.editorial_archive_entries(group_id,origin_table,origin_id,title,body,design_urls,status,source_url,occurred_at,snapshot)
select (select id from public.editorial_archive_groups where legacy),'generated_designs',d.id::text,coalesce(d.title,''),coalesce(d.content,''),array_remove(array[d.image_url],null),'generated',null,d.created_at,to_jsonb(d) from public.generated_designs d;
insert into public.editorial_archive_entries(group_id,origin_table,origin_id,title,body,design_urls,status,source_url,occurred_at,snapshot)
select (select id from public.editorial_archive_groups where legacy),'postpulse_posts',p.id::text,'منشور محفوظ',coalesce(p.content,''),array_remove(array[p.design_url],null),coalesce(p.status,'draft'),null,p.created_at,to_jsonb(p) from public.postpulse_posts p;
insert into public.editorial_archive_entries(group_id,origin_table,origin_id,title,body,design_urls,status,source_url,occurred_at,snapshot)
select (select id from public.editorial_archive_groups where legacy),'newsletters',n.id::text,coalesce(n.label,''),coalesce(n.caption,''),array_remove(array[n.image_url],null),coalesce(n.status,'draft'),null,n.created_at,to_jsonb(n) from public.newsletters n;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('editorial-plan-files','editorial-plan-files',false,10485760,array['text/plain','text/markdown','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) on conflict(id) do nothing;

commit;

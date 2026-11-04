-- Additive migration. No historical prices, package ids or customer ownership are rewritten.
alter table public.publish_requests add column if not exists package_snapshot jsonb;
alter table public.publish_requests add column if not exists source_site text;
alter table public.publish_requests add column if not exists partner_id text;
alter table public.publish_requests add column if not exists external_customer_id text;
alter table public.publish_requests add column if not exists external_order_id text;
alter table public.publish_requests add column if not exists creation_fingerprint text;
alter table public.publish_requests add column if not exists partner_deliverables jsonb not null default '[]'::jsonb;
alter table public.publish_requests drop constraint if exists publish_requests_auto_quote_tier_check;
alter table public.publish_requests add constraint publish_requests_auto_quote_tier_check check (
 auto_quote_tier is null or auto_quote_tier in ('basic','pro','elite','prime','شائع','متميز','استثنائي',
 'v2_basic','v2_reach','v2_presence','v2_elite','v2_career'));
create unique index if not exists partner_order_external_key on public.publish_requests(partner_id,external_order_id) where partner_id is not null;
create index if not exists partner_orders_customer on public.publish_requests(partner_id,external_customer_id,created_at desc) where partner_id is not null;

create table if not exists public.partner_quotes (
 id uuid primary key default gen_random_uuid(), partner_id text not null, customer_id text not null,
 payload jsonb not null, snapshot jsonb not null, expires_at timestamptz not null,
 order_id uuid unique references public.publish_requests(id), created_at timestamptz not null default now()
);
create table if not exists public.partner_nonces (
 partner_id text not null, nonce text not null, created_at timestamptz not null default now(), primary key(partner_id,nonce)
);
create index if not exists partner_nonces_age on public.partner_nonces(created_at);
create table if not exists public.partner_checkout_sessions (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.publish_requests(id),
 idempotency_key text not null, amount bigint not null check(amount>0), currency text not null default 'SAR' check(currency='SAR'),
 expires_at timestamptz not null, return_url text not null, status text not null default 'pending',
 provider_payment_id text unique, created_at timestamptz not null default now(), paid_at timestamptz,
 unique(request_id,idempotency_key)
);
create table if not exists public.partner_payment_receipts (
 payment_id text primary key, request_id uuid not null references public.publish_requests(id),
 session_id uuid not null references public.partner_checkout_sessions(id), amount bigint not null,
 status text not null, created_at timestamptz not null default now()
);
create index if not exists partner_payment_receipts_request on public.partner_payment_receipts(request_id);
create table if not exists public.partner_files (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.publish_requests(id),
 path text not null unique, name text not null, mime_type text not null, size bigint not null,
 completed boolean not null default false, created_at timestamptz not null default now()
);
alter table public.partner_files add column if not exists idempotency_key text;
create unique index if not exists partner_file_idempotency on public.partner_files(request_id,idempotency_key);
-- Only the server service role can access these tables or call RPCs. No user-facing Data API policies.
alter table public.partner_quotes enable row level security;
alter table public.partner_nonces enable row level security;
alter table public.partner_checkout_sessions enable row level security;
alter table public.partner_files enable row level security;
alter table public.partner_payment_receipts enable row level security;
revoke all on public.partner_quotes,public.partner_nonces,public.partner_checkout_sessions,public.partner_files,public.partner_payment_receipts from public,anon,authenticated;
grant all on public.partner_quotes,public.partner_nonces,public.partner_checkout_sessions,public.partner_files,public.partner_payment_receipts to service_role;

create or replace function public.partner_accept_nonce(p_partner text,p_nonce text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('partner-rate:'||p_partner,0));
 delete from public.partner_nonces where created_at < now()-interval '10 minutes';
 if (select count(*) from public.partner_nonces where partner_id=p_partner and created_at>now()-interval '1 minute')>=120 then
   raise exception 'RATE_LIMITED';
 end if;
 insert into public.partner_nonces(partner_id,nonce) values(p_partner,p_nonce) on conflict do nothing;
 return found;
end; $$;

create or replace function public.partner_create_order(p_partner text,p_customer text,p_key text,p_fingerprint text,p_quote uuid,p_content jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare q public.partner_quotes; r public.publish_requests; price jsonb; deal public.discount_codes;
begin
 perform pg_advisory_xact_lock(hashtextextended('partner-customer:'||p_partner||':'||p_customer,0));
 perform pg_advisory_xact_lock(hashtextextended('partner-order:'||p_partner||':'||p_key,0));
 select * into r from public.publish_requests where partner_id=p_partner and external_order_id=p_key;
 if found then
  if r.external_customer_id<>p_customer or r.creation_fingerprint<>p_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('id',r.id,'request_number',r.request_number,'replayed',true);
 end if;
 if exists(select 1 from public.publish_requests where partner_id=p_partner and external_customer_id=p_customer and status in ('pending','quoted','negotiation','approved','payment_review','info_requested')) then raise exception 'OPEN_REQUEST_EXISTS'; end if;
 select * into q from public.partner_quotes where id=p_quote and partner_id=p_partner and customer_id=p_customer for update;
 if not found then raise exception 'QUOTE_NOT_FOUND'; end if;
 if q.order_id is not null then raise exception 'QUOTE_CONSUMED'; end if;
 if q.expires_at<=now() then raise exception 'QUOTE_EXPIRED'; end if;
 price=q.snapshot->'pricing';
 if q.payload->>'discount_code' is not null then
  select * into deal from public.discount_codes where code=q.payload->>'discount_code' for update;
  if not found or not deal.is_active or deal.expires_at<=now() or (deal.max_uses is not null and deal.used_count>=deal.max_uses)
     or deal.discount_pct<>(price->>'discount_pct')::numeric then raise exception 'DISCOUNT_UNAVAILABLE'; end if;
  update public.discount_codes set used_count=coalesce(used_count,0)+1 where id=deal.id;
 end if;
 insert into public.publish_requests(partner_id,external_customer_id,external_order_id,creation_fingerprint,source_site,
 influencer_id,client_type,category,sub_option,channels,scope,images,request_type,num_posts,
 title,content,client_name,client_phone,client_email,client_city,x_handle,
 base_price,extras_total,vat_amount,total_amount,admin_quoted_price,final_total,
 discount_pct,discount_amount,discount_code,package_snapshot,auto_quote_tier,auto_quote_note,status,approved_at,quoted_at,last_status_change)
 values(p_partner,p_customer,p_key,p_fingerprint,p_partner,
 (q.payload->>'influencer_id')::uuid,'individual',q.payload->>'category',q.payload->>'sub_option',q.payload->'channels',
 case when jsonb_array_length(q.payload->'channels')=1 then 'single' else 'all' end,'one','single',1,
 p_content->>'title',p_content->>'content',p_content->>'name',p_content->>'phone',p_content->>'email',p_content->>'city',p_content->>'handle',
 (price->>'subtotal')::numeric/100,0,(price->>'vat')::numeric/100,(price->>'subtotal')::numeric/100,
 (price->>'total')::numeric/100,(price->>'total')::numeric/100,(price->>'discount_pct')::numeric,(price->>'discount')::numeric/100,
 q.payload->>'discount_code',q.snapshot,q.snapshot->'package'->>'id','طلب شريك — '||(q.snapshot->'package'->>'name'),
 'approved',now(),now(),now()) returning * into r;
 update public.partner_quotes set order_id=r.id where id=q.id;
 return jsonb_build_object('id',r.id,'request_number',r.request_number,'replayed',false);
end; $$;

create or replace function public.partner_create_checkout(p_partner text,p_customer text,p_request uuid,p_key text,p_return text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.publish_requests; s public.partner_checkout_sessions;
begin
 select * into r from public.publish_requests where id=p_request and partner_id=p_partner and external_customer_id=p_customer for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if r.status<>'approved' or r.payment_status='paid' then raise exception 'ORDER_NOT_PAYABLE'; end if;
 select * into s from public.partner_checkout_sessions where request_id=r.id and idempotency_key=p_key;
 if found then
  if s.expires_at<=now() then raise exception 'CHECKOUT_EXPIRED'; end if;
  return to_jsonb(s);
 end if;
 -- Reuse a still-active attempt so double clicks with different keys don't open parallel payments.
 select * into s from public.partner_checkout_sessions where request_id=r.id and status='pending' and expires_at>now() order by created_at desc limit 1;
 if found then return to_jsonb(s); end if;
 insert into public.partner_checkout_sessions(request_id,idempotency_key,amount,expires_at,return_url)
 values(r.id,p_key,round(r.final_total*100)::bigint,now()+interval '30 minutes',p_return) returning * into s;
 return to_jsonb(s);
end; $$;

create or replace function public.partner_settle_payment(p_session uuid,p_request uuid,p_payment text,p_amount bigint,p_currency text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.publish_requests; s public.partner_checkout_sessions;
begin
 -- Consistent lock ordering: order before session.
 select * into r from public.publish_requests where id=p_request for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 select * into s from public.partner_checkout_sessions where id=p_session and request_id=r.id for update;
 if not found then raise exception 'PAYMENT_BINDING_MISMATCH'; end if;
 if s.amount<>p_amount or p_amount<>round(r.final_total*100)::bigint or p_currency<>'SAR' then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;
 if exists(select 1 from public.publish_requests where moyasar_payment_id=p_payment and id<>r.id) then raise exception 'PAYMENT_ALREADY_USED'; end if;
 insert into public.partner_payment_receipts(payment_id,request_id,session_id,amount,status)
 values(p_payment,r.id,s.id,p_amount,'received') on conflict(payment_id) do nothing;
 if exists(select 1 from public.partner_payment_receipts where payment_id=p_payment and (request_id<>r.id or session_id<>s.id)) then raise exception 'PAYMENT_ALREADY_USED'; end if;
 if s.provider_payment_id is not null and s.provider_payment_id<>p_payment then
  update public.partner_payment_receipts set status='review_required' where payment_id=p_payment;
  return jsonb_build_object('applied',false,'review_required',true,'request_id',r.id);
 end if;
 if r.moyasar_payment_id=p_payment and r.payment_status='paid' then return jsonb_build_object('applied',false,'request_id',r.id); end if;
 if r.status<>'approved' or r.payment_status='paid' then
  update public.partner_payment_receipts set status='review_required' where payment_id=p_payment;
  update public.partner_checkout_sessions set provider_payment_id=p_payment,status='review_required',paid_at=now() where id=s.id;
  return jsonb_build_object('applied',false,'review_required',true,'request_id',r.id);
 end if;
 update public.partner_payment_receipts set status='paid' where payment_id=p_payment;
 update public.partner_checkout_sessions set provider_payment_id=p_payment,status='paid',paid_at=now() where id=s.id;
 update public.publish_requests set payment_status='paid',moyasar_payment_id=p_payment,paid_at=now(),
 status='in_progress',payment_method='MOYASAR',updated_at=now(),last_status_change=now() where id=r.id;
 return jsonb_build_object('applied',true,'request_id',r.id);
end; $$;

revoke all on function public.partner_accept_nonce(text,text),public.partner_create_order(text,text,text,text,uuid,jsonb),
 public.partner_create_checkout(text,text,uuid,text,text),public.partner_settle_payment(uuid,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.partner_accept_nonce(text,text),public.partner_create_order(text,text,text,text,uuid,jsonb),
 public.partner_create_checkout(text,text,uuid,text,text),public.partner_settle_payment(uuid,uuid,text,bigint,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('partner-files','partner-files',false,20971520,array['image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
 on conflict(id) do nothing;

create or replace function public.partner_reserve_file(p_partner text,p_customer text,p_request uuid,p_key text,p_id uuid,p_path text,p_name text,p_mime text,p_size bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.publish_requests; f public.partner_files;
begin
 select * into r from public.publish_requests where id=p_request and partner_id=p_partner and external_customer_id=p_customer for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if r.status not in ('approved','in_progress','info_requested','content_review','changes_requested') then raise exception 'ORDER_NOT_EDITABLE'; end if;
 select * into f from public.partner_files where request_id=p_request and idempotency_key=p_key;
 if found then
  if f.name<>p_name or f.mime_type<>p_mime or f.size<>p_size then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return to_jsonb(f);
 end if;
 if (select count(*) from public.partner_files where request_id=p_request)>=10 then raise exception 'FILE_LIMIT'; end if;
 insert into public.partner_files(id,request_id,path,name,mime_type,size,idempotency_key)
 values(p_id,p_request,p_path,p_name,p_mime,p_size,p_key) returning * into f;
 return to_jsonb(f);
end; $$;
revoke all on function public.partner_reserve_file(text,text,uuid,text,uuid,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.partner_reserve_file(text,text,uuid,text,uuid,text,text,text,bigint) to service_role;

-- Existing permissive policies remain for legacy requests. Restrictive policies protect all new
-- snapshots and partner rows even if another permissive policy grants authenticated-wide access.
drop policy if exists versioned_requests_select_guard on public.publish_requests;
create policy versioned_requests_select_guard on public.publish_requests as restrictive for select to anon,authenticated
 using ((package_snapshot is null and partner_id is null) or user_id=(select auth.uid()) or (select public.is_admin()));
drop policy if exists versioned_requests_insert_guard on public.publish_requests;
create policy versioned_requests_insert_guard on public.publish_requests as restrictive for insert to anon,authenticated
 with check ((package_snapshot is null and partner_id is null) or (select public.is_admin()));
drop policy if exists versioned_requests_update_guard on public.publish_requests;
create policy versioned_requests_update_guard on public.publish_requests as restrictive for update to anon,authenticated
 using ((package_snapshot is null and partner_id is null) or (select public.is_admin()))
 with check ((package_snapshot is null and partner_id is null) or (select public.is_admin()));
drop policy if exists versioned_requests_delete_guard on public.publish_requests;
create policy versioned_requests_delete_guard on public.publish_requests as restrictive for delete to anon,authenticated
 using ((package_snapshot is null and partner_id is null) or (select public.is_admin()));

create or replace function public.partner_cancel_order(p_partner text,p_customer text,p_request uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.publish_requests;
begin
 select * into r from public.publish_requests where id=p_request and partner_id=p_partner and external_customer_id=p_customer for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if r.status='cancelled' then return jsonb_build_object('id',r.id,'status','cancelled'); end if;
 if r.status not in ('pending','quoted','negotiation','approved') or coalesce(r.payment_status,'pending')<>'pending'
    or r.paid_at is not null or r.moyasar_payment_id is not null then raise exception 'ORDER_NOT_CANCELLABLE'; end if;
 if exists(select 1 from public.partner_checkout_sessions where request_id=r.id and status='pending' and expires_at>now()) then raise exception 'CHECKOUT_ACTIVE'; end if;
 update public.publish_requests set status='cancelled',updated_at=now(),last_status_change=now() where id=r.id;
 return jsonb_build_object('id',r.id,'status','cancelled');
end; $$;
revoke all on function public.partner_cancel_order(text,text,uuid) from public,anon,authenticated;
grant execute on function public.partner_cancel_order(text,text,uuid) to service_role;

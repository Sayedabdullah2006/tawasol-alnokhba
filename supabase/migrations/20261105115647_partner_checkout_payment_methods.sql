-- Additive service-only checkout actions; existing card settlement remains unchanged.
alter table public.partner_checkout_sessions add column if not exists method_details jsonb not null default '{}'::jsonb;
create unique index if not exists partner_checkout_tamara_unique on public.partner_checkout_sessions ((method_details->>'tamara_id')) where method_details->>'tamara_id' is not null;
create or replace function public.partner_checkout_method(p_session uuid,p_action text,p_details jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.partner_checkout_sessions; r public.publish_requests; d jsonb;
begin
 select request_id into s.request_id from public.partner_checkout_sessions where id=p_session;
 select * into r from public.publish_requests where id=s.request_id for update;
 select * into s from public.partner_checkout_sessions where id=p_session for update;
 if s.id is null or r.id is null then raise exception 'CHECKOUT_NOT_FOUND'; end if;
 d:=s.method_details;
 if p_action='bank_reserve' and r.status='payment_review' and d->>'receipt_hash'=p_details->>'receipt_hash' then return d;end if;
 if p_action='bank_complete' and r.status='payment_review' and r.receipt_url=d->>'receipt_path' then return jsonb_build_object('applied',false); end if;
 if p_action='tamara_finish' and d->>'tamara_id'=p_details->>'tamara_id' then return d;end if;
 if s.expires_at<=now() then raise exception 'CHECKOUT_EXPIRED';end if;
 if r.status<>'approved' or r.payment_status='paid' or s.status<>'pending' or s.amount is distinct from round(r.final_total*100)::bigint or s.amount<=0 then raise exception 'ORDER_NOT_PAYABLE';end if;
 if p_action='bank_reserve' then
  if d->>'method'='tamara' then raise exception 'PAYMENT_METHOD_LOCKED';end if;
  if d->>'receipt_hash' is not null and d->>'receipt_hash'<>p_details->>'receipt_hash' then raise exception 'RECEIPT_CHANGED';end if;
  d:=p_details||jsonb_build_object('method','bank');
 elsif p_action='bank_complete' then
  if d->>'method'<>'bank' or d->>'receipt_path' is null then raise exception 'RECEIPT_REQUIRED';end if;
  update public.publish_requests set receipt_url=d->>'receipt_path',status='payment_review',payment_method='تحويل بنكي',updated_at=now(),last_status_change=now() where id=r.id;
  update public.partner_checkout_sessions set status='review_required' where id=s.id;
  return jsonb_build_object('applied',true);
 elsif p_action='tamara_claim' then
  if s.payment_mode<>'live' then raise exception 'PAYMENT_METHOD_UNAVAILABLE';end if;
  if d->>'method'='bank' then raise exception 'PAYMENT_METHOD_LOCKED';end if;
  if d->>'tamara_url' is not null then return d||jsonb_build_object('claimed',false);end if;
  if d->>'method'='tamara' then raise exception 'PAYMENT_CREATION_PENDING';end if;
  d:=jsonb_build_object('method','tamara','creating',true);
 elsif p_action='tamara_finish' then
  if d->>'method'<>'tamara' or d->>'tamara_id' is not null then raise exception 'PAYMENT_METHOD_LOCKED';end if;
  d:=d||p_details||jsonb_build_object('creating',false);
 else raise exception 'INVALID_ACTION';end if;
 update public.partner_checkout_sessions set method_details=d where id=s.id;
 return d||jsonb_build_object('claimed',true);
end; $$;
create or replace function public.partner_settle_tamara(p_session uuid,p_provider text,p_amount bigint,p_currency text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.partner_checkout_sessions; r public.publish_requests; pid text:='tamara:'||p_provider;
begin
 select request_id into s.request_id from public.partner_checkout_sessions where id=p_session;
 select * into r from public.publish_requests where id=s.request_id for update;
 select * into s from public.partner_checkout_sessions where id=p_session for update;
 if s.id is null or r.id is null or s.payment_mode<>'live' or s.method_details->>'tamara_id' is distinct from p_provider then raise exception 'PAYMENT_BINDING_MISMATCH';end if;
 if p_currency<>'SAR' or p_amount<>s.amount or p_amount<>round(r.final_total*100)::bigint or p_amount<=0 then raise exception 'PAYMENT_AMOUNT_MISMATCH';end if;
 insert into public.partner_payment_receipts(payment_id,request_id,session_id,amount,status) values(pid,r.id,s.id,p_amount,'received') on conflict(payment_id) do nothing;
 if exists(select 1 from public.partner_payment_receipts where payment_id=pid and (request_id<>r.id or session_id<>s.id)) then raise exception 'PAYMENT_ALREADY_USED';end if;
 if s.provider_payment_id=pid and r.payment_status='paid' and r.tamara_order_id=p_provider then return jsonb_build_object('applied',false,'paid',true);end if;
 if r.status<>'approved' or r.payment_status='paid' or s.provider_payment_id is not null then
  update public.partner_payment_receipts set status='review_required' where payment_id=pid;
  update public.partner_checkout_sessions set status='review_required' where id=s.id;
  return jsonb_build_object('applied',false,'review_required',true);
 end if;
 update public.partner_payment_receipts set status='paid' where payment_id=pid;
 update public.partner_checkout_sessions set provider_payment_id=pid,status='paid',paid_at=now() where id=s.id;
 update public.publish_requests set tamara_order_id=p_provider,payment_method='تمارا - تقسيط',payment_status='paid',status='in_progress',paid_at=now(),updated_at=now(),last_status_change=now() where id=r.id;
 return jsonb_build_object('applied',true,'paid',true);
end; $$;
revoke all on function public.partner_checkout_method(uuid,text,jsonb), public.partner_settle_tamara(uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.partner_checkout_method(uuid,text,jsonb), public.partner_settle_tamara(uuid,text,bigint,text) to service_role;

-- Additive service-only checkout actions; existing card settlement remains unchanged.
alter table public.partner_sandbox_checkout_sessions add column if not exists method_details jsonb not null default '{}'::jsonb;
create unique index if not exists partner_sandbox_checkout_tamara_unique on public.partner_sandbox_checkout_sessions ((method_details->>'tamara_id')) where method_details->>'tamara_id' is not null;
create or replace function public.partner_sandbox_checkout_method(p_session uuid,p_action text,p_details jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.partner_sandbox_checkout_sessions; r public.partner_sandbox_orders; d jsonb;
begin
 select request_id into s.request_id from public.partner_sandbox_checkout_sessions where id=p_session;
 select * into r from public.partner_sandbox_orders where id=s.request_id for update;
 select * into s from public.partner_sandbox_checkout_sessions where id=p_session for update;
 if s.id is null or r.id is null then raise exception 'CHECKOUT_NOT_FOUND'; end if;
 d:=s.method_details;
 if p_action='bank_reserve' and r.status='payment_review' and d->>'receipt_hash'=p_details->>'receipt_hash' then return d;end if;
 if p_action='bank_complete' and r.status='payment_review' and r.receipt_url=d->>'receipt_path' then return jsonb_build_object('applied',false); end if;
 if p_action='tamara_finish' and d->>'tamara_id'=p_details->>'tamara_id' then return d;end if;
 if s.expires_at<=now() then raise exception 'CHECKOUT_EXPIRED';end if;
 if r.status<>'approved' or r.payment_status='paid' or s.status<>'pending' or s.amount is distinct from round(r.final_total*100)::bigint or s.amount<=0 then raise exception 'ORDER_NOT_PAYABLE';end if;
 if p_action='bank_reserve' then
  if d->>'method'='tamara' then raise exception 'PAYMENT_METHOD_LOCKED';end if;
  if d->>'receipt_hash' is not null and d->>'receipt_hash'<>p_details->>'receipt_hash' then raise exception 'RECEIPT_CHANGED';end if;
  d:=p_details||jsonb_build_object('method','bank');
 elsif p_action='bank_complete' then
  if d->>'method'<>'bank' or d->>'receipt_path' is null then raise exception 'RECEIPT_REQUIRED';end if;
  update public.partner_sandbox_orders set receipt_url=d->>'receipt_path',status='payment_review',payment_method='تحويل بنكي',updated_at=now(),last_status_change=now() where id=r.id;
  update public.partner_sandbox_checkout_sessions set status='review_required' where id=s.id;
  return jsonb_build_object('applied',true);
 elsif p_action='tamara_claim' then
  if s.payment_mode<>'live' then raise exception 'PAYMENT_METHOD_UNAVAILABLE';end if;
  if d->>'method'='bank' then raise exception 'PAYMENT_METHOD_LOCKED';end if;
  if d->>'tamara_url' is not null then return d||jsonb_build_object('claimed',false);end if;
  if d->>'method'='tamara' then raise exception 'PAYMENT_CREATION_PENDING';end if;
  d:=jsonb_build_object('method','tamara','creating',true);
 elsif p_action='tamara_finish' then
  if d->>'method'<>'tamara' or d->>'tamara_id' is not null then raise exception 'PAYMENT_METHOD_LOCKED';end if;
  d:=d||p_details||jsonb_build_object('creating',false);
 else raise exception 'INVALID_ACTION';end if;
 update public.partner_sandbox_checkout_sessions set method_details=d where id=s.id;
 return d||jsonb_build_object('claimed',true);
end; $$;

revoke all on function public.partner_sandbox_checkout_method(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.partner_sandbox_checkout_method(uuid,text,jsonb) to service_role;

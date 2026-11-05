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
  update public.partner_checkout_sessions set status='bank_review' where id=s.id;
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
update public.partner_checkout_sessions set status='bank_review' where status='review_required' and method_details->>'method'='bank' and provider_payment_id is null;

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
  update public.partner_sandbox_checkout_sessions set status='bank_review' where id=s.id;
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
update public.partner_sandbox_checkout_sessions set status='bank_review' where status='review_required' and method_details->>'method'='bank' and provider_payment_id is null;

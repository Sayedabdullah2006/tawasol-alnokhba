alter table public.partner_checkout_sessions add column if not exists payment_mode text not null default 'live' check(payment_mode in ('sandbox','live'));
create or replace function public.partner_create_checkout(p_partner text,p_customer text,p_request uuid,p_key text,p_return text,p_mode text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.publish_requests; s public.partner_checkout_sessions;
begin
 if p_mode not in ('sandbox','live') then raise exception 'INVALID_PAYMENT_MODE'; end if;
 select * into r from public.publish_requests where id=p_request and partner_id=p_partner and external_customer_id=p_customer for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if r.status<>'approved' or r.payment_status='paid' then raise exception 'ORDER_NOT_PAYABLE'; end if;
 select * into s from public.partner_checkout_sessions where request_id=r.id and idempotency_key=p_key;
 if found then
  if s.payment_mode<>p_mode then raise exception 'PAYMENT_MODE_CHANGED'; end if;
  if s.expires_at<=now() then raise exception 'CHECKOUT_EXPIRED'; end if;
  return to_jsonb(s);
 end if;
 -- Reuse a still-active attempt so double clicks with different keys don't open parallel payments.
 select * into s from public.partner_checkout_sessions where request_id=r.id and status='pending' and payment_mode=p_mode and expires_at>now() order by created_at desc limit 1;
 if found then return to_jsonb(s); end if;
 insert into public.partner_checkout_sessions(request_id,idempotency_key,amount,expires_at,return_url,payment_mode)
 values(r.id,p_key,round(r.final_total*100)::bigint,now()+interval '30 minutes',p_return,p_mode) returning * into s;
 return to_jsonb(s);
end; $$;

revoke all on function public.partner_create_checkout(text,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.partner_create_checkout(text,text,uuid,text,text,text) to service_role;

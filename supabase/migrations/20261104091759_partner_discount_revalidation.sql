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
     or deal.recovery_draft_id is not null or deal.discount_pct<>(price->>'discount_pct')::numeric
     or (price->>'discount')::numeric <> least(round(((price->>'subtotal')::numeric-(price->>'advertising')::numeric)*deal.discount_pct/100),coalesce(round(deal.max_discount_amount*100),999999999999)) then raise exception 'DISCOUNT_UNAVAILABLE'; end if;
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
-- Additive organization intake and transactional customer offer decisions.
create table public.partner_order_actions (
 partner_id text not null, idempotency_key text not null, customer_id text not null,
 request_id uuid not null references public.publish_requests(id), fingerprint text not null,
 response jsonb not null, created_at timestamptz not null default now(), primary key(partner_id,idempotency_key)
);
alter table public.partner_order_actions enable row level security;
revoke all on public.partner_order_actions from public,anon,authenticated;
grant select,insert,delete on public.partner_order_actions to service_role;
create table public.partner_sandbox_order_actions (like public.partner_order_actions including defaults including constraints including indexes);
alter table public.partner_sandbox_order_actions enable row level security;
revoke all on public.partner_sandbox_order_actions from public,anon,authenticated;
grant select,insert,delete on public.partner_sandbox_order_actions to service_role;

create function public.partner_create_organization_order(p_partner text,p_customer text,p_key text,p_fingerprint text,p_content jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.publish_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended('partner-customer:'||p_partner||':'||p_customer,0));
 perform pg_advisory_xact_lock(hashtextextended('partner-order:'||p_partner||':'||p_key,0));
 select * into r from public.publish_requests where partner_id=p_partner and external_order_id=p_key;
 if found then
  if r.external_customer_id<>p_customer or r.creation_fingerprint<>p_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('id',r.id,'request_number',r.request_number,'replayed',true,'status',r.status,'amount',case when r.final_total is null then null else round(r.final_total*100) end,'pricing_mode','manual');
 end if;
 if exists(select 1 from public.publish_requests where partner_id=p_partner and external_customer_id=p_customer and status in ('pending','quoted','negotiation','approved','payment_review','info_requested')) then raise exception 'OPEN_REQUEST_EXISTS'; end if;
 if p_content->>'client_type' not in ('business','government') or length(trim(coalesce(p_content->>'org_name','')))=0 then raise exception 'INVALID_ORGANIZATION'; end if;
 insert into public.publish_requests(partner_id,external_customer_id,external_order_id,creation_fingerprint,source_site,
 influencer_id,client_type,org_name,org_representative,org_license,category,channels,scope,images,request_type,num_posts,
 title,content,client_name,client_phone,client_email,client_city,x_handle,link,hashtags,preferred_date,
 base_price,extras_total,vat_amount,total_amount,admin_quoted_price,final_total,status,auto_quote_note,last_status_change,updated_at)
 values(p_partner,p_customer,p_key,p_fingerprint,p_partner,(p_content->>'influencer_id')::uuid,p_content->>'client_type',
 p_content->>'org_name',nullif(p_content->>'org_representative',''),nullif(p_content->>'org_license',''),p_content->>'category',p_content->'channels',
 case when jsonb_array_length(p_content->'channels')>1 then 'all' else 'single' end,'one','single',1,
 p_content->>'title',p_content->>'content',p_content->>'name',p_content->>'phone',p_content->>'email',p_content->>'city',p_content->>'handle',
 nullif(p_content->>'link',''),nullif(p_content->>'hashtags',''),nullif(p_content->>'preferred_date','')::date,
 0,0,0,0,null,null,'pending','بانتظار تسعير الإدارة — طلب جهة عبر الشريك',now(),now()) returning * into r;
 return jsonb_build_object('id',r.id,'request_number',r.request_number,'replayed',false,'status','pending','amount',null,'pricing_mode','manual');
end $$;

create function public.partner_offer_action(p_partner text,p_customer text,p_request uuid,p_key text,p_fingerprint text,p_updated timestamptz,p_action text,p_selected jsonb,p_offered jsonb,p_discount text,p_reason text,p_proposed bigint,p_reach numeric)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.publish_requests; a public.partner_order_actions; deal public.discount_codes; response jsonb;
 base numeric; extras numeric; subtotal numeric; total numeric; disc numeric:=0; used integer; round_no integer; original numeric; counter numeric; pct numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('partner-action:'||p_partner||':'||p_key,0));
 -- Same customer lock as order creation. Quota across linked customers is locked by central identity too.
 perform pg_advisory_xact_lock(hashtextextended('partner-customer:'||p_partner||':'||p_customer,0));
 select * into a from public.partner_order_actions where partner_id=p_partner and idempotency_key=p_key;
 if found then
  if a.customer_id<>p_customer or a.request_id<>p_request or a.fingerprint<>p_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return a.response||jsonb_build_object('replayed',true);
 end if;
 select * into r from public.publish_requests where id=p_request and partner_id=p_partner and external_customer_id=p_customer for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if r.client_type not in ('business','government') or r.package_snapshot is not null or r.status not in ('quoted','approved') or r.admin_quoted_price is null or r.payment_status='paid' or r.paid_at is not null then raise exception 'OFFER_NOT_AVAILABLE'; end if;
 if r.updated_at is distinct from p_updated then raise exception 'OFFER_CHANGED'; end if;
 if r.status='quoted' and r.quote_expires_at<=now() then raise exception 'OFFER_EXPIRED'; end if;
 if exists(select 1 from public.partner_checkout_sessions where request_id=r.id and (status='review_required' or (status='pending' and expires_at>now()))) or exists(select 1 from public.partner_payment_receipts where request_id=r.id and status='review_required') then raise exception 'CHECKOUT_ACTIVE'; end if;
 if p_action='accept' then
  if jsonb_typeof(p_selected)<>'array' or jsonb_typeof(p_offered)<>'array' then raise exception 'OFFER_CHANGED'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_selected) s where not exists(select 1 from jsonb_array_elements(p_offered) e where e->>'id'=s)) then raise exception 'OFFER_CHANGED'; end if;
  base=round(r.admin_quoted_price*100);
  select coalesce(sum(round((e->>'price')::numeric*100)),0) into extras from jsonb_array_elements(p_offered) e where p_selected ? (e->>'id');
  subtotal=base+extras; total=subtotal;
  if p_discount is not null then
   select * into deal from public.discount_codes where code=p_discount for update;
   if not found or deal.recovery_draft_id is not null or (r.discount_code is distinct from p_discount and (not deal.is_active or deal.expires_at<=now() or (deal.max_uses is not null and deal.used_count>=deal.max_uses))) then raise exception 'DISCOUNT_UNAVAILABLE'; end if;
   if r.discount_code is not null and r.discount_code<>p_discount then raise exception 'DISCOUNT_UNAVAILABLE'; end if;
   disc=least(round(subtotal*deal.discount_pct/10000)*100,coalesce(round(deal.max_discount_amount*100),999999999999)); total=subtotal-disc;
   if r.discount_code is distinct from p_discount then update public.discount_codes set used_count=coalesce(used_count,0)+1 where id=deal.id; end if;
  end if;
  if total<0 then raise exception 'OFFER_CHANGED'; end if;
  update public.publish_requests set admin_offered_extras=p_offered,user_selected_extras=p_selected,extras_selected_total=extras/100,final_total=total/100,
   discount_code=p_discount,discount_code_id=case when p_discount is not null then deal.id else null end,
   discount_pct=case when p_discount is not null then deal.discount_pct else null end,discount_amount=case when p_discount is not null then disc/100 else null end,
   estimated_reach=p_reach,status=case when total<=0 then 'in_progress' else 'approved' end,approved_at=now(),updated_at=now(),last_status_change=now() where id=r.id;
  response=jsonb_build_object('id',r.id,'status',case when total<=0 then 'in_progress' else 'approved' end,'amount',total,'base_amount',base,'extras_amount',extras,'discount_amount',disc,'ready_for_payment',total>0);
 elsif p_action='reject' then
  if r.status<>'quoted' or length(trim(p_reason))<10 then raise exception 'OFFER_NOT_AVAILABLE'; end if;
  update public.publish_requests set status='client_rejected',client_rejection_reason=p_reason,rejected_at=now(),updated_at=now(),last_status_change=now() where id=r.id;
  response=jsonb_build_object('id',r.id,'status','client_rejected','amount',round(r.final_total*100),'ready_for_payment',false);
 elsif p_action='negotiate' then
  if r.status<>'quoted' or r.negotiation_rejected or r.negotiation_round>=3 or length(trim(p_reason))<10 then raise exception 'NEGOTIATION_LIMIT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('partner-negotiation:'||coalesce(r.user_id::text,p_partner||':'||p_customer),0));
  select coalesce(sum(negotiation_round),0) into used from public.publish_requests where negotiation_requested_at>=now()-interval '30 days'
    and ((r.user_id is not null and user_id=r.user_id) or (r.user_id is null and partner_id=p_partner and external_customer_id=p_customer));
  if used>=3 then raise exception 'NEGOTIATION_LIMIT'; end if;
  round_no=r.negotiation_round+1; original=coalesce(r.original_quoted_price,r.admin_quoted_price,0); pct=round_no*5;
  counter=greatest(round(original*(1-pct/100)),coalesce(p_proposed::numeric/100,0));
  if counter>r.admin_quoted_price then raise exception 'OFFER_CHANGED'; end if;
  update public.publish_requests set admin_quoted_price=counter,final_total=counter,original_quoted_price=original,negotiated_at=now(),
   negotiated_discount_percentage=case when original>0 then round((original-counter)*100/original) else 0 end,
   negotiation_price_source=case when coalesce(p_proposed,0)>0 and p_proposed::numeric/100>=round(original*(1-pct/100)) then 'client_accepted' else 'admin_discount' end,
   quote_expires_at=now()+interval '24 hours',user_selected_extras='[]',extras_selected_total=0,negotiation_round=round_no,
   negotiation_rejected=round_no>=3,negotiation_reason=p_reason,client_proposed_price=p_proposed::numeric/100,negotiation_requested_at=now(),updated_at=now(),last_status_change=now() where id=r.id;
  response=jsonb_build_object('id',r.id,'status','quoted','amount',round(counter*100),'original_amount',round(original*100),'discount_pct',case when original>0 then round((original-counter)*100/original) else 0 end,'round',round_no,'max_rounds',3,'monthly_used',used+1,'monthly_remaining',greatest(0,2-used),'is_final',round_no>=3,'ready_for_payment',false);
 else raise exception 'OFFER_NOT_AVAILABLE'; end if;
 response=response||jsonb_build_object('replayed',false);
 insert into public.partner_order_actions(partner_id,idempotency_key,customer_id,request_id,fingerprint,response) values(p_partner,p_key,p_customer,r.id,p_fingerprint,response);
 return response;
end $$;

-- Allow organization documents before pricing. Ownership and file limits remain in the existing RPC.
do $files$ declare f record; definition text; begin
 select p.oid into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='partner_reserve_file';
 definition=pg_get_functiondef(f.oid);
 definition=replace(definition,'''approved'', ''in_progress'', ''info_requested'', ''content_review'', ''changes_requested''','''pending'', ''quoted'', ''negotiation'', ''approved'', ''in_progress'', ''info_requested'', ''content_review'', ''changes_requested''');
 -- Existing source uses compact literals, retained by pg_get_functiondef.
 definition=replace(definition,'''approved'',''in_progress'',''info_requested'',''content_review'',''changes_requested''','''pending'',''quoted'',''negotiation'',''approved'',''in_progress'',''info_requested'',''content_review'',''changes_requested''');
 execute definition;
end $files$;

-- Sandbox versions use only isolated data. No production request or invoice sequence is touched.
do $copies$
declare f record; definition text; signature text;
begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('partner_create_organization_order','partner_offer_action','partner_reserve_file') loop
  definition=pg_get_functiondef(f.oid);
  definition=replace(definition,'public.publish_requests','public.partner_sandbox_orders');
  definition=replace(definition,'public.partner_order_actions','public.partner_sandbox_order_actions');
  definition=replace(definition,'public.partner_checkout_sessions','public.partner_sandbox_checkout_sessions');
  definition=replace(definition,'public.partner_payment_receipts','public.partner_sandbox_payment_receipts');
  definition=replace(definition,'public.partner_files','public.partner_sandbox_files');
  definition=replace(definition,'public.discount_codes','public.partner_sandbox_discounts');
  definition=replace(definition,'public.'||f.proname||'(','public.'||replace(f.proname,'partner_','partner_sandbox_')||'(');
  execute definition;
  signature='public.'||replace(f.proname,'partner_','partner_sandbox_')||'('||pg_get_function_identity_arguments(f.oid)||')';
  execute 'revoke all on function '||signature||' from public,anon,authenticated';execute 'grant execute on function '||signature||' to service_role';
  if f.proname<>'partner_reserve_file' then
   signature='public.'||f.proname||'('||pg_get_function_identity_arguments(f.oid)||')';
   execute 'revoke all on function '||signature||' from public,anon,authenticated';execute 'grant execute on function '||signature||' to service_role';
  end if;
 end loop;
end $copies$;

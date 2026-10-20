create or replace function workforce_private.command_retry(p_actor uuid,p_key uuid,p_command text,p_id uuid,p_payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare receipt workforce_private.command_receipts;
begin
 if p_key is null or p_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object'
  or (p_command<>'task:review' and octet_length(p_payload::text)>100000) then
  raise exception 'طلب غير صحيح' using errcode='PT400';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text||p_key::text,0));
 select * into receipt from workforce_private.command_receipts where actor_id=p_actor and request_id=p_key;
 if found then
  if receipt.command<>p_command or receipt.entity_id<>p_id or receipt.payload<>p_payload then raise exception 'مفتاح إعادة المحاولة مستخدم لطلب مختلف' using errcode='PT409'; end if;
  return receipt.response;
 end if;
 return null;
end $$;

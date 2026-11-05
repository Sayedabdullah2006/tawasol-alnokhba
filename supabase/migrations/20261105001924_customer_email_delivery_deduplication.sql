-- Private delivery receipts. No message body, recipient address, OTP or invoice is stored here.
create table public.customer_email_deliveries (
 delivery_key text primary key check(delivery_key ~ '^[a-f0-9]{64}$'),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 state text not null check(state in ('sending','sent','failed','unknown')),
 attempt_id uuid not null,
 first_attempt_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 provider_id text
);
alter table public.customer_email_deliveries enable row level security;
revoke all on public.customer_email_deliveries from public,anon,authenticated;
grant select,insert,update,delete on public.customer_email_deliveries to service_role;

create function public.customer_mail_claim(p_delivery_key text,p_payload_hash text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare r public.customer_email_deliveries; token uuid:=gen_random_uuid();
begin
 if p_delivery_key !~ '^[a-f0-9]{64}$' or p_payload_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_EMAIL_KEY'; end if;
 insert into public.customer_email_deliveries(delivery_key,payload_hash,state,attempt_id)
 values(p_delivery_key,p_payload_hash,'sending',token) on conflict do nothing returning * into r;
 if found then return jsonb_build_object('action','send','attempt_id',token); end if;
 select * into strict r from public.customer_email_deliveries where delivery_key=p_delivery_key for update;
 if r.state='sent' then return jsonb_build_object('action','already_sent','provider_id',r.provider_id); end if;
 if r.payload_hash<>p_payload_hash then return jsonb_build_object('action','payload_conflict'); end if;
 if r.state='sending' and r.updated_at>now()-interval '2 minutes' then return jsonb_build_object('action','in_flight'); end if;
 -- Unknown transport outcomes may retry only inside the provider's 24-hour idempotency window.
 if r.first_attempt_at<now()-interval '23 hours' then return jsonb_build_object('action','needs_review'); end if;
 update public.customer_email_deliveries set state='sending',attempt_id=token,updated_at=now() where delivery_key=p_delivery_key;
 return jsonb_build_object('action','send','attempt_id',token);
end $$;

create function public.customer_mail_finish(p_delivery_key text,p_attempt_id uuid,p_state text,p_provider_id text default null) returns boolean
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if p_state not in ('sent','failed','unknown') then raise exception 'INVALID_EMAIL_RESULT'; end if;
 update public.customer_email_deliveries set state=p_state,provider_id=p_provider_id,updated_at=now()
 where delivery_key=p_delivery_key and attempt_id=p_attempt_id and state='sending';
 return found;
end $$;
revoke all on function public.customer_mail_claim(text,text) from public,anon,authenticated;
revoke all on function public.customer_mail_finish(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.customer_mail_claim(text,text) to service_role;
grant execute on function public.customer_mail_finish(text,uuid,text,text) to service_role;

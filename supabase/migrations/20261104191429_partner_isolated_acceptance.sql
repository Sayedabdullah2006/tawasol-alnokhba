-- Acceptance copies contain no production rows, foreign keys, triggers or invoice counters.
create sequence public.partner_sandbox_request_number_seq start 1;
do $isolation$
declare pair text[]; src text; dst text;
begin
 foreach pair slice 1 in array array[
  ['publish_requests','partner_sandbox_orders'], ['partner_quotes','partner_sandbox_quotes'],
  ['partner_checkout_sessions','partner_sandbox_checkout_sessions'], ['partner_payment_receipts','partner_sandbox_payment_receipts'],
  ['partner_files','partner_sandbox_files'], ['discount_codes','partner_sandbox_discounts']
 ] loop
  src=pair[1]; dst=pair[2];
  execute format('create table public.%I (like public.%I including defaults including constraints including indexes)',dst,src);
  execute format('alter table public.%I enable row level security',dst);
  execute format('revoke all on public.%I from public,anon,authenticated',dst);
  execute format('grant all on public.%I to service_role',dst);
 end loop;
end $isolation$;
alter table public.partner_sandbox_orders alter column request_number set default nextval('public.partner_sandbox_request_number_seq');
grant usage,select on sequence public.partner_sandbox_request_number_seq to service_role;
alter table public.partner_sandbox_checkout_sessions alter column payment_mode set default 'sandbox';
alter table public.partner_sandbox_checkout_sessions add constraint sandbox_mode_only check(payment_mode='sandbox');
-- No production trigger is copied; no identity mapping, execution, notification or accounting hook runs.
do $functions$
declare f record; definition text; signature text;
begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname in ('partner_create_order','partner_settle_payment','partner_reserve_file','partner_cancel_order')
 or (p.proname='partner_create_checkout' and p.pronargs=6)) loop
  definition=pg_get_functiondef(f.oid);
  definition=replace(definition,'public.publish_requests','public.partner_sandbox_orders');
  definition=replace(definition,'public.partner_quotes','public.partner_sandbox_quotes');
  definition=replace(definition,'public.partner_checkout_sessions','public.partner_sandbox_checkout_sessions');
  definition=replace(definition,'public.partner_payment_receipts','public.partner_sandbox_payment_receipts');
  definition=replace(definition,'public.partner_files','public.partner_sandbox_files');
  definition=replace(definition,'public.discount_codes','public.partner_sandbox_discounts');
  definition=replace(definition,'public.'||f.proname||'(','public.'||replace(f.proname,'partner_','partner_sandbox_')||'(');
  execute definition;
  signature='public.'||replace(f.proname,'partner_','partner_sandbox_')||'('||pg_get_function_identity_arguments(f.oid)||')';
  execute 'revoke all on function '||signature||' from public,anon,authenticated';
  execute 'grant execute on function '||signature||' to service_role';
 end loop;
end $functions$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('partner-sandbox-files','partner-sandbox-files',false,20971520,array['image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
-- Persist the original acceptance PDF here, never in service_invoices or its production bucket.
create table public.partner_sandbox_invoices (
 request_id uuid primary key references public.partner_sandbox_orders(id),
 invoice_number text not null unique, pdf_base64 text not null, created_at timestamptz not null default now()
);
alter table public.partner_sandbox_invoices enable row level security;
revoke all on public.partner_sandbox_invoices from public,anon,authenticated;
grant select,insert,delete on public.partner_sandbox_invoices to service_role;

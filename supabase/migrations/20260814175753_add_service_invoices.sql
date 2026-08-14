create sequence if not exists public.service_invoice_number_seq start with 1;

create table if not exists public.service_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default (
    'INV-' || to_char(timezone('Asia/Riyadh', now()), 'YYYY') || '-' ||
    lpad(nextval('public.service_invoice_number_seq')::text, 6, '0')
  ),
  request_id uuid unique references public.publish_requests(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  request_number integer not null,
  status text not null default 'issued' check (status in ('issued', 'voided')),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'SAR' check (currency = 'SAR'),
  payment_provider text,
  payment_method text,
  payment_reference text,
  paid_at timestamptz,
  issued_at timestamptz not null default now(),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  pdf_path text,
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_invoices_user_id_idx
  on public.service_invoices(user_id, issued_at desc);

create index if not exists service_invoices_request_number_idx
  on public.service_invoices(request_number);

alter table public.service_invoices enable row level security;

revoke all on table public.service_invoices from anon, authenticated;
grant select, insert, update, delete on table public.service_invoices to service_role;
grant usage, select on sequence public.service_invoice_number_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-invoices', 'service-invoices', false, 5242880, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

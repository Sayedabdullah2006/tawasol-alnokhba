alter table public.service_invoices
  add column if not exists template_version integer not null default 1;

alter table public.service_invoices
  alter column template_version set default 2;

comment on column public.service_invoices.template_version is
  'Rendered PDF template version. Existing version 1 documents are regenerated on next download.';

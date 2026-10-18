-- Existing own-profile/admin RLS and service-only writes protect these fields.
alter table public.wf_employees
 add column national_id text not null default '' check(length(national_id)<=30),
 add column birth_date date,
 add column qualification text not null default '' check(length(qualification)<=250),
 add column national_address text not null default '' check(length(national_address)<=250);

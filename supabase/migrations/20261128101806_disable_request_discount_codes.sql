alter table public.publish_requests
  add column discount_codes_disabled boolean not null default false,
  add constraint publish_requests_no_discount_code_when_disabled
    check (not discount_codes_disabled or (discount_code is null and discount_code_id is null));

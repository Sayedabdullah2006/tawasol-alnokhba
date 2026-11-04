revoke all on public.individual_catalog_releases,public.individual_catalog_state from service_role;
grant select,insert on public.individual_catalog_releases to service_role;
grant select,insert,update on public.individual_catalog_state to service_role;

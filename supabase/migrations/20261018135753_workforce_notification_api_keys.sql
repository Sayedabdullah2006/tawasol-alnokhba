-- Modern sb_secret keys are opaque API keys, not JWTs. Validate the worker credential server-side against Vault.
create function public.wf_validate_notification_worker(p_token text) returns boolean
language sql stable security definer set search_path='' as $$
select length(p_token) between 32 and 1024 and exists(select 1 from vault.decrypted_secrets where name='workforce_service_role_key' and sha256(convert_to(decrypted_secret,'UTF8'))=sha256(convert_to(p_token,'UTF8')));
$$;
revoke all on function public.wf_validate_notification_worker(text) from public,anon,authenticated;
grant execute on function public.wf_validate_notification_worker(text) to service_role;
create or replace function public.wf_configure_notification_delivery(p_url text,p_key text,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare secret_id uuid;
begin
 if p_url !~ '^https://[a-z0-9]+\.supabase\.co$' or length(p_key)<32 or length(p_key)>1024 then raise exception 'Invalid worker configuration'; end if;
 select id into secret_id from vault.secrets where name='workforce_project_url';
 if secret_id is null then perform vault.create_secret(p_url,'workforce_project_url'); else perform vault.update_secret(secret_id,p_url); end if;
 select id into secret_id from vault.secrets where name='workforce_service_role_key';
 if secret_id is null then perform vault.create_secret(p_key,'workforce_service_role_key'); else perform vault.update_secret(secret_id,p_key); end if;
 update public.wf_notification_delivery_settings set enabled=p_enabled,activated_at=case when not enabled and p_enabled then now() else activated_at end where id;
 perform cron.schedule('workforce-notifications-every-minute','* * * * *','select public.wf_generate_notification_reminders(); select workforce_private.wake_notifications();');
end $$;
revoke all on function public.wf_configure_notification_delivery(text,text,boolean) from public,anon,authenticated;
grant execute on function public.wf_configure_notification_delivery(text,text,boolean) to service_role;

-- A dedicated header preserves opaque keys through gateway authentication.
create or replace function workforce_private.wake_notifications() returns void
language plpgsql security definer set search_path='' as $$
declare endpoint text; token text;
begin
 if not exists(select 1 from public.wf_notification_delivery_settings where id and enabled) then return; end if;
 if current_setting('workforce.notification_wake',true)='1' then return; end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='workforce_project_url';
 select decrypted_secret into token from vault.decrypted_secrets where name='workforce_service_role_key';
 if endpoint is null or token is null then return; end if;
 perform set_config('workforce.notification_wake','1',true);
 perform net.http_post(url:=endpoint||'/functions/v1/workforce-notifications',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token,'x-workforce-secret',token),
   body:='{}'::jsonb,timeout_milliseconds:=120000);
exception when others then return;
end $$;

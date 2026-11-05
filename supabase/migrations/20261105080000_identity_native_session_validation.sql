-- Keep the existing service-only boundary. NULL denotes a native Auth session;
-- a concrete client still requires that exact OAuth client, as before.
create or replace function partner_identity_private.valid_session(p_user uuid,p_session uuid,p_client uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
 where s.id=p_session and s.user_id=p_user and s.oauth_client_id is not distinct from p_client
 and (s.not_after is null or s.not_after>now()) and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<=now()) and u.email_confirmed_at is not null);
$$;
revoke all on function partner_identity_private.valid_session(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function partner_identity_private.valid_session(uuid,uuid,uuid) to service_role;

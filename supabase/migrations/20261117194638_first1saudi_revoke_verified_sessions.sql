-- OAuth client tokens cannot call the provider's account logout endpoint.
-- The server validates the token before invoking this service-role-only RPC.
create function partner_identity_private.revoke_first1saudi_sessions(
  p_user uuid, p_session uuid, p_client uuid, p_customer text, p_global boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('partner-identity-user:awwal-saudi:' || p_user::text, 0)
  );

  if p_global is null
     or p_client is null
     or not partner_identity_private.valid_session(p_user, p_session, p_client) then
    return false;
  end if;

  if p_global and not exists (
    select 1 from public.partner_identity_links
    where partner_id = 'awwal-saudi'
      and auth_user_id = p_user
      and external_customer_id = p_customer
  ) then
    return false;
  end if;

  -- The refresh tokens are removed by their foreign key to auth.sessions.
  delete from auth.sessions
  where user_id = p_user
    and (p_global or (id = p_session and oauth_client_id = p_client));

  return found;
end;
$$;

create function public.partner_revoke_first1saudi_sessions(
  p_user uuid, p_session uuid, p_client uuid, p_customer text, p_global boolean
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select partner_identity_private.revoke_first1saudi_sessions(
    p_user, p_session, p_client, p_customer, p_global
  );
$$;

revoke all on function partner_identity_private.revoke_first1saudi_sessions(uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.partner_revoke_first1saudi_sessions(uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function partner_identity_private.revoke_first1saudi_sessions(uuid, uuid, uuid, text, boolean)
  to service_role;
grant execute on function public.partner_revoke_first1saudi_sessions(uuid, uuid, uuid, text, boolean)
  to service_role;

create schema if not exists partner_identity_private;
revoke all on schema partner_identity_private from public,anon,authenticated;
grant usage on schema partner_identity_private to service_role;

-- The definer is private and exposes a boolean only. No auth-table grants are added to service_role.
create function partner_identity_private.valid_session(p_user uuid,p_session uuid,p_client uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
 where s.id=p_session and s.user_id=p_user and s.oauth_client_id=p_client
 and (s.not_after is null or s.not_after>now()) and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<=now()) and u.email_confirmed_at is not null);
$$;
revoke all on function partner_identity_private.valid_session(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function partner_identity_private.valid_session(uuid,uuid,uuid) to service_role;

create table public.partner_identity_links (
 partner_id text not null, external_customer_id text not null,
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 linked_at timestamptz not null default now(),
 primary key(partner_id,external_customer_id), unique(partner_id,auth_user_id)
);
alter table public.partner_identity_links enable row level security;
revoke all on public.partner_identity_links from public,anon,authenticated,service_role;
grant select,insert on public.partner_identity_links to service_role;

create function public.partner_identity_session_valid(p_user uuid,p_session uuid,p_client uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select partner_identity_private.valid_session(p_user,p_session,p_client);
$$;

create function public.partner_link_identity(p_partner text,p_customer text,p_user uuid,p_session uuid,p_client uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare link public.partner_identity_links; affected integer;
begin
 if not partner_identity_private.valid_session(p_user,p_session,p_client) then raise exception 'IDENTITY_SESSION_INVALID'; end if;
 if length(p_partner)<1 or length(p_customer)<1 or length(p_customer)>128 then raise exception 'INVALID_IDENTITY'; end if;
 -- Shares the lock used by partner_create_order, preserving concurrent orders during linking.
 perform pg_advisory_xact_lock(hashtextextended('partner-customer:'||p_partner||':'||p_customer,0));
 perform pg_advisory_xact_lock(hashtextextended('partner-identity-user:'||p_partner||':'||p_user,0));
 if not exists(select 1 from public.profiles where id=p_user) then raise exception 'IDENTITY_PROFILE_UNAVAILABLE'; end if;
 if exists(select 1 from public.partner_identity_links where partner_id=p_partner
   and (external_customer_id=p_customer or auth_user_id=p_user)
   and (external_customer_id<>p_customer or auth_user_id<>p_user)) then raise exception 'IDENTITY_LINK_CONFLICT'; end if;
 if exists(select 1 from public.publish_requests where partner_id=p_partner and external_customer_id=p_customer
   and user_id is not null and user_id<>p_user) then raise exception 'IDENTITY_LINK_CONFLICT'; end if;
 insert into public.partner_identity_links(partner_id,external_customer_id,auth_user_id)
 values(p_partner,p_customer,p_user) on conflict(partner_id,external_customer_id) do nothing;
 select * into strict link from public.partner_identity_links where partner_id=p_partner and external_customer_id=p_customer;
 if link.auth_user_id<>p_user then raise exception 'IDENTITY_LINK_CONFLICT'; end if;
 -- No ids, status, prices, payment data, snapshots or external ownership are rewritten.
 update public.publish_requests set user_id=p_user where partner_id=p_partner and external_customer_id=p_customer and user_id is null;
 get diagnostics affected=row_count;
 return jsonb_build_object('subject',p_user,'external_customer_id',p_customer,'linked_at',link.linked_at,'linked_orders',affected);
end;
$$;

create function public.partner_assign_linked_user() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.partner_id is not null and new.external_customer_id is not null and new.user_id is null then
  select auth_user_id into new.user_id from public.partner_identity_links
  where partner_id=new.partner_id and external_customer_id=new.external_customer_id;
 end if;
 return new;
end;
$$;
create trigger partner_assign_linked_user before insert on public.publish_requests for each row execute function public.partner_assign_linked_user();

revoke all on function public.partner_identity_session_valid(uuid,uuid,uuid),public.partner_link_identity(text,text,uuid,uuid,uuid),public.partner_assign_linked_user() from public,anon,authenticated,service_role;
grant execute on function public.partner_identity_session_valid(uuid,uuid,uuid),public.partner_link_identity(text,text,uuid,uuid,uuid),public.partner_assign_linked_user() to service_role;

create table public.partner_sso_attempts(key text not null, created_at timestamptz not null default now());
create index partner_sso_attempts_key_time on public.partner_sso_attempts(key,created_at);
alter table public.partner_sso_attempts enable row level security;
revoke all on public.partner_sso_attempts from public,anon,authenticated,service_role;
grant select,insert,delete on public.partner_sso_attempts to service_role;
create function public.partner_sso_consume_attempt(p_email text,p_ip text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_email!~'^[a-f0-9]{64}$' or p_ip!~'^[a-f0-9]{64}$' then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('sso-email:'||p_email,0));
 perform pg_advisory_xact_lock(hashtextextended('sso-ip:'||p_ip,0));
 delete from public.partner_sso_attempts where created_at<now()-interval '1 day';
 if (select count(*) from public.partner_sso_attempts where key='email:'||p_email and created_at>now()-interval '15 minutes')>=5
 or (select count(*) from public.partner_sso_attempts where key='ip:'||p_ip and created_at>now()-interval '15 minutes')>=30 then return false; end if;
 insert into public.partner_sso_attempts(key) values('email:'||p_email),('ip:'||p_ip);
 return true;
end; $$;
revoke all on function public.partner_sso_consume_attempt(text,text) from public,anon,authenticated,service_role;
grant execute on function public.partner_sso_consume_attempt(text,text) to service_role;

-- Supabase OAuth tokens otherwise inherit the user's entire Data API/RLS access.
-- First1Saudi receives identity credentials only; all business data stays behind the signed partner API.
-- Ordinary native sessions (no client_id) and service_role keep their current permissions.
create function public.partner_oidc_resource_gate() returns void language plpgsql security invoker set search_path='' as $$
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'client_id' is not null then
  raise insufficient_privilege using message='OAuth tokens are for identity only; use the signed partner API';
 end if;
end; $$;
revoke all on function public.partner_oidc_resource_gate() from public;
grant execute on function public.partner_oidc_resource_gate() to anon,authenticated,service_role;
alter role authenticator set pgrst.db_pre_request='public.partner_oidc_resource_gate';
notify pgrst,'reload config';

do $$ declare t record; begin
 for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where ((n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity) or (n.nspname='storage' and c.relname='objects')) loop
  execute format('create policy partner_oidc_identity_only on %I.%I as restrictive for all to authenticated using (((select auth.jwt())->>''client_id'') is null) with check (((select auth.jwt())->>''client_id'') is null)',t.nspname,t.relname);
 end loop;
end; $$;

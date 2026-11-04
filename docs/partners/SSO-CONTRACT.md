# First1Saudi central identity contract

Tawasol uses its existing Supabase Auth users as the identity provider. Existing UUIDs, passwords and native sessions are not migrated. Supabase performs authorization-code issuance, PKCE, refresh-token rotation, OIDC signing and UserInfo. No custom authorization-server implementation is introduced.

## Registered confidential client

- Issuer: `https://rbyglvwbojitxyazmgap.supabase.co/auth/v1`
- Discovery: `https://rbyglvwbojitxyazmgap.supabase.co/auth/v1/.well-known/openid-configuration`
- Client ID: `22885502-0f8f-48e1-9fe4-c21e969a6ab9`
- Exact callback: `https://first1saudi.net/services/auth/callback` (no trailing slash)
- Token authentication: **client_secret_post** over HTTPS.
- Flow: authorization code, PKCE **S256**, random one-use state and nonce.
- Requested scopes: `openid email profile offline_access`.
- ID-token algorithm: ES256; validate signature using the discovered JWKS.
- Native hosted consent: `https://nukhba.media/oauth/consent`.
- Hosted login/verified signup: `/auth/sso?authorization_id=...`. The authorization ID is opaque, not a UUID.
- Dynamic OAuth client registration is disabled. No signing keys were rotated.

The client secret is in the ignored local file `.env.first1saudi-sso`, beside the repository `.env.local`. It belongs only in the First1Saudi server's private configuration. It is not included in the handoff ZIP, examples or Git. Existing partner HMAC keys remain unchanged and distinct from this secret.

The central code pins the registered public client ID above; FIRST1SAUDI_OIDC_CLIENT_ID may override it for a separately registered environment. No new central runtime secret is required. SSO_UI_ORIGIN is a localhost test override and must not be set in production.

`oidc-client.mjs` is the server-only reference using `openid-client@6.8.9`, with signature verification enabled. Install the supplied sso-runtime package/lock in the private Node runtime. `oidc-bridge.mjs` is optional stdin/stdout transport for PHP; its output contains credentials and must be consumed in server memory, never logs or browser responses.

`begin()` returns an authorization URL and a private transaction (state, nonce, PKCE verifier, timestamp). Store the transaction server-side, tied to the current browser/session. Generate a new transaction for each attempt. Atomically consume it before `finish()`. Its maximum lifetime is five minutes. The callback and all return destinations must be exact allowlisted URLs. Post-login local return paths are kept server-side and validated independently.

`begin({forceLogin:true})` starts a validated provider request and selects its hosted login UI, for explicit account switching or first-time account linking. `begin({screen:'register'})` opens central signup. This never collects the central password in WordPress. Native signup verifies the email by OTP; existing confirmed credentials are never overwritten. Pending signup resends require the pending password to be proved. Signup and passwordless-code endpoints are origin-checked, CAPTCHA-aware, and rate-limited by hashed email/IP. Existing native auth routes remain unchanged.

`finish()` verifies issuer, audience, signature, nonce, state, PKCE, expiry and UserInfo subject, then returns a minimal identity and private tokens. `refresh(refreshToken,subject)` checks that the identity remains the same. Serialize refresh per WordPress session to avoid rotated-token races. First1Saudi must not decode an unverified JWT and treat it as login proof.

## Server-signed identity API

All calls use the existing partner HMAC protocol, partner `awwal-saudi`, a fresh nonce and POST idempotency key. Body is only `{"access_token":"<OIDC access token>"}`. ID tokens and native Supabase access tokens are not accepted as substitutes. Never pass passwords, user IDs, emails, roles or external-customer IDs in this body.

### POST identity/session

Verifies the provider token, exact OAuth client, issuer, expiry, confirmed user, live OAuth session and account ban/deletion state. Returns:

```json
{
  "issuer": "https://rbyglvwbojitxyazmgap.supabase.co/auth/v1",
  "subject": "CENTRAL_USER_UUID",
  "email": "verified@example.com",
  "email_verified": true,
  "profile": { "full_name": "...", "phone": "...", "city": "...", "x_handle": "..." },
  "link": { "external_customer_id": "EXISTING_WP_IDENTITY", "linked_at": "..." },
  "expires_at": "..."
}
```

`link` is null before linking. User-editable contact data is not an authentication factor; no phone verification or role is implied. The subject, not email/phone/name, identifies the account.

Before local WordPress login, call session using signed customer `oidc.<subject>` if no local customer has yet been resolved. For a mapped user, keep the returned existing external customer ID for all order/quote/file/payment calls. Check the central session before protected operations; any server cache is per session and at most 30 seconds, with immediate invalidation on logout or 401. Refresh expired access credentials server-side, then revalidate.

### POST identity/link

The signed `X-Customer-ID` must be the stable existing `f1o_customer_id()` obtained from the WordPress account whose ownership has just been proved. Requires successful OIDC login and explicit account-link confirmation. The partner server vouches for the WordPress side; never accept a customer ID supplied by the browser.

Returns `subject`, `external_customer_id`, `linked_at`, `linked_orders`. It binds the two identities once, and attaches only matching unowned partner orders to the central user (`user_id`). It does not change order IDs, status, prices, payment records, package snapshots, request numbers, emails or external ownership. Future partner orders automatically inherit the linked user. Native Tawasol history remains separate from the partner API's channel filter.

Linking is transactional and idempotent. A conflicting central user, WordPress identity, or existing order owner produces **409 IDENTITY_LINK_CONFLICT** without reassigning data. Do not retry using another customer ID or silently merge accounts. Present a support/review path.

### POST identity/logout

Revokes the access token's current OAuth session only, returning `{"logged_out":true,"scope":"oauth_session"}`. Clear the matching WordPress session, encrypted token record, pending transactions and cached validation. Other Tawasol/native sessions and other devices are not intentionally logged out. If the access token is expired, refresh before revocation if possible; always clear local credentials on logout. This contract does not advertise a global OIDC end-session endpoint.

### Errors

- 401 IDENTITY_SESSION_INVALID: invalid, expired, revoked, wrong-client or non-OAuth credentials; refresh or restart login, never fall back to email matching.
- 403 IDENTITY_CLIENT_NOT_ALLOWED: use the main awwal-saudi identity channel; a payment Sandbox identity is not this OAuth client.
- 409 IDENTITY_LINK_CONFLICT: explicit conflict resolution required.
- 503 IDENTITY_UNAVAILABLE: temporary failure; no local authenticated session should be created on an unverifiable identity.
- Other HMAC errors retain their existing meaning.

## Migration and permission rules

1. Keep all current WordPress accounts, roles, passwords, customer UUID options, orders and invoice references. No bulk account creation or email-based merging.
2. Uniquely bind `(issuer,subject)` to one local user using a database unique index, not editable user metadata alone. Preserve each existing local role; new customer accounts receive the least-privileged fixed customer/subscriber role. Central role/claims never grant WordPress admin/editor privileges.
3. Existing linked subject: log in the mapped local user after verification. Unlinked existing WordPress account: require its current login/reauthentication, then a fresh central login and an explicit confirmation before link.
4. Same verified email but no established subject mapping: do not select that WordPress account silently. Ask the user to prove the old account or follow recovery.
5. Brand-new subject with no conflicting local account: create a local customer shell, obtain its stable `f1o_customer_id()`, call link, and persist the subject mapping. If linking fails, do not enable access to another account's history.
6. Use the same existing customer ID after successful migration. Do not replace wp.UUID with the central UUID in historical API calls.
7. Protect the full start/callback/link-confirmation flow from login CSRF, replay and session fixation; regenerate WordPress authentication cookies on login. Keep admin recovery login available during rollout. Scope changes to the customer portal first.
8. Store credentials encrypted and per WordPress session, outside public assets; never store them in localStorage, query strings, logs, readable options or a shared per-user refresh-token slot.

## Identity-only resource isolation

Supabase OAuth tokens ordinarily inherit the user's Data API permissions. This rollout blocks OAuth `client_id` credentials at the PostgREST pre-request gate, and adds restrictive OAuth guards to current public RLS tables and storage.objects, covering direct REST/RPC, private storage and table access used by Realtime. Native tokens without client_id and service_role keep their current access. Future public RLS tables must carry the same restrictive guard before exposure to Realtime. Business data uses the signed partner API only.

No order state definitions, payment transitions, membership entitlements or existing credentials were changed. The central session cookie is only for nukhba.media; WordPress creates its own Secure/HttpOnly session. Logout and password changes are not implemented by copying cookies or passwords across domains.

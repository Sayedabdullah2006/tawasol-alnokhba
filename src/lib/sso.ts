export const FIRST1SAUDI_CALLBACK = 'https://first1saudi.net/services/auth/callback'
// Public registered application identifier, not a credential. Override only for a separately registered environment.
export const FIRST1SAUDI_CLIENT_ID = '22885502-0f8f-48e1-9fe4-c21e969a6ab9'
export const SSO_SCOPES = ['openid', 'email', 'profile', 'offline_access']
export function first1SaudiClientId() {
  const id = process.env.FIRST1SAUDI_OIDC_CLIENT_ID ?? FIRST1SAUDI_CLIENT_ID
  if (!id || !/^[a-f0-9-]{36}$/i.test(id)) throw Error('SSO_NOT_CONFIGURED')
  return id
}
export function authorizationId(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) throw Error('INVALID_AUTHORIZATION')
  return value
}
export function safeSsoRedirect(value: string) {
  const url = new URL(value)
  if (url.origin + url.pathname !== FIRST1SAUDI_CALLBACK || url.username || url.password || url.hash) throw Error('INVALID_REDIRECT')
  return url.href
}
export function validConsentDetails(details: { client: { id: string }; redirect_uri: string; scope: string }) {
  if (details.client.id !== first1SaudiClientId() || details.redirect_uri !== FIRST1SAUDI_CALLBACK ||
    !details.scope.split(' ').filter(Boolean).every(scope => SSO_SCOPES.includes(scope))) throw Error('INVALID_CLIENT')
}
export function validSsoOrigin(request: Request) {
  const origin = process.env.SSO_UI_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nukhba.media'
  return request.headers.get('origin') === new URL(origin).origin
}

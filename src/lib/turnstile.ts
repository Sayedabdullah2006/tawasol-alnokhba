// Cloudflare Turnstile helpers. The widget only renders when
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; server verification only runs
// when TURNSTILE_SECRET_KEY is set. Leaving both unset (local dev) makes
// the captcha a no-op end to end.
import {AUTH_ORIGIN} from './auth-origin'

export function turnstileEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
}

// Server-side token verification against Cloudflare.
// Unconfigured development without a widget can stay unblocked. Production and
// partially-configured widgets always fail closed.
export async function verifyTurnstileToken(token: string | undefined, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return process.env.NODE_ENV!=='production'&&!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  if (!token) return false

  const body = new URLSearchParams({ secret, response: token })
  if (ip) body.set('remoteip', ip)

  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal:AbortSignal.timeout(10000),
    })
    const data = await r.json().catch(() => ({}))
    if(data?.success!==true)return false
    if(process.env.NODE_ENV==='production'){
      const host=new URL(AUTH_ORIGIN).hostname
      if(typeof data.hostname!=='string'||data.hostname.replace(/^www\./,'')!==host)return false
    }
    return true
  } catch {
    console.warn('TURNSTILE_VERIFY_UNAVAILABLE')
    return false
  }
}

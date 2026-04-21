// Cloudflare Turnstile helpers. The widget only renders when
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; server verification only runs
// when TURNSTILE_SECRET_KEY is set. Leaving both unset (local dev) makes
// the captcha a no-op end to end.

export function turnstileEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
}

// Server-side token verification against Cloudflare.
// Returns true when verification succeeds OR the secret isn't configured
// (so local dev stays unblocked).
export async function verifyTurnstileToken(token: string | undefined, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true
  if (!token) return false

  const body = new URLSearchParams({ secret, response: token })
  if (ip) body.set('remoteip', ip)

  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    })
    const data = await r.json().catch(() => ({}))
    return Boolean(data?.success)
  } catch (err) {
    console.error('Turnstile verify error:', err)
    return false
  }
}

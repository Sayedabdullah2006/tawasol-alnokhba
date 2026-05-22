/**
 * Tamara Payment Gateway — client-safe helpers (no secrets)
 * Secrets live only in tamara-server.ts
 */

export const TAMARA_API_SANDBOX = 'https://api-sandbox.tamara.co'
export const TAMARA_API_LIVE    = 'https://api.tamara.co'

export const TAMARA_API_URL =
  process.env.NODE_ENV === 'production' ? TAMARA_API_LIVE : TAMARA_API_SANDBOX

/** Redirect URLs sent to Tamara during checkout creation */
export function getTamaraCallbackUrls(requestId: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nukhba.media'
  return {
    success:  `${base}/payment/tamara/callback?status=approved&requestId=${requestId}`,
    failure:  `${base}/payment/tamara/callback?status=failed&requestId=${requestId}`,
    cancel:   `${base}/payment/tamara/callback?status=cancelled&requestId=${requestId}`,
  }
}

/**
 * Normalize a Saudi phone number to 9 digits (no country code).
 * Tamara expects: 501234567
 */
export function normalizeSaudiPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('966')) return digits.slice(3)
  if (digits.startsWith('0'))   return digits.slice(1)
  return digits
}

/**
 * Split a full Arabic name into first/last for Tamara's consumer object.
 * e.g. "محمد عبدالله" → { first: "محمد", last: "عبدالله" }
 */
export function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { first: parts[0], last: parts[0] }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

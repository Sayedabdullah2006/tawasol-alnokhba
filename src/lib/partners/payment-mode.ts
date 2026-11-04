import { PartnerError, validateSandboxClient, type PartnerClient } from './auth'
export type PartnerPaymentMode = 'sandbox' | 'live'
export function partnerPaymentMode(client?: PartnerClient): PartnerPaymentMode {
  const mode = process.env.PARTNER_PAYMENT_MODE
  if (mode !== 'sandbox' && mode !== 'live') throw new PartnerError('PARTNER_PAYMENTS_DISABLED', 503)
  if (client) validateSandboxClient(client)
  if (client?.sandbox_only === true) {
    if (client.notifications !== false || client.auto_studio !== false || !client.expires_at || !Number.isFinite(Date.parse(client.expires_at)) || Date.parse(client.expires_at) <= Date.now()) throw new PartnerError('SANDBOX_PARTNER_NOT_CONFIGURED', 503)
    return 'sandbox'
  }
  return mode
}
export function partnerGateway(mode: PartnerPaymentMode) {
  if (mode !== 'sandbox' && mode !== 'live') throw new PartnerError('PAYMENT_MODE_NOT_CONFIGURED', 503)
  const secret = mode === 'sandbox' ? process.env.PARTNER_MOYASAR_TEST_SECRET_KEY : process.env.MOYASAR_SECRET_KEY
  const publishable = mode === 'sandbox' ? process.env.PARTNER_MOYASAR_TEST_PUBLISHABLE_KEY : process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY
  const suffix = mode === 'sandbox' ? 'test_' : 'live_'
  if (!secret?.startsWith(`sk_${suffix}`) || !publishable?.startsWith(`pk_${suffix}`)) throw new PartnerError('PAYMENT_MODE_NOT_CONFIGURED', 503)
  return { secret, publishable, authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}` }
}

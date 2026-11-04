import { createServiceRoleClient } from '@/lib/supabase-server'
import { configuredClients } from './auth'

/** Keep central notifications, but return partner customers to their own authenticated portal. */
export async function partnerFollowUpHtml(html: string, requestId?: string) {
  if (!requestId) return html
  const db = await createServiceRoleClient()
  const { data } = await db.from('publish_requests').select('partner_id').eq('id', requestId).single()
  if (!data?.partner_id) return html
  const client = configuredClients().find(c => c.id === data.partner_id)
  if (!client) return html
  const url = new URL(client.return_url)
  if (url.protocol !== 'https:') return html
  url.searchParams.set('order_id', requestId)
  const safe = url.toString().replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
  const ownOrigin = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nukhba.media').origin
  return html.replace(/href="(https?:\/\/[^\"]+)"/g, (match, href: string) => {
    try { const target = new URL(href); return target.origin === ownOrigin && target.pathname.startsWith('/dashboard') ? `href="${safe}"` : match } catch { return match }
  })
}

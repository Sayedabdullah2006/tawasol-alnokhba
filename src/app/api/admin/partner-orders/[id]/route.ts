import { partnerAdmin } from '@/lib/partners/admin'
import { PartnerError, text, uuid } from '@/lib/partners/auth'
import { partnerMedia } from '@/lib/partners/media'

async function handle(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const db = await partnerAdmin(); const { id } = await ctx.params; uuid(id)
    const { data: order } = await db.from('publish_requests').select('id,partner_id,source_site,external_customer_id,package_snapshot,partner_deliverables').eq('id', id).single()
    if (!order) throw new PartnerError('ORDER_NOT_FOUND', 404)
    if (request.method === 'POST') {
      const body = await request.json()
      if (!Array.isArray(body.deliverables) || body.deliverables.length > 100) throw new PartnerError('INVALID_DELIVERABLES')
      const deliverables = body.deliverables.map((item: Record<string, unknown>) => {
        const label = text(item.label, 500); const status = text(item.status, 20); const url = text(item.url, 2048, false)
        if (!['pending','in_progress','completed'].includes(status)) throw new PartnerError('INVALID_STATUS')
        if (url && new URL(url).protocol !== 'https:') throw new PartnerError('INVALID_URL')
        return { label, status, url }
      })
      const { error } = await db.from('publish_requests').update({ partner_deliverables: deliverables, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw new PartnerError('UPDATE_FAILED', 503)
      return Response.json({ success: true })
    }
    const { data: files, error: fileError } = await db.from('partner_files').select('id,path,name,mime_type,size').eq('request_id', id).eq('completed', true)
    if (fileError) throw new PartnerError('FILES_UNAVAILABLE', 503)
    const visibleFiles = await Promise.all((files ?? []).map(async file => {
      const media = partnerMedia(file.name)
      let preview_url: string | null = null
      if (media.purpose === 'news' && ['image/jpeg','image/png','image/webp'].includes(file.mime_type)) {
        const { data: signed, error } = await db.storage.from('partner-files').createSignedUrl(file.path, 300)
        if (error || !signed) throw new PartnerError('FILES_UNAVAILABLE', 503)
        preview_url = signed.signedUrl
      }
      return { id: file.id, name: media.name, purpose: media.purpose, mime_type: file.mime_type, size: file.size, preview_url }
    }))
    const { data: payments } = await db.from('partner_checkout_sessions').select('id,status,amount,provider_payment_id,created_at').eq('request_id', id).order('created_at', { ascending: false })
    const { data: receipts } = await db.from('partner_payment_receipts').select('payment_id,status,amount,created_at').eq('request_id', id)
    return Response.json({ ...order, files: visibleFiles, payments: [...(payments ?? []), ...(receipts ?? []).map(r => ({ ...r, id: r.payment_id }))] }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return Response.json({ error: error instanceof PartnerError ? error.code : 'ADMIN_ERROR' }, { status: error instanceof PartnerError ? error.status : 500 })
  }
}
export { handle as GET, handle as POST }

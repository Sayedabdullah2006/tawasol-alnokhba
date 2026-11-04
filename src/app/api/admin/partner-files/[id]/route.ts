import { partnerAdmin } from '@/lib/partners/admin'
import { PartnerError, uuid } from '@/lib/partners/auth'
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const db = await partnerAdmin(); const { id } = await ctx.params
    const { data: file } = await db.from('partner_files').select('path').eq('id', uuid(id)).eq('completed', true).single()
    if (!file) throw new PartnerError('FILE_NOT_FOUND', 404)
    const { data, error } = await db.storage.from('partner-files').createSignedUrl(file.path, 60, { download: true })
    if (error || !data) throw new PartnerError('FILE_UNAVAILABLE', 503)
    return Response.redirect(data.signedUrl, 303)
  } catch (error) {
    return Response.json({ error: error instanceof PartnerError ? error.code : 'FILE_UNAVAILABLE' }, { status: error instanceof PartnerError ? error.status : 500 })
  }
}

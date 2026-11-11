import { partnerAdmin } from '@/lib/partners/admin'
import { PartnerError, uuid } from '@/lib/partners/auth'
import { isPartnerStudioImage } from '@/lib/partners/studio-media'

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const db = await partnerAdmin(); const { id } = await ctx.params
    const preview = new URL(request.url).searchParams.get('preview') === '1'
    const { data: file } = await db.from('partner_files').select('path,name,mime_type').eq('id', uuid(id)).eq('completed', true).single()
    if (!file || (preview && !isPartnerStudioImage(file))) throw new PartnerError('FILE_NOT_FOUND', 404)
    const { data, error } = await db.storage.from('partner-files').createSignedUrl(file.path, 60, preview ? undefined : { download: true })
    if (error || !data) throw new PartnerError('FILE_UNAVAILABLE', 503)
    return new Response(null, { status: 303, headers: { Location: data.signedUrl, 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return Response.json({ error: error instanceof PartnerError ? error.code : 'FILE_UNAVAILABLE' }, { status: error instanceof PartnerError ? error.status : 500 })
  }
}

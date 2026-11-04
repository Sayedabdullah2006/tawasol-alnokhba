import { authenticatePartner, PartnerError } from '@/lib/partners/auth'
import { partnerOperation } from '@/lib/partners/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const trace = crypto.randomUUID()
  try {
    const ctx = await authenticatePartner(request)
    const { path } = await context.params
    const data = await partnerOperation(request, ctx, path)
    return Response.json({ data, trace_id: trace }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const known = error instanceof PartnerError
    if (!known) console.error('[PARTNER_API]', trace, error)
    return Response.json({ error: { code: known ? error.code : 'INTERNAL_ERROR' }, trace_id: trace }, {
      status: known ? error.status : 500, headers: { 'Cache-Control': 'no-store', ...(known && error.status === 429 ? { 'Retry-After': '60' } : {}) },
    })
  }
}
export { handle as GET, handle as POST }

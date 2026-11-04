import {CatalogError} from '@/lib/catalog/model'
import { authenticatePartner, PartnerError } from '@/lib/partners/auth'
import { partnerOperation } from '@/lib/partners/service'
import { partnerInvoice } from '@/lib/partners/invoice'
import { enrichPartnerOrderStates, readPartnerOrderState } from '@/lib/partners/status'
import { partnerStatusDefinitions } from '@/lib/partners/status-view'
import { partnerIdentity } from '@/lib/partners/identity'
import { partnerHistory } from '@/lib/partners/history'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const trace = crypto.randomUUID()
  try {
    const ctx = await authenticatePartner(request)
    const { path } = await context.params
    if (request.method === 'GET' && path.length === 3 && path[0] === 'orders' && path[2] === 'invoice') {
      return await partnerInvoice(ctx, path[1], trace)
    }
    if (request.method === 'POST' && path.length === 2 && path[0] === 'identity' && ['orders','order','invoice'].includes(path[1])) {
      const result = await partnerHistory(request,ctx,path[1],trace)
      if (result instanceof Response) return result
      return Response.json({data:result,trace_id:trace},{headers:{'Cache-Control':'private, no-store, max-age=0'}})
    }
    let data
    if (request.method === 'POST' && path.length === 2 && path[0] === 'identity') {
      data = await partnerIdentity(ctx, path[1])
    } else if (request.method === 'GET' && path.length === 3 && path[0] === 'orders' && path[2] === 'state') {
      data = await readPartnerOrderState(ctx, path[1])
    } else {
      const result = await partnerOperation(request, ctx, path)
      if (request.method === 'GET' && path.length === 1 && path[0] === 'catalog') {
        data = { ...result, status_definitions: partnerStatusDefinitions() }
      } else if (request.method === 'GET' && path.length === 1 && path[0] === 'orders' && 'orders' in result) {
        data = { ...result, orders: await enrichPartnerOrderStates(result.orders as Record<string, unknown>[], ctx) }
      } else if (request.method === 'GET' && path.length === 2 && path[0] === 'orders') {
        data = (await enrichPartnerOrderStates([result as Record<string, unknown>], ctx))[0]
      } else data = result
    }
    return Response.json({ data, trace_id: trace }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const known = error instanceof PartnerError || error instanceof CatalogError
    if (!known) console.error('[PARTNER_API]', trace, error)
    return Response.json({ error: { code: known ? error.code : 'INTERNAL_ERROR' }, trace_id: trace }, {
      status: known ? error.status : 500, headers: { 'Cache-Control': 'no-store', ...(known && error.status === 429 ? { 'Retry-After': '60' } : {}) },
    })
  }
}
export { handle as GET, handle as POST }

import { createServiceRoleClient } from '@/lib/supabase-server'
import { ensureServiceInvoice } from '@/lib/service-invoice'
import { PartnerError, uuid, type PartnerContext } from './auth'
import { partnerIdentity } from './identity'
import { enrichPartnerOrderStates } from './status'
import { partnerData } from './data'
import { sandboxInvoice } from './sandbox-invoice'

const FIELDS = 'id,user_id,partner_id,external_customer_id,request_number,category,title,content,channels,status,payment_status,final_total,admin_quoted_price,package_snapshot,created_at,updated_at,proposed_content,proposed_images,post_reviews,content_sent_at,content_approved_at,user_feedback,admin_info_request,partner_deliverables,refund_amount,refund_timing,paid_at,billing_source'
const PUBLIC = ['id','request_number','category','title','content','channels','status','payment_status','created_at','updated_at','content_sent_at','content_approved_at','refund_timing','paid_at']

/** Read existing rows only. A verified OAuth subject AND its immutable local binding are required. */
export async function partnerHistory(request: Request, ctx: PartnerContext, action: string, trace: string) {
  if (request.method !== 'POST' || ctx.client.id !== 'awwal-saudi' || ctx.client.sandbox_only === true) throw new PartnerError('IDENTITY_CLIENT_NOT_ALLOWED',403)
  if (!['orders','order','invoice'].includes(action)) throw new PartnerError('NOT_FOUND',404)
  const query = new URL(request.url).searchParams
  const allowed = action === 'orders' ? ['page'] : ['order_id']
  if ([...query.keys()].some(k => !allowed.includes(k)) || [...query.keys()].some(k => query.getAll(k).length !== 1)) throw new PartnerError('INVALID_INPUT')
  const identity = await partnerIdentity(ctx,'session')
  if (!('subject' in identity) || !identity.link || identity.link.external_customer_id !== ctx.customer) throw new PartnerError('IDENTITY_LINK_CONFLICT',409)
  const subject = uuid(identity.subject)
  const acceptance = historyAcceptanceSubject(subject)
  const db = acceptance ? await partnerData(true) : await createServiceRoleClient()
  const statusContext = acceptance ? {...ctx,client:{...ctx.client,sandbox_only:true}} : ctx
  // Include native Tawasol orders and this exact FirstSaudi customer only. Never another partner lane.
  // UUID and signed customer are validated before being used in PostgREST filter syntax.
  if (!/^[a-zA-Z0-9_.:@-]{1,128}$/.test(ctx.customer)) throw new PartnerError('INVALID_CUSTOMER')
  const owned = () => db.from('publish_requests').select(FIELDS).eq('user_id',subject)
    .or(`partner_id.is.null,and(partner_id.eq.awwal-saudi,external_customer_id.eq.${ctx.customer})`)
  if (action === 'orders') {
    const raw = query.get('page') ?? '0'
    if (!/^\d{1,5}$/.test(raw) || Number(raw) > 10000) throw new PartnerError('INVALID_PAGE')
    const page = Number(raw)
    // One query means no union duplicates; the ID tie-breaker keeps pagination deterministic.
    const result = await owned().order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*20,page*20+19)
    if (result.error) throw new PartnerError('HISTORY_UNAVAILABLE',503)
    const orders = await enrichPartnerOrderStates((result.data ?? []).map(expose),statusContext)
    return { orders, page, history_included:true, ...(acceptance?{document_environment:'sandbox'}:{}) }
  }
  const id = uuid(query.get('order_id'))
  const result = await owned().eq('id',id).maybeSingle()
  if (result.error) throw new PartnerError('HISTORY_UNAVAILABLE',503)
  if (!result.data) throw new PartnerError('ORDER_NOT_FOUND',404)
  const order = result.data
  if (action === 'invoice') {
    const paid = order.payment_status === 'paid' || (Boolean(order.paid_at) && (['partially_refunded','refunded','refund_pending'].includes(order.payment_status) || ['refund_pending','refunded'].includes(order.status)))
    if (order.billing_source === 'membership' || !paid || Number(order.final_total ?? order.admin_quoted_price) <= 0) throw new PartnerError('INVOICE_NOT_AVAILABLE',409)
    let invoice
    try { invoice = acceptance ? await sandboxInvoice(order) : await ensureServiceInvoice(id) } catch { throw new PartnerError('INVOICE_UNAVAILABLE',503) }
    const filename = /^[a-zA-Z0-9_-]+\.pdf$/.test(invoice.filename) ? invoice.filename : `invoice-${id}.pdf`
    return new Response(new Uint8Array(invoice.pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','X-Trace-ID':trace,'X-Document-Environment':acceptance?'sandbox':'live'}})
  }
  return (await enrichPartnerOrderStates([expose(order)],statusContext))[0]
}

/** Two disposable operator-designated subjects only, <=2h. Never a browser-selectable mode. */
export function historyAcceptanceSubject(subject: string): boolean {
  const raw=process.env.PARTNER_HISTORY_ACCEPTANCE_JSON
  if(!raw||raw.length>1024)return false
  try{
    const value=JSON.parse(raw),expires=Date.parse(value.expires_at)
    return Array.isArray(value.subjects)&&value.subjects.length===2&&new Set(value.subjects).size===2&&
      value.subjects.every((id:unknown)=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))&&
      Number.isFinite(expires)&&expires>Date.now()&&expires<=Date.now()+7200000&&value.subjects.includes(subject)
  }catch{return false}
}

function expose(row: Record<string, unknown>) {
  const native = row.partner_id == null
  const safe = Object.fromEntries(PUBLIC.map(key => [key,row[key] ?? null]))
  const snapshot = row.package_snapshot as {package?:{id?:unknown;name?:unknown;features?:unknown}} | null
  const reviews = row.post_reviews as Record<string,{proposed_content?:unknown;proposed_images?:unknown;content_sent_at?:unknown}> | null
  const review = reviews?.[0]
  const total = row.final_total ?? row.admin_quoted_price
  return { ...safe, amount:total == null ? null : Math.round(Number(total)*100), refund_amount:row.refund_amount == null ? null : Math.round(Number(row.refund_amount)*100),
    package_snapshot:snapshot?.package ? {package:{id:snapshot.package.id,name:snapshot.package.name,features:snapshot.package.features ?? []}} : null,
    proposed_content:review?.proposed_content ?? row.proposed_content ?? null, proposed_images:review?.proposed_images ?? row.proposed_images ?? [],
    content_sent_at:review?.content_sent_at ?? row.content_sent_at ?? null, partner_deliverables:row.partner_deliverables ?? [],
    source:native?'nukhba':'first1saudi', read_only:native, invoice_available:row.billing_source !== 'membership',
    central_url:native?`https://nukhba.media/dashboard/${row.id}`:null }
}

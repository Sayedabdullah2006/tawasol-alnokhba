import { resolveAvailableExtras } from '@/lib/manual-quote-extras'
import { calculateReach, EXTRAS_REACH_BOOST } from '@/lib/pricing-engine'
import { PartnerError, parseBody, sha256, text, type PartnerContext } from './auth'
import { partnerData } from './data'

type Row = Record<string, unknown>
const cents = (value: unknown) => Math.round(Number(value) * 100)
async function offerDetails(ctx: PartnerContext, order: Row) {
  const db = await partnerData(ctx.client)
  const map = await resolveAvailableExtras(db, order)
  const offered = Array.from(map.values()).map(e => {
    if (!e.id || !Number.isFinite(Number(e.price)) || Number(e.price) < 0) throw new PartnerError('OFFER_UNAVAILABLE',503)
    return { ...e, price: Number(e.price) }
  })
  const revision = sha256(JSON.stringify([order.updated_at,order.status,order.admin_quoted_price,order.quote_expires_at,order.discount_code,order.discount_pct,order.discount_amount,order.user_selected_extras,offered]))
  const rows = db.from('publish_requests').select('negotiation_round').gte('negotiation_requested_at',new Date(Date.now()-30*86400000).toISOString())
  const quota = order.user_id ? await rows.eq('user_id',order.user_id) : await rows.eq('partner_id',ctx.client.id).eq('external_customer_id',ctx.customer)
  if (quota.error) throw new PartnerError('OFFER_UNAVAILABLE',503)
  const used = (quota.data ?? []).reduce((sum,r)=>sum+Number(r.negotiation_round ?? 0),0)
  return { offered, revision, negotiation: { round: Number(order.negotiation_round ?? 0), max_rounds: 3, monthly_used: used, monthly_limit: 3, monthly_remaining: Math.max(0,3-used), final: !!order.negotiation_rejected } }
}
export async function partnerOffer(request: Request, ctx: PartnerContext, order: Row) {
  if (!['business','government'].includes(String(order.client_type))) throw new PartnerError('OFFER_NOT_AVAILABLE',409)
  const db = await partnerData(ctx.client)
  const body = request.method === 'POST' ? parseBody(ctx) : null
  const fingerprint = body ? sha256(JSON.stringify({ order_id: order.id, body })) : null
  if (body) {
    if (Object.keys(body).some(k=>!['action','offer_revision','selected_extras','discount_code','reason','proposed_amount'].includes(k))) throw new PartnerError('INVALID_OFFER_ACTION')
    const replay = await db.from('partner_order_actions').select('customer_id,request_id,fingerprint,response').eq('partner_id',ctx.client.id).eq('idempotency_key',ctx.idempotencyKey).maybeSingle()
    if (replay.error) throw new PartnerError('OFFER_UNAVAILABLE',503)
    if (replay.data) {
      if (replay.data.customer_id !== ctx.customer || replay.data.request_id !== order.id || replay.data.fingerprint !== fingerprint) throw new PartnerError('IDEMPOTENCY_CONFLICT',409)
      return replay.data.response
    }
  }
  const available = ['quoted','approved'].includes(String(order.status)) && order.admin_quoted_price != null
  if (!available) {
    if (body) throw new PartnerError('OFFER_NOT_AVAILABLE',409)
    return { available:false, pricing_mode:'manual', amount:order.final_total == null ? null : cents(order.final_total), offer_revision:null }
  }
  const details = await offerDetails(ctx,order)
  const expired = order.status === 'quoted' && !!order.quote_expires_at && Date.parse(String(order.quote_expires_at))<=Date.now()
  if (!body) return { available:true, offer_revision:details.revision, base_amount:cents(order.admin_quoted_price), amount:order.final_total == null ? null : cents(order.final_total), expires_at:order.quote_expires_at, expired,
    offered_extras:details.offered.map(e=>({id:e.id,name:e.name,price:cents(e.price)})), selected_extras:order.user_selected_extras ?? [], negotiation:details.negotiation, currency:'SAR', money_unit:'halala' }
  const action=text(body.action,20)
  if (!['preview','accept','reject','negotiate'].includes(action)) throw new PartnerError('INVALID_OFFER_ACTION')
  if (text(body.offer_revision,64) !== details.revision) throw new PartnerError('OFFER_CHANGED',409)
  if (expired) throw new PartnerError('OFFER_EXPIRED',409)
  const selected = body.selected_extras ?? []
  if (!Array.isArray(selected) || selected.length>20 || new Set(selected).size!==selected.length || selected.some(id=>typeof id!=='string'||!details.offered.some(e=>e.id===id))) throw new PartnerError('INVALID_EXTRAS')
  const extras = details.offered.filter(e=>selected.includes(e.id))
  const subtotal=cents(order.admin_quoted_price)+extras.reduce((sum,e)=>sum+cents(e.price),0)
  const code = text(body.discount_code ?? order.discount_code ?? '',64,false).toUpperCase()
  if (order.discount_code && code !== order.discount_code) throw new PartnerError('DISCOUNT_UNAVAILABLE',409)
  let discount=0
  if (code) {
    const result=await db.from('discount_codes').select('*').eq('code',code).single(),row=result.data
    if (!row || row.recovery_draft_id || (order.discount_code!==code && (!row.is_active || Date.parse(row.expires_at)<=Date.now() || (row.max_uses!==null && row.used_count>=row.max_uses)))) throw new PartnerError('DISCOUNT_UNAVAILABLE',409)
    discount=Math.min(Math.round(subtotal*Number(row.discount_pct)/10000)*100,row.max_discount_amount==null?Infinity:cents(row.max_discount_amount))
  }
  const amount=subtotal-discount
  if (action==='preview') return { offer_revision:details.revision,base_amount:cents(order.admin_quoted_price),extras_amount:subtotal-cents(order.admin_quoted_price),discount_amount:discount,amount,currency:'SAR',money_unit:'halala',selected_extras:selected,discount_code:code||null }
  let reason=''
  if (['reject','negotiate'].includes(action)) { reason=text(body.reason,1000); if(reason.length<10)throw new PartnerError('INVALID_REASON') }
  const proposed=body.proposed_amount ?? null
  if (proposed!==null && (!Number.isSafeInteger(proposed)||Number(proposed)<0||Number(proposed)>cents(order.admin_quoted_price))) throw new PartnerError('INVALID_PROPOSED_AMOUNT')
  const {data:pub}=await db.from('influencers').select('*').eq('id',order.influencer_id).single()
  const reach=calculateReach({influencer:pub ?? {},scope:order.scope==='all'?'all':'single',extras:selected}) || Math.round(Number(order.estimated_reach ?? 0)*(1+selected.reduce((sum:number,id:string)=>sum+(EXTRAS_REACH_BOOST[id]??0),0)))
  const result=await db.rpc('partner_offer_action',{p_partner:ctx.client.id,p_customer:ctx.customer,p_request:order.id,p_key:ctx.idempotencyKey,p_fingerprint:fingerprint,p_updated:order.updated_at,p_action:action,p_selected:selected,p_offered:details.offered,p_discount:code||null,p_reason:reason,p_proposed:proposed,p_reach:reach})
  if(result.error){const known=['OFFER_CHANGED','OFFER_EXPIRED','OFFER_NOT_AVAILABLE','CHECKOUT_ACTIVE','DISCOUNT_UNAVAILABLE','IDEMPOTENCY_CONFLICT','NEGOTIATION_LIMIT','ORDER_NOT_FOUND'];const code=known.find(c=>result.error!.message.includes(c));throw new PartnerError(code??'OFFER_UNAVAILABLE',code?409:503)}
  const data=result.data
  if (!data.replayed && ctx.client.notifications!==false) {
    const mail=await import('@/lib/email'),base={email:String(order.client_email ?? ''),clientName:String(order.client_name ?? 'عزيزنا العميل'),requestNumber:`ATH-${String(order.request_number).padStart(4,'0')}`}
    // Read the private contact only after ownership; it is not included in public offer data.
    const contact=await db.from('publish_requests').select('client_email,client_name').eq('id',order.id).single()
    base.email=contact.data?.client_email??'';base.clientName=contact.data?.client_name??base.clientName
    if(base.email){if(action==='accept'){if(data.amount<=0)await mail.notifyFreeApprovedToClient(base).catch(()=>undefined);else await mail.notifyQuoteApprovedAwaitingPaymentToClient({...base,total:data.amount/100}).catch(()=>undefined)}
      else if(action==='reject')await mail.notifyQuoteRejectionToClient(base).catch(()=>undefined)
      else await mail.notifyNegotiatedQuoteToClient({...base,originalPrice:data.original_amount/100,newPrice:data.amount/100,discountPercentage:data.discount_pct,adminMessage:'',priceSource:'admin_discount'}).catch(()=>undefined)}
  }
  return data
}

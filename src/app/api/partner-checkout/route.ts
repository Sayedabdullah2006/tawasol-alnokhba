import {PARTNER_BANK,tamaraAvailable,startPartnerTamara,submitPartnerReceipt,settlePartnerTamara} from '@/lib/partners/checkout-methods'
import { partnerGateway, type PartnerPaymentMode } from '@/lib/partners/payment-mode'
import { cookies } from 'next/headers'
import { checkoutOrigin, checkoutSession, settlePartnerPayment } from '@/lib/partners/checkout'
import { PartnerError, text } from '@/lib/partners/auth'
import { partnerData } from '@/lib/partners/data'

export const dynamic = 'force-dynamic'
async function handle(request: Request) {
  try {
    if(request.method==='POST'&&request.headers.get('origin')!==checkoutOrigin())throw new PartnerError('FORBIDDEN',403)
    if(Number(request.headers.get('content-length')||0)>11000000)throw new PartnerError('INVALID_RECEIPT',413)
    const jar = await cookies()
    const sessionId = new URL(request.url).searchParams.get('session') ?? ''
    if (!/^[a-f0-9-]{36}$/.test(sessionId)) throw new PartnerError('INVALID_CHECKOUT', 401)
    const session = await checkoutSession(jar.get(`partner_checkout_${sessionId}`)?.value ?? '', request.method === 'POST')
    if(session.id!==sessionId)throw new PartnerError('INVALID_CHECKOUT',401)
    const db = await partnerData(session.sandbox)
    const { data: order } = await db.from('publish_requests').select('id,request_number,title,status,payment_status,final_total,package_snapshot').eq('id', session.request_id).single()
    if (!order) throw new PartnerError('ORDER_NOT_FOUND', 404)
    if (request.method === 'POST') {
      if (request.headers.get('origin') !== checkoutOrigin()) throw new PartnerError('FORBIDDEN', 403)
      if (Date.now() - Date.parse(session.created_at) > 86400000) throw new PartnerError('CHECKOUT_EXPIRED', 410)
      const action=new URL(request.url).searchParams.get('action')
      if(action==='bank'){const form=await request.formData(),file=form.get('receipt');if(!(file instanceof File))throw new PartnerError('INVALID_RECEIPT',400);return Response.json(await submitPartnerReceipt(session,file),{headers:{'Cache-Control':'private, no-store'}})}
      if(action==='tamara')return Response.json(await startPartnerTamara(session),{headers:{'Cache-Control':'private, no-store'}})
      if(action==='tamara-verify')return Response.json({...await settlePartnerTamara(session),return_url:session.return_url},{headers:{'Cache-Control':'private, no-store'}})
      if(action)throw new PartnerError('INVALID_ACTION',400)
      const body = await request.json()
      const result = await settlePartnerPayment(text(body.payment_id, 128), session.id)
      return Response.json({ ...result, return_url: session.return_url }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    return Response.json({ order_id: order.id, request_number: order.request_number, title: order.title, package_name: order.package_snapshot?.package?.name,
      amount: session.amount, currency: session.currency, status: order.payment_status === 'paid' ? 'paid' : order.status === 'payment_review' ? 'payment_review' : order.status === 'approved'&&Math.round(Number(order.final_total)*100)===session.amount ? 'payable' : 'unavailable',
      publishable_key: partnerGateway(session.payment_mode as PartnerPaymentMode).publishable, payment_mode: session.payment_mode,
      methods:['card','bank',...(tamaraAvailable(session)?['tamara']:[])],bank:PARTNER_BANK,selected_method:session.method_details?.method??'card',
      return_url: session.return_url, expires_at: session.expires_at,
      metadata: { resource_type: 'partner_order', request_id: order.id, partner_checkout_id: session.id },
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const known = error instanceof PartnerError
    return Response.json({ error: known ? error.code : 'CHECKOUT_UNAVAILABLE' }, { status: known ? error.status : 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
export { handle as GET, handle as POST }

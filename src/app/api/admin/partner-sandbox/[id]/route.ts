import {partnerAdmin} from '@/lib/partners/admin'
import {PartnerError,uuid,configuredClients,validateSandboxClient} from '@/lib/partners/auth'
import {checkoutOrigin} from '@/lib/partners/checkout'
import {bankConfirmationFields} from '@/lib/bank-confirmation'
export const dynamic='force-dynamic'
async function handle(request:Request,ctx:{params:Promise<{id:string}>}){
 const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}
 try{
  if(request.method==='POST'&&request.headers.get('origin')!==checkoutOrigin())throw new PartnerError('FORBIDDEN',403)
  const db=await partnerAdmin(),{id}=await ctx.params;uuid(id)
  // This endpoint never reads or updates the production order tables.
  const {data:order,error}=await db.from('partner_sandbox_orders').select('id,request_number,partner_id,title,status,payment_status,paid_at,receipt_url,updated_at,final_total').eq('id',id).maybeSingle()
  if(error)throw new PartnerError('SANDBOX_UNAVAILABLE',503)
  if(!order)throw new PartnerError('ORDER_NOT_FOUND',404)
  const client=configuredClients().find(c=>c.id===order.partner_id&&c.sandbox_only===true)
  if(!client)throw new PartnerError('SANDBOX_PARTNER_NOT_CONFIGURED',503)
  if(request.method==='POST'){
   validateSandboxClient(client)
   if(order.payment_status==='paid')return Response.json({applied:false,status:order.status},{headers})
   if(order.status!=='payment_review'||!order.receipt_url?.startsWith('partner/'+id+'/'))throw new PartnerError('RECEIPT_REQUIRED',409)
   const stored=await db.storage.from('partner-sandbox-files').info(order.receipt_url)
   if(stored.error||!stored.data)throw new PartnerError('RECEIPT_UNAVAILABLE',409)
   const now=new Date().toISOString(),update=await db.from('partner_sandbox_orders').update({status:'in_progress',...bankConfirmationFields(now),updated_at:now,last_status_change:now}).eq('id',id).eq('status','payment_review').eq('updated_at',order.updated_at).select('id')
   if(update.error||!update.data?.length)throw new PartnerError('ORDER_CHANGED',409)
   return Response.json({applied:true,status:'in_progress',payment_status:'paid'},{headers})
  }
  let receipt_url:null|string=null
  if(order.receipt_url?.startsWith('partner/'+id+'/')){const signed=await db.storage.from('partner-sandbox-files').createSignedUrl(order.receipt_url,300);if(signed.error)throw new PartnerError('RECEIPT_UNAVAILABLE',503);receipt_url=signed.data?.signedUrl??null}
  return Response.json({...order,receipt_url,sandbox:true},{headers})
 }catch(e){return Response.json({error:e instanceof PartnerError?e.code:'SANDBOX_UNAVAILABLE'},{status:e instanceof PartnerError?e.status:503,headers})}
}
export {handle as GET,handle as POST}

import {createHash} from 'node:crypto'
import {createServiceRoleClient} from '@/lib/supabase-server'
import {PartnerError,configuredClients} from './auth'
import {partnerData} from './data'
import {checkoutOrigin,storedCheckout} from './checkout'
import {normalizeSaudiPhone,splitName,TAMARA_API_LIVE,TAMARA_API_SANDBOX} from '@/lib/tamara'

import {BANK_INFO} from '@/lib/bank-info'
export const PARTNER_BANK=BANK_INFO
type Session=Awaited<ReturnType<typeof storedCheckout>>
export async function methodAction(session:Session,action:string,details:Record<string,unknown>={}){
 const db=await partnerData(session.sandbox)
 const {data,error}=await db.rpc('partner_checkout_method',{p_session:session.id,p_action:action,p_details:details})
 if(error){const code=['CHECKOUT_EXPIRED','ORDER_NOT_PAYABLE','PAYMENT_METHOD_LOCKED','PAYMENT_CREATION_PENDING','RECEIPT_CHANGED','PAYMENT_METHOD_UNAVAILABLE'].find(c=>error.message.includes(c));throw new PartnerError(code??'CHECKOUT_UNAVAILABLE',code?409:503)}
 return data
}
export async function notifyPartnerPaid(session:Session){
 const db=await partnerData(session.sandbox)
 const {data:o}=await db.from('publish_requests').select('client_email,client_name,request_number,final_total,partner_id').eq('id',session.request_id).single()
 const partner=configuredClients().find(p=>p.id===o?.partner_id)
 if(session.payment_mode!=='live')return
 if(o?.client_email&&partner?.notifications!==false){const mail=await import('@/lib/email');await mail.notifyPaymentConfirmedToClient({requestId:session.request_id,email:o.client_email,clientName:o.client_name,requestNumber:String(o.request_number),total:Number(o.final_total)}).catch(()=>undefined)}
 if(partner?.auto_studio!==false)void import('@/lib/auto-studio').then(m=>m.autoRunRequestStudio(session.request_id)).catch(()=>undefined)
}
export async function submitPartnerReceipt(session:Session,file:File){
 if(file.size<=0||file.size>10485760||!['application/pdf','image/jpeg','image/png'].includes(file.type))throw new PartnerError('INVALID_RECEIPT',400)
 const bytes=Buffer.from(await file.arrayBuffer()),mime=file.type
 const valid=mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255
 if(!valid)throw new PartnerError('INVALID_RECEIPT',400)
 const hash=createHash('sha256').update(bytes).digest('hex'),path=`partner/${session.request_id}/${session.id}/receipt`
 await methodAction(session,'bank_reserve',{receipt_hash:hash,receipt_path:path,receipt_mime:mime,receipt_size:bytes.length})
 const db=await partnerData(session.sandbox),bucket=db.storage.from(session.sandbox?'partner-files':'receipts')
 const upload=await bucket.upload(path,bytes,{contentType:mime,upsert:false})
 if(upload.error){const existing=await bucket.download(path);if(existing.error||!existing.data||createHash('sha256').update(Buffer.from(await existing.data.arrayBuffer())).digest('hex')!==hash)throw new PartnerError('RECEIPT_UPLOAD_FAILED',503)}
 const result=await methodAction(session,'bank_complete')
 if(result.applied&&!session.sandbox){const {data:o}=await db.from('publish_requests').select('request_number,client_name,final_total,partner_id').eq('id',session.request_id).single();const partner=configuredClients().find(p=>p.id===o?.partner_id);if(o&&partner?.notifications!==false){const mail=await import('@/lib/email');await mail.notifyBankTransferReceivedToAdmin({requestNumber:String(o.request_number),clientName:o.client_name??'العميل',totalAmount:Number(o.final_total)}).catch(()=>undefined)}}
 return {received:true,status:'payment_review',return_url:session.return_url}
}
export function partnerTamaraGateway(session:Pick<Session,'sandbox'|'payment_mode'>){
 const sandbox=session.sandbox===true
 if((sandbox&&session.payment_mode!=='sandbox')||(!sandbox&&session.payment_mode!=='live'))throw new PartnerError('PAYMENT_METHOD_UNAVAILABLE',503)
 const key=sandbox?process.env.TAMARA_API_TOKEN_SANDBOX:process.env.TAMARA_API_TOKEN
 if(!key)throw new PartnerError('PAYMENT_METHOD_UNAVAILABLE',503)
 return {origin:sandbox?TAMARA_API_SANDBOX:TAMARA_API_LIVE,authorization:`Bearer ${key}`}
}
export function tamaraAvailable(session:Session){try{partnerTamaraGateway(session);return true}catch{return false}}
export async function startPartnerTamara(session:Session){
 if(!tamaraAvailable(session))throw new PartnerError('PAYMENT_METHOD_UNAVAILABLE',503)
 const claim=await methodAction(session,'tamara_claim');if(claim.tamara_url)return {checkout_url:claim.tamara_url}
 const gateway=partnerTamaraGateway(session)
 const db=await partnerData(session.sandbox),{data:o,error}=await db.from('publish_requests').select('id,request_number,client_name,client_email,client_phone,client_city').eq('id',session.request_id).single()
 if(error||!o)throw new PartnerError('CHECKOUT_UNAVAILABLE',503)
 const {first,last}=splitName(o.client_name||'عميل'),amount=session.amount/100,base=`${checkoutOrigin()}/checkout/partner/callback?session=${session.id}&provider=tamara`
 const body={order_reference_id:session.id,order_number:String(o.request_number),total_amount:{amount,currency:'SAR'},shipping_amount:{amount:0,currency:'SAR'},tax_amount:{amount:0,currency:'SAR'},description:`طلب نشر ${o.request_number}`,country_code:'SA',payment_type:'PAY_BY_INSTALMENTS',instalments:3,locale:'ar_SA',items:[{reference_id:session.id,type:'Digital',name:`طلب نشر ${o.request_number}`,sku:`SVC-${o.request_number}`,quantity:1,total_amount:{amount,currency:'SAR'}}],consumer:{first_name:first,last_name:last,phone_number:normalizeSaudiPhone(o.client_phone||''),email:o.client_email},shipping_address:{first_name:first,last_name:last,line1:'خدمة رقمية',city:o.client_city||'الرياض',country_code:'SA'},merchant_url:{success:base,failure:base,cancel:base}}
 // One durable claim: a timeout never triggers another provider creation.
 const response=await fetch(`${gateway.origin}/checkout`,{method:'POST',headers:{Authorization:gateway.authorization,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)})
 const data=await response.json();if(!response.ok)throw new PartnerError('TAMARA_UNAVAILABLE',503)
 const url=new URL(data.checkout_url)
 if(url.protocol!=='https:'||url.username||url.password||!(url.hostname==='tamara.co'||url.hostname.endsWith('.tamara.co'))||typeof data.order_id!=='string'||!data.order_id)throw new PartnerError('TAMARA_UNAVAILABLE',503)
 await methodAction(session,'tamara_finish',{tamara_id:data.order_id,tamara_url:url.href})
 return {checkout_url:url.href}
}
export async function settlePartnerTamara(session:Session){
 const provider=session.method_details?.tamara_id
 if(!provider)throw new PartnerError('PAYMENT_BINDING_MISMATCH',409)
 const gateway=partnerTamaraGateway(session)
 const response=await fetch(`${gateway.origin}/orders/${encodeURIComponent(provider)}`,{headers:{Authorization:gateway.authorization},cache:'no-store',signal:AbortSignal.timeout(15000)})
 if(!response.ok)throw new PartnerError('TAMARA_UNAVAILABLE',503)
 const detail=await response.json(),amount=Math.round(Number(detail.total_amount?.amount)*100)
 if(detail.order_reference_id!==session.id||detail.total_amount?.currency!=='SAR'||amount!==session.amount)throw new PartnerError('PAYMENT_BINDING_MISMATCH',409)
 if(!['approved','authorised','authorized','fully_captured'].includes(String(detail.status).toLowerCase()))return {paid:false,status:detail.status}
 if(String(detail.status).toLowerCase()==='approved'){
  if(session.sandbox){const authorized=await fetch(`${gateway.origin}/orders/${encodeURIComponent(provider)}/authorise`,{method:'POST',headers:{Authorization:gateway.authorization,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});if(!authorized.ok)throw new PartnerError('TAMARA_UNAVAILABLE',503)}
  else {const {authorizeTamaraOrder}=await import('@/lib/tamara-server');if(!await authorizeTamaraOrder(provider))throw new PartnerError('TAMARA_UNAVAILABLE',503)}
 }
 const db=await partnerData(session.sandbox),{data,error}=await db.rpc('partner_settle_tamara',{p_session:session.id,p_provider:provider,p_amount:amount,p_currency:'SAR'})
 if(error)throw new PartnerError('PAYMENT_RECONCILIATION_REQUIRED',409)
 if(data.applied&&!session.sandbox)await notifyPartnerPaid(session)
 return {...data,paid:!!data.paid,status:data.review_required?'review_required':data.paid?'paid':'pending'}
}
export async function partnerTamaraWebhook(provider:string,reference:string){
 const db=await createServiceRoleClient()
 const {data,error}=await db.from('partner_checkout_sessions').select('*').eq('method_details->>tamara_id',provider).maybeSingle()
 if(error)throw new PartnerError('TAMARA_UNAVAILABLE',503)
 if(data){if(reference&&reference!==data.id)throw new PartnerError('PAYMENT_BINDING_MISMATCH',409);return {handled:true,...await settlePartnerTamara({...data,sandbox:false})}}
 // Never fall through into legacy settlement for an in-flight partner reference.
 if(/^[a-f0-9-]{36}$/i.test(reference)){const pending=await db.from('partner_checkout_sessions').select('id').eq('id',reference).maybeSingle();if(pending.data)return {handled:true,paid:false}}
 return {handled:false}
}

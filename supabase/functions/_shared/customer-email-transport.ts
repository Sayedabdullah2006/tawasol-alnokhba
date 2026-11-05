import { CUSTOMER_EMAIL_BRANDS, type CustomerEmailBrandId, partnerReminderEmail } from './customer-email-brand.ts'

export function serviceMailRequest(req:Request,env:(key:string)=>string|undefined){
 const key=env('SUPABASE_SERVICE_ROLE_KEY')
 // supabase-js may attach a session token while retaining the privileged project key.
 return !!key&&(req.headers.get('authorization')==='Bearer '+key||req.headers.get('apikey')===key)
}
export function mailIdentity(brand:CustomerEmailBrandId,env:(key:string)=>string|undefined){
 const identity=CUSTOMER_EMAIL_BRANDS[brand]
 const key=(brand==='first1saudi'?env('FIRST1SAUDI_RESEND_API_KEY'):undefined)||env('Resend_Key')||env('RESEND_KEY')||env('RESEND_API_KEY')
 return {brand:identity,key,from:identity.from,replyTo:identity.supportEmail}
}
/** Request references are resolved from the database, never by matching a user's other orders. */
export async function prepareCustomerMail(payload:Record<string,unknown>,env:(key:string)=>string|undefined){
 let brand:CustomerEmailBrandId=payload.brand==='first1saudi'?'first1saudi':'nukhba'
 if(payload.requestId){
  if(typeof payload.requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(payload.requestId))throw Error('INVALID_EMAIL_ORDER')
  const response=await fetch(env('SUPABASE_URL')+'/rest/v1/publish_requests?select=id,partner_id,client_email&id=eq.'+encodeURIComponent(payload.requestId),{headers:{apikey:env('SUPABASE_SERVICE_ROLE_KEY')!,Authorization:'Bearer '+env('SUPABASE_SERVICE_ROLE_KEY')}})
  const rows=await response.json(),order=Array.isArray(rows)?rows[0]:null
  if(!response.ok||!order)throw Error('EMAIL_ORDER_CONTEXT_UNAVAILABLE')
  const recipients=Array.isArray(payload.to)?payload.to:[payload.to]
  if(recipients.length!==1||String(recipients[0]).trim().toLowerCase()!==String(order.client_email??'').trim().toLowerCase())throw Error('EMAIL_ORDER_RECIPIENT_MISMATCH')
  if(order.partner_id&&order.partner_id!=='awwal-saudi')throw Error('EMAIL_PARTNER_BRAND_UNCONFIGURED')
  brand=order.partner_id==='awwal-saudi'?'first1saudi':'nukhba'
  const content=partnerReminderEmail(String(payload.subject),String(payload.html),{brand,requestId:order.id})
  payload={...payload,...content,text:undefined}
 }
 return {...payload,brand}
}
export async function customerMailStatus(brand:CustomerEmailBrandId,env:(key:string)=>string|undefined){
 const identity=mailIdentity(brand,env)
 if(!identity.key)return {brand,from:identity.from,configured:false}
 const response=await fetch('https://api.resend.com/domains',{headers:{Authorization:'Bearer '+identity.key}})
 const body=await response.json(),host=brand==='first1saudi'?'first1saudi.net':'nukhba.media'
 const domain=body.data?.find((d:{name:string})=>d.name===host)
 return {brand,from:identity.from,replyTo:identity.replyTo,configured:true,provider_status:response.status,provider_error:typeof body.name==='string'?body.name:null,domain:host,verified:response.ok?domain?.status==='verified':null,domain_status:domain?.status??null}
}

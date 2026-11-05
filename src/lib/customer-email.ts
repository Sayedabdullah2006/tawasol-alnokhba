import { createServiceRoleClient } from './supabase-server'
import { configuredClients } from './partners/auth'
import { type CustomerEmailContext } from './email-brand'

export type CustomerMailReference={ email?: string; clientEmail?: string; requestId?: string; requestNumber?: string }
/** Resolve per order, never per email/account: one person can have orders from both sites. */
export async function customerEmailContext(reference:CustomerMailReference):Promise<CustomerEmailContext|null>{
 const email=(reference.email??reference.clientEmail??'').trim().toLowerCase()
 if(!reference.requestId&&!reference.requestNumber)return {brand:'nukhba'}
 const db=await createServiceRoleClient()
 let query=db.from('publish_requests').select('id,partner_id,client_email')
 if(reference.requestId)query=query.eq('id',reference.requestId)
 else {const number=/^(?:ATH-)?(\d+)$/.exec(reference.requestNumber!);if(!number)throw Error('EMAIL_ORDER_REFERENCE_INVALID');query=query.eq('request_number',Number(number[1]))}
 const {data,error}=await query.maybeSingle()
 if(error||!data)throw Error('EMAIL_ORDER_CONTEXT_UNAVAILABLE')
 if(!email||String(data.client_email??'').trim().toLowerCase()!==email)throw Error('EMAIL_ORDER_RECIPIENT_MISMATCH')
 if(!data.partner_id)return {brand:'nukhba',requestId:data.id}
 const partner=configuredClients().find(c=>c.id===data.partner_id)
 if(partner?.notifications===false||partner?.sandbox_only)return null
 // Stable known partner identity remains valid even if its HMAC configuration is rotated.
 if(data.partner_id==='awwal-saudi')return {brand:'first1saudi',requestId:data.id}
 throw Error('EMAIL_PARTNER_BRAND_UNCONFIGURED')
}

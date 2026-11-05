import { createHash } from 'node:crypto'
import type { CustomerEmailContext } from './email-brand'
function stable(value:unknown):unknown {if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));return value}
/** Business content only: logo/template changes and delivery retries are not new order events. */
export function orderNotificationKey(context:CustomerEmailContext,event:string,details:unknown){
 if(!context.requestId)return undefined
 const once=['paymentConfirmedToClient','requestReceivedToClient'].includes(event)
 const content=details&&typeof details==='object'?Object.fromEntries(Object.entries(details).filter(([key])=>!['email','clientEmail','clientName','requestId','requestNumber','brand'].includes(key))):details
 return createHash('sha256').update(JSON.stringify([context.brand,context.requestId,event,once?null:stable(content)])).digest('hex')
}

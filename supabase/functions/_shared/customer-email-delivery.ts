/** All order-email transports share durable receipts and the same provider idempotency namespace. */
const hex=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('')
function stable(value:unknown):unknown{if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));return value}
export async function deliverCustomerMail(body:Record<string,unknown>,env:(key:string)=>string|undefined,providerKey:string,notificationKey?:string){
 const headers:Record<string,string>={'Authorization':'Bearer '+providerKey,'Content-Type':'application/json'}
 if(!notificationKey)return fetch('https://api.resend.com/emails',{method:'POST',headers,body:JSON.stringify(body)})
 if(!/^[a-zA-Z0-9:_-]{1,200}$/.test(notificationKey))return Response.json({error:'INVALID_NOTIFICATION_KEY'},{status:400})
 const recipients=(Array.isArray(body.to)?body.to:[body.to]).map(v=>String(v).trim().toLowerCase()).sort()
 const key=await hex(JSON.stringify([recipients,notificationKey]))
 const mailHeaders={...(body.headers as Record<string,string>)}
 delete mailHeaders.Date
 const senderDomain=String(body.from).match(/@([^>]+)>$/)?.[1]??'nukhba.media'
 mailHeaders['Message-ID']=`<${key}@${senderDomain}>`
 if(mailHeaders['X-Entity-Ref-ID'])mailHeaders['X-Entity-Ref-ID']=key
 body={...body,headers:mailHeaders}
 const payloadHash=await hex(JSON.stringify(stable(body)))
 async function rpc(name:string,args:Record<string,unknown>){const r=await fetch(env('SUPABASE_URL')+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:env('SUPABASE_SERVICE_ROLE_KEY')!,Authorization:'Bearer '+env('SUPABASE_SERVICE_ROLE_KEY'),'Content-Type':'application/json'},body:JSON.stringify(args)});if(!r.ok)throw Error('EMAIL_DELIVERY_STORAGE_UNAVAILABLE');return r.json()}
 let claim
 try {claim=await rpc('customer_mail_claim',{p_delivery_key:key,p_payload_hash:payloadHash})}catch{return Response.json({error:'EMAIL_DELIVERY_STORAGE_UNAVAILABLE'},{status:503})}
 if(claim.action==='already_sent')return Response.json({id:claim.provider_id,suppressed:true})
 if(claim.action==='in_flight')return Response.json({suppressed:true,in_flight:true},{status:202})
 if(claim.action!=='send')return Response.json({error:'EMAIL_DELIVERY_REVIEW_REQUIRED'},{status:409})
 headers['Idempotency-Key']='customer-mail/'+key
 try {
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(20000)})
  const data=await response.clone().json().catch(()=>({}))
  const state=response.ok?'sent':([400,401,403,422,429].includes(response.status)?'failed':'unknown')
  await rpc('customer_mail_finish',{p_delivery_key:key,p_attempt_id:claim.attempt_id,p_state:state,p_provider_id:data.id??null})
  return response
 }catch{
  await rpc('customer_mail_finish',{p_delivery_key:key,p_attempt_id:claim.attempt_id,p_state:'unknown',p_provider_id:null}).catch(()=>undefined)
  return Response.json({error:'EMAIL_DELIVERY_OUTCOME_UNKNOWN'},{status:503})
 }
}

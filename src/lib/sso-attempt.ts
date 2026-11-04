import { createHash } from 'node:crypto'
import { createServiceRoleClient } from '@/lib/supabase-server'
export async function consumeSsoAttempt(email:string,request:Request) {
 const hash=(value:string)=>createHash('sha256').update(value).digest('hex')
 const db=await createServiceRoleClient(),result=await db.rpc('partner_sso_consume_attempt',{p_email:hash(email),p_ip:hash(request.headers.get('x-forwarded-for')?.split(',')[0].trim()??'unknown')})
 if(result.error)throw Error('SSO_RATE_UNAVAILABLE')
 return result.data===true
}

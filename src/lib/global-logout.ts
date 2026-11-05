import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto'
const audience='first1saudi-global-logout-v1'
function signature(payload:string){const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!secret)throw Error('LOGOUT_UNAVAILABLE');return createHmac('sha256',secret).update(audience+'\n'+payload).digest('base64url')}
export function globalLogoutTicket(subject:string){
 const now=Math.floor(Date.now()/1000),payload=Buffer.from(JSON.stringify({aud:audience,sub:subject,iat:now,exp:now+90,nonce:randomBytes(32).toString('base64url')})).toString('base64url')
 return payload+'.'+signature(payload)
}
export function readGlobalLogoutTicket(ticket:string){
 if(ticket.length>1500||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(ticket))throw Error('INVALID_LOGOUT')
 const [payload,mac]=ticket.split('.'),expected=signature(payload),a=Buffer.from(mac),b=Buffer.from(expected)
 if(a.length!==b.length||!timingSafeEqual(a,b))throw Error('INVALID_LOGOUT')
 const claims=JSON.parse(Buffer.from(payload,'base64url').toString()),now=Math.floor(Date.now()/1000)
 if(claims.aud!==audience||!Number.isInteger(claims.iat)||!Number.isInteger(claims.exp)||claims.iat>now+5||claims.exp<=now||claims.exp>claims.iat+90||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(claims.sub??'')||!/^[A-Za-z0-9_-]{43}$/.test(claims.nonce??''))throw Error('INVALID_LOGOUT')
 return claims as {sub:string;nonce:string;exp:number}
}

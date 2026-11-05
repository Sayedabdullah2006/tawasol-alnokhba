import {createHmac,timingSafeEqual} from 'node:crypto'
import {partnerData} from '@/lib/partners/data'
import {storedCheckout} from '@/lib/partners/checkout'
import {settlePartnerTamara} from '@/lib/partners/checkout-methods'

/** Separate authenticated endpoint: never dispatch Sandbox notifications to live handlers. */
function verifySandboxTamaraToken(token:string){
 try{
  const secret=process.env.TAMARA_NOTIFICATION_TOKEN_SANDBOX
  if(!secret||token.length>8192)return false
  const [header,payload,signature,...rest]=token.split('.')
  if(rest.length||!header||!payload||!signature)return false
  if(JSON.parse(Buffer.from(header,'base64url').toString()).alg!=='HS256')return false
  const expected=createHmac('sha256',secret).update(`${header}.${payload}`).digest(),actual=Buffer.from(signature,'base64url')
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return false
  const claims=JSON.parse(Buffer.from(payload,'base64url').toString()),now=Date.now()/1000
  return typeof claims.exp==='number'&&claims.exp>now&&(!claims.nbf||claims.nbf<=now+30)
 }catch{return false}
}
export async function POST(request:Request){
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'')??new URL(request.url).searchParams.get('tamaraToken')??''
 if(!verifySandboxTamaraToken(token))return Response.json({received:false},{status:401})
 try{
  const raw=await request.text();if(raw.length>32768)return Response.json({received:false},{status:413})
  const payload=JSON.parse(raw)
  if(!['order_approved','order_authorised','order_captured'].includes(payload.event_type))return Response.json({received:true})
  if(typeof payload.order_id!=='string'||typeof payload.order_reference_id!=='string')return Response.json({received:false},{status:400})
  const db=await partnerData(true),{data,error}=await db.from('partner_checkout_sessions').select('id').eq('id',payload.order_reference_id).eq('method_details->>tamara_id',payload.order_id).maybeSingle()
  if(error)throw Error('Sandbox lookup unavailable')
  if(!data)return Response.json({received:true,handled:false})
  const session=await storedCheckout(data.id)
  if(!session.sandbox)return Response.json({received:false},{status:409})
  await settlePartnerTamara(session)
  return Response.json({received:true})
 }catch{return Response.json({received:false},{status:503})}
}

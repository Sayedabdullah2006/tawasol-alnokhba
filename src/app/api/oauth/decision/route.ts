import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { authorizationId, validConsentDetails, safeSsoRedirect, validSsoOrigin } from '@/lib/sso'
import {publicAuthUrl} from '@/lib/auth-origin'
export const dynamic='force-dynamic'
const privateRedirect=(url:URL|string)=>NextResponse.redirect(url,{status:303,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache'}})
export async function POST(request:Request){
 if(!validSsoOrigin(request))return NextResponse.json({error:'INVALID_ORIGIN'},{status:403})
 try{
  const form=await request.formData(),id=authorizationId(form.get('authorization_id')),decision=form.get('decision')
  if(!['approve','deny','switch'].includes(String(decision)))return NextResponse.json({error:'INVALID_DECISION'},{status:400})
  const db=await createServerSupabaseClient(),{data:{user}}=await db.auth.getUser()
  if(!user)return privateRedirect(publicAuthUrl('/auth/sso?authorization_id='+encodeURIComponent(id)))
  const details=await db.auth.oauth.getAuthorizationDetails(id)
  if(details.error||!details.data)return privateRedirect(publicAuthUrl('/oauth/consent?recovery='+((details.error?.status??503)>=500?'unavailable':'expired')))
  if('redirect_url'in details.data)return privateRedirect(safeSsoRedirect(details.data.redirect_url))
  validConsentDetails(details.data)
  if(decision==='switch'){await db.auth.signOut({scope:'local'});return privateRedirect(publicAuthUrl('/auth/sso?authorization_id='+id))}
  const result=decision==='approve'?await db.auth.oauth.approveAuthorization(id,{skipBrowserRedirect:true}):await db.auth.oauth.denyAuthorization(id,{skipBrowserRedirect:true})
  if(result.error||!result.data)return privateRedirect(publicAuthUrl('/oauth/consent?recovery='+((result.error?.status??503)>=500?'unavailable':'expired')))
  return privateRedirect(safeSsoRedirect(result.data.redirect_url))
 }catch{return privateRedirect(publicAuthUrl('/oauth/consent?recovery=invalid'))}
}

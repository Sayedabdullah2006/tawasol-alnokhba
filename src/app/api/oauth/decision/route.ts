import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { authorizationId, validConsentDetails, safeSsoRedirect, validSsoOrigin } from '@/lib/sso'
export const dynamic='force-dynamic'
export async function POST(request:Request){
 if(!validSsoOrigin(request))return NextResponse.json({error:'INVALID_ORIGIN'},{status:403})
 try{
  const form=await request.formData(),id=authorizationId(form.get('authorization_id')),decision=form.get('decision')
  if(!['approve','deny','switch'].includes(String(decision)))return NextResponse.json({error:'INVALID_DECISION'},{status:400})
  const db=await createServerSupabaseClient(),{data:{user}}=await db.auth.getUser()
  if(!user)return NextResponse.json({error:'UNAUTHORIZED'},{status:401})
  const details=await db.auth.oauth.getAuthorizationDetails(id)
  if(details.error||!details.data)return NextResponse.json({error:'AUTHORIZATION_EXPIRED'},{status:400})
  if('redirect_url'in details.data)return NextResponse.redirect(safeSsoRedirect(details.data.redirect_url),303)
  validConsentDetails(details.data)
  if(decision==='switch'){await db.auth.signOut({scope:'local'});return NextResponse.redirect(new URL('/auth/sso?authorization_id='+id,request.url),303)}
  const result=decision==='approve'?await db.auth.oauth.approveAuthorization(id,{skipBrowserRedirect:true}):await db.auth.oauth.denyAuthorization(id,{skipBrowserRedirect:true})
  if(result.error||!result.data)return NextResponse.json({error:'AUTHORIZATION_FAILED'},{status:400})
  return NextResponse.redirect(safeSsoRedirect(result.data.redirect_url),303)
 }catch{return NextResponse.json({error:'INVALID_AUTHORIZATION'},{status:400})}
}

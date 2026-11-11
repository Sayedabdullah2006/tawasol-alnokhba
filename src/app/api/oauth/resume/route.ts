import { after, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { authorizationId, validConsentDetails, safeSsoRedirect, validSsoOrigin } from '@/lib/sso'
import { notifyFirst1SaudiSignup } from '@/lib/first1saudi-signup-notification'
export const dynamic='force-dynamic'

// Authorization details may issue a one-use code for an existing grant. Resolve
// that side effect through one explicit POST, outside React page rendering.
export async function POST(request:Request){
 const headers={'Cache-Control':'private, no-store'}
 if(!validSsoOrigin(request))return NextResponse.json({error:'INVALID_ORIGIN'},{status:403,headers})
 try{
  const raw=await request.text();if(raw.length>2048)return NextResponse.json({error:'INVALID_REQUEST'},{status:400,headers})
  const id=authorizationId(JSON.parse(raw).authorization_id)
  const db=await createServerSupabaseClient(),{data:{user},error}=await db.auth.getUser()
  if(error&&(error.status??0)>=500)return NextResponse.json({error:'AUTH_UNAVAILABLE'},{status:503,headers})
  if(error||!user)return NextResponse.json({error:'LOGIN_REQUIRED'},{status:401,headers})
  // getUser verifies confirmation and the server-set source; ordinary logins carry no signup marker.
  after(() => notifyFirst1SaudiSignup(user))
  const details=await db.auth.oauth.getAuthorizationDetails(id)
  if(details.error||!details.data)return NextResponse.json({error:(details.error?.status??503)>=500?'AUTH_UNAVAILABLE':'AUTH_EXPIRED'},{status:(details.error?.status??503)>=500?503:409,headers})
  if('redirect_url'in details.data)return NextResponse.json({redirect:safeSsoRedirect(details.data.redirect_url)},{headers})
  validConsentDetails(details.data)
  // Continue only for the exact registered FirstSaudi client, callback and allowed scopes.
  const approved=await db.auth.oauth.approveAuthorization(id,{skipBrowserRedirect:true})
  if(approved.error||!approved.data)return NextResponse.json({error:(approved.error?.status??503)>=500?'AUTH_UNAVAILABLE':'AUTH_EXPIRED'},{status:(approved.error?.status??503)>=500?503:409,headers})
  return NextResponse.json({redirect:safeSsoRedirect(approved.data.redirect_url)},{headers})
 }catch{return NextResponse.json({error:'AUTH_UNAVAILABLE'},{status:503,headers})}
}

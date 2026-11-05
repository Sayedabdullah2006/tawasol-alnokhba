import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { authorizationId, validConsentDetails, safeSsoRedirect, validSsoOrigin } from '@/lib/sso'
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
  if(error||!user)return NextResponse.json({error:'LOGIN_REQUIRED'},{status:401,headers})
  const details=await db.auth.oauth.getAuthorizationDetails(id)
  if(details.error||!details.data)return NextResponse.json({error:(details.error?.status??503)>=500?'AUTH_UNAVAILABLE':'AUTH_EXPIRED'},{status:(details.error?.status??503)>=500?503:409,headers})
  if('redirect_url'in details.data)return NextResponse.json({redirect:safeSsoRedirect(details.data.redirect_url)},{headers})
  validConsentDetails(details.data)
  return NextResponse.json({redirect:'/oauth/consent?authorization_id='+encodeURIComponent(id),consent:{email:user.email??'',scope:details.data.scope}},{headers})
 }catch{return NextResponse.json({error:'AUTH_UNAVAILABLE'},{status:503,headers})}
}

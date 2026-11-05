import {NextResponse} from 'next/server'
import {cookies} from 'next/headers'
import {createServerClient} from '@supabase/ssr'
import {createServiceRoleClient} from '@/lib/supabase-server'
import {readGlobalLogoutTicket} from '@/lib/global-logout'
export const dynamic='force-dynamic'
// No incoming redirect target is accepted. This capability only clears the
// matching browser's already-revoked session, never grants access or logs in.
export async function GET(request:Request){
 const response=NextResponse.redirect('https://www.first1saudi.net/services/auth/start?intent=reauth',{status:303,headers:{'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','Referrer-Policy':'no-referrer'}})
 try{
  const url=new URL(request.url)
  if(url.searchParams.getAll('ticket').length!==1||[...url.searchParams.keys()].some(k=>k!=='ticket'))return response
  const ticket=readGlobalLogoutTicket(url.searchParams.get('ticket')??''),service=await createServiceRoleClient()
  const used=await service.rpc('partner_accept_nonce',{p_partner:'awwal-saudi',p_nonce:'logout_'+ticket.nonce})
  if(used.error||used.data!==true)return response
  const store=await cookies(),db=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookieOptions:{sameSite:'lax',secure:true},cookies:{getAll:()=>store.getAll(),setAll:values=>values.forEach(({name,value,options})=>response.cookies.set(name,value,options))}})
  // getClaims verifies the JWT signature even after its server session was
  // revoked. A different currently-signed-in identity is left untouched.
  const claims=await db.auth.getClaims()
  if(!claims.error&&claims.data?.claims.sub===ticket.sub){
   const current=claims.data.claims
   const active=await service.rpc('partner_identity_session_valid',{p_user:ticket.sub,p_session:current.session_id,p_client:current.client_id??null})
   // A successful new sign-in AFTER global revocation must survive a delayed
   // logout response. Only clear the already-revoked browser session.
   if(!active.error&&active.data===false)await db.auth.signOut({scope:'local'})
  }
 }catch{/* Invalid/expired/replayed capabilities only return to fixed sign-in. */}
 return response
}

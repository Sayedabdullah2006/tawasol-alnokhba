import 'server-only'
import {createClient} from '@supabase/supabase-js'

/** Only after verified CAPTCHA + rate limiting, or an authenticated own-account
 * mutation + rate limiting. Never expose this client/session to the browser.
 * Auth's admin credential avoids consuming the same CAPTCHA twice. The password
 * is still checked by Auth, and the temporary proof session is always revoked.
 */
export async function provePassword(email:string,password:string,expectedSubject?:string){
 const verifier=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
 const result=await verifier.auth.signInWithPassword({email,password})
 try{
  if(result.error)return {ok:false,code:result.error.code??'unavailable'}
  if(!result.data.user||expectedSubject&&result.data.user.id!==expectedSubject)return {ok:false,code:'identity_mismatch'}
  return {ok:true,subject:result.data.user.id}
 }finally{if(result.data.session)await verifier.auth.signOut({scope:'local'})}
}

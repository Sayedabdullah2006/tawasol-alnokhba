import {AuthError,createClient,type SupabaseClient} from '@supabase/supabase-js'

/** Validate a JWT only AFTER Auth has verified it. Never authorize decoded claims. */
export async function activeAuthSession(token:string,userId:string):Promise<boolean>{
 let claims
 try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'))}catch{return false}
 if(claims.sub!==userId||!Number.isFinite(claims.exp)||claims.exp*1000<=Date.now()||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(claims.session_id??''))return false
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}})
 const result=await db.rpc('partner_identity_session_valid',{p_user:userId,p_session:claims.session_id,p_client:claims.client_id??null})
 if(result.error)throw new AuthError('Session verification is temporarily unavailable',503,'session_verification_unavailable')
 return result.data===true
}

/** Revoked access JWTs can retain a valid signature. Require the live session too. */
export function requireActiveAuthSession<T extends SupabaseClient>(client:T):T{
 const getUser=client.auth.getUser.bind(client.auth)
 client.auth.getUser=async(jwt?:string)=>{
  const result=await getUser(jwt)
  if(result.error||!result.data.user)return result
  try{
   const token=jwt??(await client.auth.getSession()).data.session?.access_token
   if(token&&await activeAuthSession(token,result.data.user.id))return result
   return {data:{user:null},error:new AuthError('Session has ended',401,'session_not_found')}
  }catch(error){return {data:{user:null},error:error instanceof AuthError?error:new AuthError('Session verification is temporarily unavailable',503,'session_verification_unavailable')}}
 }
 return client
}

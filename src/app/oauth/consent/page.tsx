import SsoRecovery from '@/app/auth/sso/sso-recovery'
import SsoConsent from '@/app/auth/sso/sso-consent'
import {redirect} from 'next/navigation'
import {createServerSupabaseClient} from '@/lib/supabase-server'
import {authorizationId} from '@/lib/sso'
import '@/app/auth/sso/sso.css'
export const dynamic='force-dynamic'
export const metadata={title:'أول سعودي | الدخول الموحد',robots:{index:false,follow:false}}
export default async function ConsentPage({searchParams}:{searchParams:Promise<{authorization_id?:string;recovery?:string}>}){
 const params=await searchParams
 if(['expired','unavailable','invalid'].includes(params.recovery??''))return <SsoRecovery reason={params.recovery as 'expired'|'unavailable'|'invalid'}/>
 let id;try{id=authorizationId(params.authorization_id)}catch{return <SsoRecovery reason="invalid"/>}
 const db=await createServerSupabaseClient(),{data:{user}}=await db.auth.getUser()
 if(!user)redirect('/auth/sso?authorization_id='+id)
 // Rendering must never consume an authorization or issue a one-use code.
 return <SsoConsent authorizationId={id}/>
}

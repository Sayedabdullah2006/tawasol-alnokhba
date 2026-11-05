import { authorizationId } from '@/lib/sso'
import SsoLogin from './sso-login'
import SsoRecovery from './sso-recovery'
import './sso.css'
export const dynamic = 'force-dynamic'
export const metadata = { title:'أول سعودي | الحساب الموحد', robots:{index:false,follow:false} }
export default async function SsoPage({searchParams}:{searchParams:Promise<{authorization_id?:string;mode?:string}>}) {
  const params=await searchParams
  let id
  try { id = authorizationId(params.authorization_id) } catch { return <SsoRecovery reason="invalid"/> }
  return <SsoLogin authorizationId={id} initialMode={params.mode==='register'?'register':'login'}/>
}

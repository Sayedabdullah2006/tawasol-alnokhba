import { authorizationId } from '@/lib/sso'
import SsoLogin from './sso-login'
import First1Shell from './first1-shell'
import './sso.css'
export const dynamic = 'force-dynamic'
export const metadata = { title:'أول سعودي | الحساب الموحد', robots:{index:false,follow:false} }
export default async function SsoPage({searchParams}:{searchParams:Promise<{authorization_id?:string;mode?:string}>}) {
  const params=await searchParams
  let id
  try { id = authorizationId(params.authorization_id) } catch { return <First1Shell><section className="w-full max-w-md"><h1 className="text-2xl font-semibold">رابط تسجيل الدخول غير صالح</h1><a className="mt-6 inline-block underline" href="https://first1saudi.net/services/account">العودة إلى أول سعودي</a></section></First1Shell> }
  return <SsoLogin authorizationId={id} initialMode={params.mode==='register'?'register':'login'}/>
}

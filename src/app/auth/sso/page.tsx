import { authorizationId } from '@/lib/sso'
import SsoLogin from './sso-login'
import './sso.css'
export const dynamic = 'force-dynamic'
export const metadata = { title:'أول سعودي | الحساب الموحد', robots:{index:false,follow:false} }
export default async function SsoPage({searchParams}:{searchParams:Promise<{authorization_id?:string;mode?:string}>}) {
  const params=await searchParams
  let id
  try { id = authorizationId(params.authorization_id) } catch { return <main dir="rtl" className="min-h-screen bg-white p-8 text-center text-gray-900">رابط تسجيل الدخول غير صالح. ابدأ من موقع أول سعودي.</main> }
  return <SsoLogin authorizationId={id} initialMode={params.mode==='register'?'register':'login'}/>
}

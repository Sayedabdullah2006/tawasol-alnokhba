import First1Shell from '@/app/auth/sso/first1-shell'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { authorizationId, validConsentDetails, safeSsoRedirect } from '@/lib/sso'
import '@/app/auth/sso/sso.css'
export const dynamic='force-dynamic'
export const metadata={title:'أول سعودي | السماح بالدخول',robots:{index:false,follow:false}}
const scopeNames:Record<string,string>={openid:'التعرف على حسابك الموحد',email:'البريد الإلكتروني وحالة تأكيده',profile:'الاسم والملف الشخصي',offline_access:'إبقاء جلسة الدخول مع إمكانية تسجيل الخروج'}
export default async function ConsentPage({searchParams}:{searchParams:Promise<{authorization_id?:string}>}) {
 let id
 try{id=authorizationId((await searchParams).authorization_id)}catch{return <main className="min-h-screen bg-white p-8 text-gray-900">رابط التفويض غير صالح. ابدأ من أول سعودي.</main>}
 const db=await createServerSupabaseClient(),{data:{user}}=await db.auth.getUser()
 if(!user)redirect('/auth/sso?authorization_id='+id)
 const result=await db.auth.oauth.getAuthorizationDetails(id)
 if(result.error||!result.data)return <main className="min-h-screen bg-white p-8 text-gray-900">انتهى رابط الدخول أو تعذر التحقق منه. ابدأ مجددًا من أول سعودي.</main>
 const details=result.data
 if('redirect_url'in details){let target;try{target=safeSsoRedirect(details.redirect_url)}catch{return <main className="p-8">عنوان العودة غير مسموح.</main>}redirect(target)}
 try{validConsentDetails(details)}catch{return <main className="min-h-screen bg-white p-8 text-gray-900">هذا التطبيق غير مسموح له باستخدام حساب أول سعودي.</main>}
 return <First1Shell><section className="w-full max-w-md rounded-xl border border-[#d7e1d7] bg-white p-6 sm:p-8"><h1 className="mt-7 text-2xl font-semibold">المتابعة بحسابك الموحد</h1><p className="mt-4 break-words text-sm" dir="ltr">{user.email}</p><p className="mt-4 text-sm leading-7">سيستخدم أول سعودي البيانات التالية من حساب تواصل النخبة لتسجيل دخولك:</p><ul className="mt-4 list-inside list-disc space-y-3 text-sm">{details.scope.split(' ').filter(Boolean).map(scope=><li key={scope}>{scopeNames[scope]??scope}</li>)}</ul><p className="mt-6 text-sm leading-7 text-[#53655a]">لن تُشارك كلمة مرورك، ولن تتغير حساباتك أو طلباتك السابقة تلقائيًا.</p><form action="/api/oauth/decision" method="post" className="mt-6 flex flex-wrap gap-3"><input type="hidden" name="authorization_id" value={id}/><button name="decision" value="approve" className="rounded-lg bg-[#155e3f] px-5 py-3 text-sm font-semibold text-white">السماح والمتابعة</button><button name="decision" value="deny" className="rounded-lg border border-[#8ca292] px-5 py-3 text-sm">إلغاء</button><button name="decision" value="switch" className="py-3 text-sm underline underline-offset-4">استخدام حساب آخر</button></form></section></First1Shell>
}

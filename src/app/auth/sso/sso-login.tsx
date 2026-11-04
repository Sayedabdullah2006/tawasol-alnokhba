'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import TurnstileWidget from '@/components/ui/TurnstileWidget'
import { turnstileEnabled } from '@/lib/turnstile'

const field='mt-2 w-full rounded-lg border border-[#8ca292] bg-white px-3 py-3 text-[#172d23] outline-offset-4'
export default function SsoLogin({authorizationId,initialMode='login'}:{authorizationId:string;initialMode?:'login'|'register'}) {
 const router=useRouter(),[mode,setMode]=useState<'login'|'register'|'code'>(initialMode),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[phone,setPhone]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[captcha,setCaptcha]=useState<string|null>(null)
 const supabase=createClient(),captchaOn=turnstileEnabled()
 async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setMessage('');try{
  if(sent){const result=await supabase.auth.verifyOtp({email:email.trim(),token:code.trim(),type:mode==='register'?'signup':'email'});if(result.error||!result.data.user)throw Error('الرمز غير صحيح أو انتهت صلاحيته.');router.replace('/oauth/consent?authorization_id='+authorizationId);router.refresh();return}
  if(mode==='login'){const result=await supabase.auth.signInWithPassword({email:email.trim(),password,options:captcha?{captchaToken:captcha}:undefined});if(result.error)throw Error('تعذر تسجيل الدخول. تحقق من بياناتك أو استخدم رمز البريد.');router.replace('/oauth/consent?authorization_id='+authorizationId);router.refresh();return}
  const endpoint=mode==='register'?'/api/auth/sso/register':'/api/auth/sso/code'
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),password,fullName:name,phone,captchaToken:captcha})});const result=await response.json();if(!response.ok)throw Error(result.error??'تعذر إرسال الرمز. أعد المحاولة.');setSent(true);setMessage(result.message??'إن أمكن إتمام العملية، سيصلك رمز على بريدك. أدخله للمتابعة.');
 }catch(error){setMessage(error instanceof Error?error.message:'تعذر الاتصال. أعد المحاولة.')}finally{setBusy(false)}}
 function changeMode(next:typeof mode){setMode(next);setSent(false);setMessage('');setCode('');setPassword('')}
 return <main dir="rtl" className="sso-first1 flex min-h-screen items-center justify-center bg-[#f6f8f5] px-5 py-10 text-[#172d23]">
  <section className="w-full max-w-md"><header className="mb-8"><a href="https://first1saudi.net" className="text-2xl font-semibold text-[#155e3f]">أول سعودي / أ</a><h1 className="mt-7 text-2xl font-semibold">{sent?'تأكيد البريد الإلكتروني':mode==='register'?'إنشاء حساب موحد':'تسجيل الدخول'}</h1><p className="mt-3 text-sm leading-7 text-[#53655a]">استخدم حساب تواصل النخبة نفسه للدخول إلى أول سعودي. تُحفظ كلمة مرورك لدى نظام الحسابات المركزي.</p></header>
   <form onSubmit={submit} className="space-y-5 rounded-xl border border-[#d7e1d7] bg-white p-6">
    {!sent&&<label className="block text-sm">البريد الإلكتروني<input autoComplete="email" type="email" dir="ltr" required className={field} value={email} onChange={e=>setEmail(e.target.value)}/></label>}
    {!sent&&mode==='register'&&<><label className="block text-sm">الاسم الكامل<input autoComplete="name" required maxLength={160} className={field} value={name} onChange={e=>setName(e.target.value)}/></label><label className="block text-sm">الجوال مع مفتاح الدولة<input autoComplete="tel" type="tel" dir="ltr" placeholder="+9665XXXXXXXX" required className={field} value={phone} onChange={e=>setPhone(e.target.value)}/></label></>}
    {!sent&&mode!=='code'&&<label className="block text-sm">كلمة المرور<input autoComplete={mode==='register'?'new-password':'current-password'} type="password" minLength={mode==='register'?10:undefined} required className={field} value={password} onChange={e=>setPassword(e.target.value)}/></label>}
    {sent&&<><p className="break-words text-sm" dir="ltr">{email}</p><label className="block text-sm">رمز التحقق<input autoComplete="one-time-code" inputMode="numeric" required className={field} value={code} onChange={e=>setCode(e.target.value)}/></label></>}
    {!sent&&captchaOn&&<TurnstileWidget onVerify={setCaptcha} onExpire={()=>setCaptcha(null)}/>}
    {message&&<p role="status" className="text-sm leading-7">{message}</p>}
    <button disabled={busy||(!sent&&captchaOn&&!captcha)} className="w-full rounded-lg bg-[#155e3f] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'جارٍ التحقق…':sent?'تأكيد ومتابعة':mode==='login'?'دخول ومتابعة':'إرسال رمز التحقق'}</button>
   </form>
   <nav aria-label="خيارات الدخول" className="mt-5 flex flex-wrap gap-5 text-sm underline underline-offset-4">{mode!=='login'&&<button onClick={()=>changeMode('login')}>لدي حساب</button>}{mode!=='code'&&<button onClick={()=>changeMode('code')}>الدخول برمز البريد</button>}{mode!=='register'&&<button onClick={()=>changeMode('register')}>إنشاء حساب</button>}</nav>
   <p className="mt-8 text-xs leading-6 text-[#53655a]">لن تنشأ عضوية مدفوعة بمجرد تسجيل الدخول. تُربط حسابات أول سعودي السابقة بعد التحقق من ملكيتها.</p>
  </section>
 </main>
}

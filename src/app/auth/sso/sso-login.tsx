'use client'
import { useRef, useState } from 'react'
import First1Shell from './first1-shell'
import { createClient } from '@/lib/supabase'
import SsoCaptcha from './sso-captcha'
import { turnstileEnabled } from '@/lib/turnstile'

const field='mt-2 w-full rounded-lg border border-[#8ca292] bg-white px-3 py-3 text-[#172d23] outline-offset-4'
export default function SsoLogin({authorizationId,initialMode='login'}:{authorizationId:string;initialMode?:'login'|'register'}) {
 const [mode,setMode]=useState<'login'|'register'|'code'>(initialMode),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[phone,setPhone]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[captcha,setCaptcha]=useState<string|null>(null)
 const supabase=createClient(),captchaOn=turnstileEnabled()
 const submitting=useRef(false),[captchaAttempt,setCaptchaAttempt]=useState(0)
 async function resume(){
  const response=await fetch('/api/oauth/resume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({authorization_id:authorizationId}),signal:AbortSignal.timeout(20000)})
  const result=await response.json()
  if(response.status===409){window.location.replace('/oauth/consent?recovery=expired');return}
  if(!response.ok||typeof result.redirect!=='string')throw Error('تعذر إكمال الدخول الآن. أعد المحاولة.')
  const target=new URL(result.redirect,window.location.origin)
  if(!(target.origin===window.location.origin&&target.pathname==='/oauth/consent')&&!(target.origin==='https://first1saudi.net'&&target.pathname==='/services/auth/callback'))throw Error('تعذر إكمال الدخول الآن. أعد المحاولة.')
  window.location.replace(target.href)
 }
 async function submit(event:React.FormEvent){event.preventDefault();if(submitting.current)return;submitting.current=true;setBusy(true);setMessage('');try{
  if(sent){const result=await supabase.auth.verifyOtp({email:email.trim(),token:code.trim(),type:mode==='register'?'signup':'email'});if(result.error||!result.data.user)throw Error('الرمز غير صحيح أو انتهت صلاحيته.');await resume();return}
  if(mode==='login'){const result=await supabase.auth.signInWithPassword({email:email.trim(),password,options:captcha?{captchaToken:captcha}:undefined});if(result.error)throw Error('تعذر تسجيل الدخول. تحقق من بياناتك أو استخدم رمز البريد.');await resume();return}
  const endpoint=mode==='register'?'/api/auth/sso/register':'/api/auth/sso/code'
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({email:email.trim(),password,fullName:name,phone,captchaToken:captcha})});const result=await response.json();if(!response.ok)throw Error(result.error??'تعذر إرسال الرمز. أعد المحاولة.');setSent(true);setMessage(result.message??'إن أمكن إتمام العملية، سيصلك رمز على بريدك. أدخله للمتابعة.');
 }catch(error){setMessage(error instanceof Error&&/^[\u0600-\u06ff]/u.test(error.message)?error.message:'لم يكتمل الاتصال. أعد المحاولة.');if(!sent){setCaptcha(null);setCaptchaAttempt(n=>n+1)}}finally{submitting.current=false;setBusy(false)}}
 function changeMode(next:typeof mode){if(submitting.current)return;setMode(next);setSent(false);setMessage('');setCode('');setPassword('');setCaptcha(null);setCaptchaAttempt(n=>n+1)}
 return <First1Shell>
  <section className="first1-login-layout"><aside className="first1-login-intro"><h1>بوابة موحدة لخدمات النشر الإلكتروني</h1><p>سجل دخولك مرة واحدة عبر الدخول الموحد لشركة تواصل النخبة</p></aside><div className="first1-login-fields"><header className="mb-8"><h2 className="text-2xl font-semibold">{sent?'تأكيد البريد الإلكتروني':mode==='register'?'إنشاء حساب':'تسجيل الدخول'}</h2></header>
   <form onSubmit={submit} className="space-y-5 rounded-xl border border-[#d7e1d7] bg-white p-6">
    {!sent&&<label className="block text-sm">البريد الإلكتروني<input autoComplete="email" type="email" dir="ltr" required className={field} value={email} onChange={e=>setEmail(e.target.value)}/></label>}
    {!sent&&mode==='register'&&<><label className="block text-sm">الاسم الكامل<input autoComplete="name" required maxLength={160} className={field} value={name} onChange={e=>setName(e.target.value)}/></label><label className="block text-sm">الجوال مع مفتاح الدولة<input autoComplete="tel" type="tel" dir="ltr" placeholder="+9665XXXXXXXX" required className={field} value={phone} onChange={e=>setPhone(e.target.value)}/></label></>}
    {!sent&&mode!=='code'&&<label className="block text-sm">كلمة المرور<input autoComplete={mode==='register'?'new-password':'current-password'} type="password" minLength={mode==='register'?10:undefined} required className={field} value={password} onChange={e=>setPassword(e.target.value)}/></label>}
    {sent&&<><p className="break-words text-sm" dir="ltr">{email}</p><label className="block text-sm">رمز التحقق<input autoComplete="one-time-code" inputMode="numeric" required className={field} value={code} onChange={e=>setCode(e.target.value)}/></label></>}
    {!sent&&captchaOn&&<SsoCaptcha key={captchaAttempt} onVerify={setCaptcha} onExpire={()=>setCaptcha(null)}/>}
    {message&&<p role="alert" className="text-sm leading-7">{message}</p>}
    <button disabled={busy||(!sent&&captchaOn&&!captcha)} className="w-full rounded-lg bg-[#155e3f] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'جارٍ التحقق…':sent?'تأكيد ومتابعة':mode==='login'?'دخول ومتابعة':'إرسال رمز التحقق'}</button>
   </form>
   <nav aria-label="خيارات الدخول" className="first1-login-options">{mode!=='login'&&<button type="button" disabled={busy} className="first1-login-option first1-login-option-code" onClick={()=>changeMode('login')}>لدي حساب</button>}{mode!=='code'&&<button type="button" disabled={busy} className="first1-login-option first1-login-option-code" onClick={()=>changeMode('code')}>الدخول برمز البريد</button>}{mode!=='register'&&<button type="button" disabled={busy} className="first1-login-option first1-login-option-register" onClick={()=>changeMode('register')}>إنشاء حساب</button>}</nav>
  </div></section>
 </First1Shell>
}

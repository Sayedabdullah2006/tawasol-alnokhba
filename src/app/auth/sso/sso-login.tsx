'use client'
import { useRef, useState } from 'react'
import First1Shell from './first1-shell'
import { createClient } from '@/lib/supabase'
import SsoCaptcha from './sso-captcha'
import { turnstileEnabled } from '@/lib/turnstile'

const field='mt-2 w-full rounded-lg border border-[#8ca292] bg-white px-3 py-3 text-[#172d23] outline-offset-4'
export default function SsoLogin({authorizationId,initialMode='login'}:{authorizationId:string;initialMode?:'login'|'register'}) {
 const [mode,setMode]=useState<'login'|'register'|'code'>(initialMode),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[phone,setPhone]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[captcha,setCaptcha]=useState<string|null>(null),[code,setCode]=useState(''),[codeSent,setCodeSent]=useState(false)
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
 async function submit(event:React.FormEvent){
  event.preventDefault();if(submitting.current)return;submitting.current=true;setBusy(true);setMessage('')
  try{
   if(mode==='code'){
    if(!codeSent){
     const response=await fetch('/api/auth/sso/code',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({email:email.trim(),captchaToken:captcha,authorization_id:authorizationId})})
     const result=await response.json()
     if(!response.ok)throw Error(result.error??'تعذر إرسال رمز الدخول. أعد المحاولة.')
     setCodeSent(true);setMessage(result.message);setCaptcha(null);setCaptchaAttempt(n=>n+1);return
    }
    const result=await supabase.auth.verifyOtp({email:email.trim().toLowerCase(),token:code.trim(),type:'email'})
    if(result.error||!result.data.user)throw Error('الرمز غير صحيح أو منتهي الصلاحية. أعد المحاولة أو اطلب رمزًا جديدًا.')
   }else if(mode==='login'){
    const result=await supabase.auth.signInWithPassword({email:email.trim(),password,options:captcha?{captchaToken:captcha}:undefined})
    if(result.error)throw Error('تعذر تسجيل الدخول. تحقق من بريدك الإلكتروني وكلمة المرور.')
   }else{
    const response=await fetch('/api/auth/sso/register',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({email:email.trim(),password,fullName:name,phone,captchaToken:captcha})})
    const result=await response.json()
    if(!response.ok){if(response.status===409)setMode('login');throw Error(result.error??'تعذر إنشاء الحساب. أعد المحاولة.')}
    if(result.authenticated!==true)throw Error('تم إنشاء حسابك. سجّل الدخول بكلمة المرور للمتابعة.')
    setMode('login')
   }
   await resume()
  }catch(error){setMessage(error instanceof Error&&/^[\u0600-\u06ff]/u.test(error.message)?error.message:'لم يكتمل الاتصال. أعد المحاولة.');setCaptcha(null);setCaptchaAttempt(n=>n+1)}finally{submitting.current=false;setBusy(false)}
 }
 function changeMode(next:typeof mode){if(submitting.current)return;setMode(next);setMessage('');setPassword('');setCode('');setCodeSent(false);setCaptcha(null);setCaptchaAttempt(n=>n+1)}
 return <First1Shell>
  <section className="first1-login-layout"><aside className="first1-login-intro"><h1>بوابة موحدة لخدمات النشر الإلكتروني</h1><p>سجل دخولك مرة واحدة عبر الدخول الموحد لشركة تواصل النخبة</p></aside><div className="first1-login-fields"><header className="mb-8"><h2 className="text-2xl font-semibold">{mode==='register'?'إنشاء حساب':'تسجيل الدخول'}</h2>{mode==='register'&&<p className="mt-2 text-sm">تدخل إلى حسابك مباشرة بعد إنشاء الحساب.</p>}</header>
   <form onSubmit={submit} className="space-y-5 rounded-xl border border-[#d7e1d7] bg-white p-6">
    <label className="block text-sm">البريد الإلكتروني<input autoComplete="email" type="email" dir="ltr" required readOnly={mode==='code'&&codeSent} className={field} value={email} onChange={e=>setEmail(e.target.value)}/></label>
    {mode==='register'&&<><label className="block text-sm">الاسم الكامل<input autoComplete="name" required maxLength={160} className={field} value={name} onChange={e=>setName(e.target.value)}/></label><label className="block text-sm">الجوال مع مفتاح الدولة<input autoComplete="tel" type="tel" dir="ltr" placeholder="+9665XXXXXXXX" required className={field} value={phone} onChange={e=>setPhone(e.target.value)}/></label></>}
    {mode!=='code'&&<label className="block text-sm">كلمة المرور<input autoComplete={mode==='register'?'new-password':'current-password'} type="password" minLength={mode==='register'?10:undefined} required className={field} value={password} onChange={e=>setPassword(e.target.value)}/></label>}
    {mode==='code'&&codeSent&&<label className="block text-sm">رمز الدخول<input autoComplete="one-time-code" inputMode="numeric" dir="ltr" required pattern="[0-9]{6,10}" maxLength={10} className={field} value={code} onChange={e=>setCode(e.target.value)}/></label>}
    {captchaOn&&!(mode==='code'&&codeSent)&&<SsoCaptcha key={captchaAttempt} onVerify={setCaptcha} onExpire={()=>setCaptcha(null)}/>}
    {message&&<p role="alert" className="text-sm leading-7">{message}</p>}
    <button disabled={busy||(captchaOn&&!captcha&&!(mode==='code'&&codeSent))} className="w-full rounded-lg bg-[#155e3f] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'جارٍ المتابعة…':mode==='code'?(codeSent?'تحقق من الرمز ومتابعة':'إرسال رمز الدخول'):mode==='login'?'دخول ومتابعة':'إنشاء حساب ومتابعة'}</button>
   </form>
   <nav aria-label="خيارات الدخول" className="first1-login-options">{mode!=='login'&&<button type="button" disabled={busy} className="first1-login-option first1-login-option-code" onClick={()=>changeMode('login')}>الدخول بكلمة المرور</button>}{mode==='login'&&<button type="button" disabled={busy} className="first1-login-option first1-login-option-code" onClick={()=>changeMode('code')}>الدخول برمز عبر البريد</button>}{mode==='code'&&codeSent&&<button type="button" disabled={busy} className="first1-login-option first1-login-option-code" onClick={()=>changeMode('code')}>طلب رمز جديد</button>}{mode!=='register'&&<button type="button" disabled={busy} className="first1-login-option first1-login-option-register" onClick={()=>changeMode('register')}>إنشاء حساب</button>}</nav>
  </div></section>
 </First1Shell>
}

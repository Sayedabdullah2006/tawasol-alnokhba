'use client'
import { useRef, useState, type InputHTMLAttributes, type InvalidEvent } from 'react'
import First1Shell from './first1-shell'
import { createClient } from '@/lib/supabase'
import SsoCaptcha from './sso-captcha'
import { turnstileEnabled } from '@/lib/turnstile'

const field='mt-2 w-full rounded-lg border border-[#8ca292] bg-white px-3 py-3 text-[#172d23] outline-offset-4'
export default function SsoLogin({authorizationId,initialMode='login'}:{authorizationId:string;initialMode?:'login'|'register'}) {
 const [mode,setMode]=useState<'login'|'register'|'code'>(initialMode),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(''),[phone,setPhone]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[captcha,setCaptcha]=useState<string|null>(null),[code,setCode]=useState(''),[codeSent,setCodeSent]=useState(false)
 const supabase=createClient(),captchaOn=turnstileEnabled()
 const submitting=useRef(false),formRef=useRef<HTMLFormElement>(null),[captchaAttempt,setCaptchaAttempt]=useState(0)
 const [fieldErrors,setFieldErrors]=useState<Record<string,string>>({}),[authenticated,setAuthenticated]=useState(false)
 function invalid(event:InvalidEvent<HTMLInputElement>){
  const input=event.currentTarget,v=input.validity
  const error=v.valueMissing?'يرجى إكمال هذا الحقل.':input.name==='email'?'أدخل بريدًا إلكترونيًا صحيحًا مثل name@example.com.':input.name==='password'?'كلمة المرور يجب أن تكون من 10 إلى 128 حرفًا.':input.name==='phone'?'أدخل الجوال مع مفتاح الدولة، مثل +9665XXXXXXXX.':input.name==='code'?'أدخل رمز الدخول بالأرقام الإنجليزية من 6 إلى 10 أرقام.':'أدخل الاسم الكامل، بحد أقصى 160 حرفًا.'
  input.setCustomValidity(error)
  setFieldErrors(previous=>({...previous,[input.name]:error}))
 }
 function inputProps(name:string,help?:string):InputHTMLAttributes<HTMLInputElement>{
  return {id:`sso-${name}`,name,'aria-invalid':Boolean(fieldErrors[name]),'aria-describedby':[help,fieldErrors[name]?`sso-${name}-error`:null].filter(Boolean).join(' ')||undefined,onInvalid:invalid,onInput:event=>{event.currentTarget.setCustomValidity('');setFieldErrors(previous=>{if(!previous[name])return previous;const next={...previous};delete next[name];return next})}}
 }
 function fieldError(name:string){return fieldErrors[name]?<p id={`sso-${name}-error`} className="mt-2 text-sm text-red-700">{fieldErrors[name]}</p>:null}
 async function resume(){
  const response=await fetch('/api/oauth/resume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({authorization_id:authorizationId}),signal:AbortSignal.timeout(20000)})
  const result=await response.json()
  if(response.status===409){window.location.replace('/oauth/consent?recovery=expired');return}
  if(response.status===401){setAuthenticated(false);setMode('login');throw Error('انتهت جلسة الدخول. سجّل الدخول مجددًا للمتابعة.')}
  if(!response.ok||typeof result.redirect!=='string')throw Error('تعذر إكمال الدخول الآن. أعد المحاولة.')
  const target=new URL(result.redirect,window.location.origin)
  if(!(target.origin===window.location.origin&&target.pathname==='/oauth/consent')&&!(target.origin==='https://first1saudi.net'&&target.pathname==='/services/auth/callback'))throw Error('تعذر إكمال الدخول الآن. أعد المحاولة.')
  window.location.replace(target.href)
 }
 async function submit(event:React.FormEvent){
  event.preventDefault();if(submitting.current)return
  if(!authenticated&&captchaOn&&!captcha&&!(mode==='code'&&codeSent)){setMessage('أكمل التحقق الأمني أسفل الحقول، ثم اضغط متابعة. إذا لم يظهر، اضغط إعادة تحميل التحقق الأمني.');return}
  submitting.current=true;setBusy(true);setMessage('')
  try{
   if(authenticated){await resume();return}
   if(mode==='code'){
    if(!codeSent){
     const response=await fetch('/api/auth/sso/code',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({email:email.trim(),captchaToken:captcha,authorization_id:authorizationId})})
     const result=await response.json()
     if(!response.ok)throw Error(result.error??'تعذر إرسال رمز الدخول. أعد المحاولة.')
     setCodeSent(true);setMessage(result.message);setCaptcha(null);setCaptchaAttempt(n=>n+1);return
    }
    const result=await supabase.auth.verifyOtp({email:email.trim().toLowerCase(),token:code.trim(),type:'email'})
    if(result.error||!result.data.user||!result.data.session)throw Error('الرمز غير صحيح أو منتهي الصلاحية. أعد المحاولة أو اطلب رمزًا جديدًا.')
   }else if(mode==='login'){
    const result=await supabase.auth.signInWithPassword({email:email.trim(),password,options:captcha?{captchaToken:captcha}:undefined})
    if(result.error||!result.data.user||!result.data.session)throw Error('تعذر تسجيل الدخول. تحقق من بريدك الإلكتروني وكلمة المرور.')
   }else{
    const response=await fetch('/api/auth/sso/register',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({email:email.trim(),password,fullName:name,phone,captchaToken:captcha})})
    const result=await response.json()
    if(!response.ok){if(response.status===409)setMode('login');throw Error(result.error??'تعذر إنشاء الحساب. أعد المحاولة.')}
    if(result.authenticated!==true){setMode('login');throw Error('تم إنشاء حسابك. سجّل الدخول بكلمة المرور للمتابعة.')}
    setMode('login')
   }
   setAuthenticated(true)
   await resume()
  }catch(error){setMessage(error instanceof Error&&/^[\u0600-\u06ff]/u.test(error.message)?error.message:'لم يكتمل الاتصال. أعد المحاولة.');setCaptcha(null);setCaptchaAttempt(n=>n+1)}finally{submitting.current=false;setBusy(false)}
 }
 function changeMode(next:typeof mode){if(submitting.current)return;formRef.current?.querySelectorAll('input').forEach(input=>input.setCustomValidity(''));setMode(next);setFieldErrors({});setMessage('');setPassword('');setCode('');setCodeSent(false);setCaptcha(null);setCaptchaAttempt(n=>n+1)}
 return <First1Shell>
  <section className="first1-login-layout"><aside className="first1-login-intro"><h1>بوابة موحدة لخدمات النشر الإلكتروني</h1><p>سجل دخولك مرة واحدة عبر الدخول الموحد لشركة تواصل النخبة</p></aside><div className="first1-login-fields"><header className="mb-8"><h2 className="text-2xl font-semibold">{mode==='register'?'إنشاء حساب':'تسجيل الدخول'}</h2>{mode==='register'&&<p className="mt-2 text-sm">تدخل إلى حسابك مباشرة بعد إنشاء الحساب.</p>}</header>
   <form ref={formRef} onSubmit={submit} aria-busy={busy} className="space-y-5 rounded-xl border border-[#d7e1d7] bg-white p-6">
    {!authenticated&&<>
    <div><label htmlFor="sso-email" className="block text-sm">البريد الإلكتروني</label><input {...inputProps('email')} autoComplete="email" autoCapitalize="none" spellCheck={false} type="email" dir="ltr" required readOnly={mode==='code'&&codeSent} className={field} value={email} onChange={e=>setEmail(e.target.value)}/>{fieldError('email')}</div>
    {mode==='register'&&<><div><label htmlFor="sso-name" className="block text-sm">الاسم الكامل</label><input {...inputProps('name')} autoComplete="name" required pattern=".*\S.*" maxLength={160} className={field} value={name} onChange={e=>setName(e.target.value)}/>{fieldError('name')}</div><div><label htmlFor="sso-phone" className="block text-sm">الجوال مع مفتاح الدولة</label><p id="sso-phone-help" className="mt-1 text-sm text-[#53655a]">ابدأ بعلامة + ومفتاح الدولة، مثل <bdi>+9665XXXXXXXX</bdi> للسعودية.</p><input {...inputProps('phone','sso-phone-help')} autoComplete="tel" type="tel" dir="ltr" placeholder="+9665XXXXXXXX" required pattern="\+(?:[0-9][\s\-]*){7,15}" className={field} value={phone} onChange={e=>setPhone(e.target.value)}/>{fieldError('phone')}</div></>}
    {mode!=='code'&&<div><label htmlFor="sso-password" className="block text-sm">كلمة المرور</label>{mode==='register'&&<p id="sso-password-help" className="mt-1 text-sm text-[#53655a]">استخدم كلمة مرور من 10 إلى 128 حرفًا.</p>}<input {...inputProps('password',mode==='register'?'sso-password-help':undefined)} autoComplete={mode==='register'?'new-password':'current-password'} type="password" minLength={mode==='register'?10:undefined} maxLength={mode==='register'?128:undefined} required className={field} value={password} onChange={e=>setPassword(e.target.value)}/>{fieldError('password')}</div>}
    {mode==='code'&&codeSent&&<div><label htmlFor="sso-code" className="block text-sm">رمز الدخول</label><input {...inputProps('code')} autoComplete="one-time-code" inputMode="numeric" dir="ltr" required pattern="[0-9]{6,10}" maxLength={10} className={field} value={code} onChange={e=>setCode(e.target.value)}/>{fieldError('code')}</div>}
    {captchaOn&&!(mode==='code'&&codeSent)&&<SsoCaptcha key={captchaAttempt} onVerify={setCaptcha} onExpire={()=>setCaptcha(null)}/>}
    </>}
    {message&&<p role="alert" className="text-sm leading-7">{message}</p>}
    <button type="submit" disabled={busy} className="w-full rounded-lg bg-[#155e3f] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'جارٍ المتابعة…':authenticated?'متابعة إلى أول سعودي':mode==='code'?(codeSent?'تحقق من الرمز ومتابعة':'إرسال رمز الدخول'):mode==='login'?'دخول ومتابعة':'إنشاء حساب ومتابعة'}</button>
   </form>
   {!authenticated&&<nav aria-label="خيارات الدخول" className="first1-login-options">{mode!=='login'&&<button type="button" disabled={busy} className="first1-login-option first1-login-option-code" onClick={()=>changeMode('login')}>الدخول بكلمة المرور</button>}{mode==='login'&&<button type="button" disabled={busy} className="first1-login-option first1-login-option-code" onClick={()=>changeMode('code')}>الدخول برمز عبر البريد</button>}{mode==='code'&&codeSent&&<button type="button" disabled={busy} className="first1-login-option first1-login-option-code" onClick={()=>changeMode('code')}>طلب رمز جديد</button>}{mode!=='register'&&<button type="button" disabled={busy} className="first1-login-option first1-login-option-register" onClick={()=>changeMode('register')}>إنشاء حساب</button>}</nav>}
  </div></section>
 </First1Shell>
}

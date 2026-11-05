'use client'
import {useEffect,useRef,useState} from 'react'
import First1Shell from './first1-shell'
import SsoRecovery from './sso-recovery'
const scopes:Record<string,string>={openid:'التعرف على حسابك الموحد',email:'البريد الإلكتروني وحالة تأكيده',profile:'الاسم والملف الشخصي',offline_access:'إبقاء جلسة الدخول مع إمكانية تسجيل الخروج'}
export default function SsoConsent({authorizationId}:{authorizationId:string}){
 const started=useRef(false),[consent,setConsent]=useState<{email:string;scope:string}|null>(null),[failure,setFailure]=useState<'expired'|'unavailable'|null>(null)
 useEffect(()=>{
  if(started.current)return;started.current=true
  void(async()=>{try{
   const response=await fetch('/api/oauth/resume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({authorization_id:authorizationId}),signal:AbortSignal.timeout(20000)})
   const result=await response.json()
   if(!response.ok){setFailure(response.status===409?'expired':'unavailable');return}
   if(result.consent){setConsent(result.consent);return}
   const target=new URL(result.redirect)
   if(target.origin!=='https://first1saudi.net'||target.pathname!=='/services/auth/callback'||target.hash||target.username||target.password)throw Error('INVALID_REDIRECT')
   window.location.replace(target.href)
  }catch{setFailure('unavailable')}})()
 },[authorizationId])
 if(failure)return <SsoRecovery reason={failure} retryHref={'/oauth/consent?authorization_id='+encodeURIComponent(authorizationId)}/>
 if(!consent)return <First1Shell><p role="status">جارٍ تسجيل الدخول…</p></First1Shell>
 return <First1Shell><section className="w-full max-w-md rounded-xl border border-[#d7e1d7] bg-white p-6 sm:p-8"><h1 className="mt-7 text-2xl font-semibold">المتابعة بحسابك الموحد</h1><p className="mt-4 break-words text-sm" dir="ltr">{consent.email}</p><p className="mt-4 text-sm leading-7">سيستخدم أول سعودي البيانات التالية من حساب تواصل النخبة لتسجيل دخولك:</p><ul className="mt-4 list-inside list-disc space-y-3 text-sm">{consent.scope.split(' ').filter(Boolean).map(scope=><li key={scope}>{scopes[scope]??scope}</li>)}</ul><form action="/api/oauth/decision" method="post" className="mt-6 flex flex-wrap gap-3"><input type="hidden" name="authorization_id" value={authorizationId}/><button name="decision" value="approve" className="rounded-lg bg-[#155e3f] px-5 py-3 text-sm font-semibold text-white">السماح والمتابعة</button><button name="decision" value="deny" className="rounded-lg border border-[#8ca292] px-5 py-3 text-sm">إلغاء</button><button name="decision" value="switch" className="py-3 text-sm underline underline-offset-4">استخدام حساب آخر</button></form></section></First1Shell>
}

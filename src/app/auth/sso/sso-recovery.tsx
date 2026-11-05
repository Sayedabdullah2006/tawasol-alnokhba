'use client'
import { useEffect } from 'react'
import First1Shell from './first1-shell'
const restart='https://www.first1saudi.net/services/auth/start?return=%2Fservices%2Faccount'
export default function SsoRecovery({reason,retryHref}:{reason:'expired'|'unavailable'|'invalid';retryHref?:string}) {
 useEffect(()=>{
  if(reason!=='expired')return
  // One automatic restart per two minutes prevents loops across both sites.
  try{const key='first1-sso-recovery-at',last=Number(sessionStorage.getItem(key)||0);if(Date.now()-last<120000)return;sessionStorage.setItem(key,String(Date.now()));window.location.replace(restart)}catch{/* Manual continuation remains available when browser storage is unavailable. */}
 },[reason])
 return <First1Shell><section className="w-full max-w-md rounded-xl border border-[#d7e1d7] bg-white p-6 sm:p-8"><h1 className="text-2xl font-semibold">{reason==='unavailable'?'لنكمل تسجيل دخولك':'المتابعة إلى أول سعودي'}</h1><p className="mt-4 text-sm leading-7 text-[#53655a]">{reason==='unavailable'?'تعذر الاتصال مؤقتًا. يمكنك إعادة المحاولة.':'اضغط متابعة لإكمال الدخول بأمان.'}</p><a className="mt-6 block rounded-lg bg-[#155e3f] px-5 py-3 text-center font-semibold text-white" href={reason==='unavailable'&&retryHref?retryHref:restart}>{reason==='unavailable'?'إعادة المحاولة':'متابعة'}</a><a className="mt-5 inline-block text-sm underline underline-offset-4" href="https://www.first1saudi.net/">العودة إلى الموقع</a></section></First1Shell>
}

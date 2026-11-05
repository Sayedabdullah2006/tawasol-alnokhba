'use client'
import { useEffect, useState } from 'react'
import TurnstileWidget from '@/components/ui/TurnstileWidget'
export default function SsoCaptcha({onVerify,onExpire}:{onVerify:(token:string)=>void;onExpire:()=>void}){
 const [attempt,setAttempt]=useState(0),[phase,setPhase]=useState<'loading'|'waiting'|'verified'|'error'>('loading'),[slow,setSlow]=useState(false)
 useEffect(()=>{const timeout=setTimeout(()=>setSlow(true),15000);return()=>clearTimeout(timeout)},[attempt])
 function retry(){onExpire();setPhase('loading');setSlow(false);if(!window.turnstile)document.getElementById('cf-turnstile-script')?.remove();setAttempt(n=>n+1)}
 return <div><TurnstileWidget key={attempt} onReady={()=>setPhase(p=>p==='verified'?p:'waiting')} onVerify={token=>{setPhase('verified');onVerify(token)}} onExpire={()=>{setPhase('waiting');onExpire()}} onError={()=>{setPhase('error');onExpire()}}/>{phase!=='verified'&&<p role="status" className="mt-3 text-center text-sm leading-7 text-[#53655a]">{phase==='loading'?'جارٍ تحميل التحقق الأمني…':phase==='error'?'تعذر تحميل التحقق الأمني. أعد المحاولة.':'أكمل التحقق الأمني للمتابعة.'}</p>}{phase!=='verified'&&(phase==='error'||slow)&&<button type="button" className="mt-2 w-full rounded-lg border border-[#8ca292] px-3 py-2 text-sm" onClick={retry}>إعادة تحميل التحقق الأمني</button>}</div>
}

'use client'
import { useEffect, useRef, useState } from 'react'
interface Props { onVerify:(token:string)=>void;onExpire?:()=>void;onReady?:()=>void;onError?:()=>void }
declare global { interface Window { turnstile?:{render:(el:HTMLElement,opts:Record<string,unknown>)=>string;reset:(id?:string)=>void;remove:(id:string)=>void};onTurnstileLoad?:()=>void } }
const SCRIPT_URL='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad',SCRIPT_ID='cf-turnstile-script'
export default function TurnstileWidget(props:Props){
 const siteKey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,containerRef=useRef<HTMLDivElement>(null),widgetIdRef=useRef<string|null>(null),callbacks=useRef(props)
 const [scriptReady,setScriptReady]=useState(false)
 useEffect(()=>{callbacks.current=props},[props])
 useEffect(()=>{
  if(!siteKey)return
  let active=true
  if(window.turnstile){queueMicrotask(()=>{if(active)setScriptReady(true)});return()=>{active=false}}
  const ready=()=>{if(active&&window.turnstile)setScriptReady(true)}
  if(!document.getElementById(SCRIPT_ID)){window.onTurnstileLoad=ready;const script=document.createElement('script');script.id=SCRIPT_ID;script.src=SCRIPT_URL;script.async=true;script.defer=true;script.onerror=()=>{if(active)callbacks.current.onError?.()};document.head.appendChild(script)}
  // Also handles an SDK loaded between React render and effect, or by another widget.
  const interval=setInterval(ready,100)
  return()=>{active=false;clearInterval(interval)}
 },[siteKey])
 useEffect(()=>{
  if(!siteKey||!scriptReady||!containerRef.current||!window.turnstile)return
  try{widgetIdRef.current=window.turnstile.render(containerRef.current,{sitekey:siteKey,theme:'light',size:'normal',callback:(token:string)=>callbacks.current.onVerify(token),'expired-callback':()=>callbacks.current.onExpire?.(),'error-callback':()=>{callbacks.current.onExpire?.();callbacks.current.onError?.()}});callbacks.current.onReady?.()}catch{callbacks.current.onExpire?.();callbacks.current.onError?.()}
  return()=>{if(widgetIdRef.current&&window.turnstile){try{window.turnstile.remove(widgetIdRef.current)}catch{/* SDK may already have removed the widget. */}widgetIdRef.current=null}}
 },[siteKey,scriptReady])
 return siteKey?<div ref={containerRef} className="flex justify-center"/>:null
}

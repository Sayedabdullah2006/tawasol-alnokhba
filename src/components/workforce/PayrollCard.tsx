"use client";
import Link from "next/link";
import {useEffect,useId,useState} from "react";
import type {PayrollCardData} from "@/lib/workforce/payroll-attendance";
import {fromCents,moneyCents} from "@/lib/workforce/payroll";
const money=(value:string)=>Number(value).toLocaleString("ar-SA",{minimumFractionDigits:2,maximumFractionDigits:2});
const duration=(value:number)=>{const seconds=Math.max(0,Math.round(value));return `${Math.floor(seconds/3600)} س ${Math.floor(seconds%3600/60)} د${seconds%60?` ${seconds%60} ث`:""}`;};
export default function PayrollCard({initial,month,employeeId,preview=false}:{initial:PayrollCardData|null;month:string;employeeId?:string;preview?:boolean}) {
 const [remote,setRemote]=useState<{initial:PayrollCardData|null;value:PayrollCardData|null}|null>(null),[open,setOpen]=useState(false),[error,setError]=useState("");const tip=useId();
 const data=remote&&remote.initial===initial?remote.value:initial;
 useEffect(()=>{
  if(!employeeId)return;
  const abort=new AbortController();let running=false;
  const refresh=async()=>{if(running||document.hidden)return;running=true;try{
   const response=await fetch(`/api/workforce/employees/${employeeId}/payroll?month=${month.slice(0,7)}`,{cache:"no-store",signal:abort.signal});
   const result=await response.json();if(!response.ok)throw Error(result.error||"تعذر تحديث المستحقات");setRemote({initial,value:result.statement});setError("");
  }catch(e){if((e as Error).name!=="AbortError")setError("تعذر تحديث المستحقات");}finally{running=false;}};
  const timer=setInterval(()=>void refresh(),60000);const listener=()=>void refresh();
  window.addEventListener("workforce-data-changed",listener);window.addEventListener("focus",listener);document.addEventListener("visibilitychange",listener);
  return()=>{abort.abort();clearInterval(timer);window.removeEventListener("workforce-data-changed",listener);window.removeEventListener("focus",listener);document.removeEventListener("visibilitychange",listener);};
 },[employeeId,month,initial]);
 const detail=data?.attendance_details;
 return <section id="payroll-preview" aria-label="مستحقاتي الخاصة" className="flex min-w-0 flex-col rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-100/80 p-5 text-emerald-950 shadow-lg sm:p-6">
  <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-black">مستحقاتي</h2><span aria-hidden className="text-xl">◈</span></div>
  <div className="flex flex-wrap justify-between gap-2 text-xs"><span>{new Date(`${month.slice(0,7)}-01T12:00:00+03:00`).toLocaleDateString("ar-SA",{calendar:"gregory",month:"long",year:"numeric"})}</span>{data&&<span className="rounded-full bg-white/10 px-3 py-1 font-bold">{data.status==="draft"?"غير معتمد":data.status==="paid"?"مصروف":"معتمد"}</span>}</div>
  <div className="flex-1">{data?<><div className="mt-6 rounded-2xl border border-current/10 bg-current/5 p-4"><p className="text-xs opacity-75">قبل تسوية الساعات</p><p className="mt-2 flex flex-wrap items-baseline gap-2"><strong className="text-xl font-bold tabular-nums">{money(fromCents(moneyCents(String(data.total_amount))+moneyCents(String(data.attendance_amount))))}</strong><span className="text-xs">ر.س</span></p></div><div className="mt-6 flex items-center gap-2"><p className="text-sm font-bold">الراتب المستحق</p>
   <span className="relative inline-flex" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}>
    <button type="button" aria-label="تفاصيل احتساب الراتب" aria-describedby={open?tip:undefined} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onKeyDown={e=>{if(e.key==="Escape")setOpen(false);}} className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-current/30 text-xs font-black focus-visible:outline-2 focus-visible:outline-offset-2">i</button>
    {open&&<span role="tooltip" id={tip} className="absolute bottom-full left-1/2 -translate-x-1/2 z-50 mb-2 block w-[min(20rem,75vw)] rounded-2xl border border-white/20 bg-[#0b2038] p-4 text-right text-xs text-white shadow-2xl">
     <span className="mb-3 block font-bold">{detail?.through?`حتى ${detail.through}`:"لم يكتمل يوم احتساب بعد"}</span>
     {[["إجمالي الشهر",`${money(data.gross_amount)} ر.س`],["الساعات المطلوبة",duration(detail?.required_seconds??0)],["المحتسب بحد ٨ س/يوم",duration(detail?.credited_seconds??0)],["الساعات غير المستوفاة",duration(detail?.missing_seconds??0)],["قيمة الساعة",detail?.hourly_rate?`${Number(detail.hourly_rate).toLocaleString('ar-SA',{maximumFractionDigits:6})} ر.س`:"—"],["تسوية الساعات",`${money(data.attendance_amount)} ر.س`]].map(([label,value])=><span key={label} className="mt-2 flex justify-between gap-4"><span className="text-slate-300">{label}</span><strong>{value}</strong></span>)}
     {Number(detail?.unapplied_amount??0)>0&&<span className="mt-3 block text-amber-200">تسوية تتجاوز الرصيد المتاح: {money(detail!.unapplied_amount!)} ر.س</span>}
    </span>}
   </span></div><p className="mt-2 flex flex-wrap items-baseline gap-2"><strong className="text-3xl font-black tabular-nums">{money(data.total_amount)}</strong><span className="text-sm">ر.س</span></p><div className="mt-6 flex justify-between gap-2 text-sm"><span>المصروف</span><strong>{money(data.paid_amount)} ر.س</strong></div></>:<p className="py-8 text-sm">لا يوجد كشف لهذا الشهر</p>}</div>
  {error&&<p role="status" className="mt-3 text-xs">{error}</p>}
  {!preview&&<Link href="/employee/finance/overview" className="mt-5 flex justify-between border-t border-current/10 pt-4 text-sm font-bold hover:underline"><span>عرض كشف المستحقات</span><span aria-hidden>←</span></Link>}
 </section>;
}

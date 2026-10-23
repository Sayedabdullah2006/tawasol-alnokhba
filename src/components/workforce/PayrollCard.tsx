"use client";
import Link from "next/link";
import {useEffect,useId,useState} from "react";
import {splitAttendanceAdjustment} from "@/lib/workforce/payroll-attendance";
import type {PayrollCardData} from "@/lib/workforce/payroll-attendance";
import {fromCents,moneyCents} from "@/lib/workforce/payroll";
const money=(value:string)=>Number(value).toLocaleString("ar-SA",{minimumFractionDigits:2,maximumFractionDigits:2});
const duration=(value:number)=>{const seconds=Math.max(0,Math.round(value));return `${Math.floor(seconds/3600)} س ${Math.floor(seconds%3600/60)} د${seconds%60?` ${seconds%60} ث`:""}`;};
export default function PayrollCard({initial,month,employeeId,preview=false,title="مستحقاتي",cardId="payroll-preview"}:{initial:PayrollCardData|null;month:string;employeeId?:string;preview?:boolean;title?:string;cardId?:string}) {
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
 const detail=data?.attendance_details,accrual=data?.daily_accrual;
 const adjustment=splitAttendanceAdjustment(accrual?.attendance_amount??data?.attendance_amount??"0",detail?.sick_leave?.amount??"0");
 const overtime=String(data?.overtime_amount??0);
 const accruing=!!accrual&&!accrual.closed;
 const insurance=data?.deductions?.filter(d=>d.kind==='insurance')??[];
 const other=data?.deductions?.filter(d=>d.kind!=='insurance')??[];
 const sum=(rows:{amount:string}[])=>fromCents(rows.reduce((n,row)=>n+moneyCents(String(row.amount)),BigInt(0)));

 return <section style={{backdropFilter:"none",WebkitBackdropFilter:"none"}} data-work-summary-card="payroll" id={cardId} aria-label={title} className="flex min-w-0 flex-1 flex-col rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-100/80 p-5 text-emerald-950 shadow-lg sm:p-6">
  <div className="mb-5 flex items-center justify-between gap-3"><h2 className="whitespace-nowrap text-base font-black">{title}</h2><span aria-hidden className="text-xl">◈</span></div>
  <div className="flex justify-between gap-2 whitespace-nowrap text-[11px]"><span>{new Date(`${month.slice(0,7)}-01T12:00:00+03:00`).toLocaleDateString("ar-SA",{calendar:"gregory",month:"long",year:"numeric"})}</span>{data&&<span className="rounded-full bg-white/10 px-3 py-1 font-bold">{data.status==="draft"?"غير معتمد":data.status==="paid"?"مصروف":"معتمد"}</span>}</div>
  <div className="flex-1">{data?<><div className="mt-6 rounded-2xl border border-current/10 bg-current/5 p-4"><p className="text-xs opacity-75">إجمالي الراتب</p><p className="mt-2 flex items-baseline gap-1.5 whitespace-nowrap"><strong className="text-lg font-bold tabular-nums">{money(fromCents(moneyCents(String(data.gross_amount))-moneyCents(overtime)))}</strong><span className="text-xs">ر.س</span></p></div><dl className="mt-4 space-y-3 whitespace-nowrap border-b border-current/15 pb-4 text-xs">{accruing&&<div className="flex justify-between gap-2"><dt>الراتب حتى اليوم</dt><dd className="font-bold">{money(fromCents(moneyCents(String(accrual.gross_amount))-moneyCents(overtime)))} ر.س</dd></div>}{Number(overtime)>0&&<div className="flex justify-between gap-2 text-emerald-700"><dt>خارج دوام</dt><dd className="font-bold">+ {money(overtime)} ر.س</dd></div>}{Number(data.reimbursement_amount??0)>0&&<div className="flex justify-between gap-2 font-bold"><dt>تعويض مصروفات العمل</dt><dd className="font-bold">+ {money(String(data.reimbursement_amount))} ر.س</dd></div>}<div className="flex items-center justify-between gap-2"><dt>التأمينات{data.insurance_details?` ${Number(data.insurance_details.rate).toLocaleString("ar-SA")}٪`:""}</dt><dd dir="ltr" className="font-bold">{insurance.length?`− ${money(accrual?.insurance_amount??sum(insurance))} ر.س`:"غير محددة"}</dd></div>{other.length>0&&<div className="flex justify-between gap-2"><dt>استقطاعات أخرى</dt><dd dir="ltr" className="font-bold">− {money(accrual?.other_amount??sum(other))} ر.س</dd></div>}<div className="flex justify-between gap-2"><dt>تسوية الساعات</dt><dd dir="ltr" className="font-bold">− {money(adjustment.hours)} ر.س</dd></div>{Number(adjustment.sick)>0&&<div className="flex justify-between gap-2"><dt>تسوية أجر المرضية</dt><dd dir="ltr" className="font-bold">− {money(adjustment.sick)} ر.س</dd></div>}</dl><div className="mt-5 flex items-center gap-2"><p className="whitespace-nowrap text-xs font-bold">{insurance.length?(accruing?"صافي المستحق حتى اليوم":"صافي المستحق"):(accruing?"المستحق حتى اليوم قبل التأمينات":"المستحق قبل التأمينات")}</p>
   <span className="relative inline-flex" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}>
    <button type="button" aria-label="تفاصيل احتساب الراتب" aria-describedby={open?tip:undefined} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onKeyDown={e=>{if(e.key==="Escape")setOpen(false);}} className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current/30 text-xs font-black focus-visible:outline-2 focus-visible:outline-offset-2">i</button>
    {open&&<span role="tooltip" id={tip} className="absolute bottom-full left-1/2 -translate-x-1/2 z-50 mb-2 block w-[min(20rem,75vw)] rounded-2xl border border-white/20 bg-[#0b2038] p-4 text-right text-xs text-white shadow-2xl">
     <span className="mb-3 block font-bold">{accrual?.through?`من ${accrual.starts_on} حتى ${accrual.through}`:detail?.through?`حتى ${detail.through}`:"لم يكتمل يوم احتساب بعد"}</span>
     {[["إجمالي الراتب",`${money(fromCents(moneyCents(String(data.gross_amount))-moneyCents(overtime)))} ر.س`],...(accrual?[["المتراكم قبل الاستقطاعات",`${money(fromCents(moneyCents(String(accrual.gross_amount))-moneyCents(overtime)))} ر.س`]]:[]),...(data.insurance_details?[["الخاضع للتأمينات لفترة الشهر",`${money(data.insurance_details.basis_amount)} ر.س`]]:[]),["الساعات المطلوبة",duration(detail?.required_seconds??0)],["المحتسب بحد ٨ س/يوم",duration(detail?.credited_seconds??0)],["الساعات غير المستوفاة",duration(detail?.missing_seconds??0)],["قيمة الساعة",detail?.hourly_rate?`${Number(detail.hourly_rate).toLocaleString('ar-SA',{maximumFractionDigits:6})} ر.س`:"—"],["تسوية الساعات",`${money(adjustment.hours)} ر.س`],...(Number(adjustment.sick)>0?[["تسوية أجر المرضية",`${money(adjustment.sick)} ر.س`]]:[])].map(([label,value])=><span key={label} className="mt-2 flex justify-between gap-4"><span className="text-slate-300">{label}</span><strong>{value}</strong></span>)}
     {Number(detail?.unapplied_amount??0)>0&&<span className="mt-3 block text-amber-200">تسوية تتجاوز الرصيد المتاح: {money(detail!.unapplied_amount!)} ر.س</span>}
    </span>}
   </span></div><p className="mt-2 flex items-baseline gap-1.5 whitespace-nowrap"><strong className="text-2xl font-black tabular-nums">{money(accrual?.total_amount??data.total_amount)}</strong><span className="text-sm">ر.س</span></p>{Number(data.paid_amount)>0&&<div className="mt-6 flex justify-between gap-2 whitespace-nowrap text-xs"><span>المصروف</span><strong>{money(data.paid_amount)} ر.س</strong></div>}</>:<p className="py-8 text-sm">لا يوجد كشف لهذا الشهر</p>}</div>
  {error&&<p role="status" className="mt-3 text-xs">{error}</p>}
  {!preview&&<Link href="/employee/finance/overview" className="mt-5 flex justify-between border-t border-current/10 pt-4 text-sm font-bold hover:underline"><span>عرض كشف المستحقات</span><span aria-hidden>←</span></Link>}
 </section>;
}

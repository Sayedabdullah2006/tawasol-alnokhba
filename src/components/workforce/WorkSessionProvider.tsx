"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "./shared";
import {isFriday,type WorkSnapshot,type WorkCommand,type WorkInput} from "@/lib/workforce/work-session";
import {paidHolidayAt} from '@/lib/workforce/calendar';
import { CLOSE_REASONS } from "@/lib/workforce/work-session";
import { attendanceDuration } from "@/lib/workforce/attendance-summary";
import { attendanceExemptPath, OFF_DUTY_REQUESTS } from "@/lib/workforce/action-access";

type Transport={read:()=>Promise<WorkSnapshot>;write:(input:WorkInput)=>Promise<WorkSnapshot>};
const transport:Transport={read:()=>api("/api/workforce/work-session"),write:input=>api("/api/workforce/work-session",{method:"POST",body:JSON.stringify(input)})};
type State={data:WorkSnapshot|null;busy:boolean;error:string;clockOffset:number;command:(command:WorkCommand,extra?:{task_id?:string;title?:string})=>Promise<void>};
const Context=createContext<State|null>(null);
export const useWorkSession=()=>useContext(Context);
export default function WorkSessionProvider({children,adapter=transport}:{children:ReactNode;adapter?:Transport}) {
 const [data,setData]=useState<WorkSnapshot|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[clockOffset,setClockOffset]=useState(0);
 const latest=useRef(data),lock=useRef(false),retry=useRef<{signature:string;input:WorkInput}|null>(null);
 const [blocked,setBlocked]=useState("");
 const router=useRouter();
 const accept=useCallback((snapshot:WorkSnapshot)=>{setClockOffset(Date.parse(snapshot.now)-Date.now());latest.current=snapshot;setData(snapshot);},[]);
 const command=useCallback(async(command:WorkCommand,extra:{task_id?:string;title?:string}={})=>{
  if(lock.current)return;lock.current=true;setBusy(command!=="heartbeat");
  const signature=JSON.stringify({command,session:latest.current?.session?.id??null,...extra});
  if(retry.current?.signature!==signature) retry.current={signature,input:{command,request_key:crypto.randomUUID(),session_id:latest.current?.session?.id??null,...extra}};
  try {const result=await adapter.write(retry.current.input);accept(result);setError("");retry.current=null;
   if(result.session&&!result.session.break_started_at&&result.canControl!==false) setBlocked("");
   if(command!=="heartbeat") {window.dispatchEvent(new Event("workforce-data-changed"));router.refresh();}
   else if(!result.session) {window.dispatchEvent(new Event("workforce-data-changed"));router.refresh();}
  } catch(e){
   // Another tab may have checked out and opened a new session. Never replay a
   // stale action against it; reload its state and keep all session IDs explicit.
   if(command==="heartbeat") {try{accept(await adapter.read());setError("");}catch{setError((e as Error).message);}}
   else setError((e as Error).message);
  } finally{lock.current=false;setBusy(false);}
 },[adapter,accept,router]);
 useEffect(()=>{
  let live=true;
  const read=()=>{if(lock.current)return;adapter.read().then(d=>{if(live)accept(d)}).catch(e=>{if(live)setError(e.message)});};
  read();
  const heartbeat=()=>{if(latest.current?.session&&latest.current.canControl!==false)void command("heartbeat");else read();};
  const timer=setInterval(heartbeat,60000);
  const refresh=()=>read();
  window.addEventListener("online",heartbeat);window.addEventListener("focus",heartbeat);window.addEventListener("workforce-data-changed",refresh);
  return()=>{live=false;clearInterval(timer);window.removeEventListener("online",heartbeat);window.removeEventListener("focus",heartbeat);window.removeEventListener("workforce-data-changed",refresh);};
 },[adapter,accept,command]);
 useEffect(()=>{
  if(!data?.session||data.canControl===false)return;
  const s=data.session;
  if(s.policy_version!==1)return;
  const seen=Math.max(Date.parse(s.last_seen_at!),s.break_paid_until?Date.parse(s.break_paid_until):0);
  const deadline=Math.min(Date.parse(s.cutoff_at!),seen+300000,s.break_started_at?Infinity:Date.parse(s.next_confirmation_at!)+300000);
  const timer=setTimeout(()=>void command("heartbeat"),Math.max(0,deadline-Date.parse(data.now))+50);
  return()=>clearTimeout(timer);
 },[data,command]);
 useEffect(()=>{
  const attempt=(raw:Event)=>{
   const event=raw as CustomEvent<{url:string;options:RequestInit;message:string}>;
   const path=new URL(event.detail.url,window.location.origin).pathname;
   if(!path.startsWith("/api/workforce/"))return;
   if(attendanceExemptPath(path)){
    if(path!=="/api/workforce/requests"||event.detail.options.method?.toUpperCase()!=="POST")return;
    const form=event.detail.options.body;
    if(form instanceof FormData&&OFF_DUTY_REQUESTS.has(String(form.get("kind"))))return;
   }
   const d=latest.current,s=d?.session,now=Date.now()+clockOffset;
   const closed=new Date(now).toLocaleTimeString('en-GB',{timeZone:'Asia/Riyadh',hour12:false,hour:'2-digit',minute:'2-digit'})>='17:00'&&!(d?.overtimeWindow&&now<Date.parse(d.overtimeWindow.ends_at));
   const message=!d?"جارٍ التحقق من الحضور":!s?isFriday(now)||d.paidHoliday||paidHolidayAt(now)?"اليوم إجازة؛ تسجيل الحضور غير متاح":closed?"انتهى دوام اليوم؛ العمل يتطلب خارج دوام معتمد":"سجلي الحضور لبدء العمل":d.canControl===false?"إجراءات العمل متاحة من جهاز تسجيل الحضور فقط":now>=Date.parse(s.cutoff_at??"")?"انتهت جلسة الدوام؛ سجلي الحضور مجددًا":s.break_started_at?"استأنفي العمل لإنهاء الاستراحة":now>=Date.parse(s.next_confirmation_at??"")?"أكدي استمرار العمل أولًا":"";
   if(message){event.preventDefault();event.detail.message=message;setBlocked(message);}
  };
  window.addEventListener("workforce-action-attempt",attempt);
  return()=>window.removeEventListener("workforce-action-attempt",attempt);
 },[clockOffset]);
 const localNow=Date.now()+clockOffset;
 const pastCutoff=new Date(localNow).toLocaleTimeString('en-GB',{timeZone:'Asia/Riyadh',hour12:false,hour:'2-digit',minute:'2-digit'})>='17:00';
 const overtimeAllowed=!!data?.overtimeWindow&&localNow<Date.parse(data.overtimeWindow.ends_at);
 const checkinUnavailable=!data||isFriday(localNow)||!!(data.paidHoliday??paidHolidayAt(localNow))||pastCutoff&&!overtimeAllowed;
 return <Context.Provider value={{data,busy,error,command,clockOffset}}>{children}{blocked&&<WorkConfirmation titleId="work-action-title"><h2 id="work-action-title" className="text-xl font-black">{blocked}</h2><div className="mt-5 flex flex-wrap justify-center gap-3">{data?.canControl!==false&&<button type="button" disabled={busy||!data?.session&&checkinUnavailable} className="rounded-xl bg-[#dcb969] px-5 py-3 font-bold text-[#0c2039] disabled:opacity-40" onClick={()=>void command(!data?.session?"in":data.session.break_started_at?"resume":"confirm")}>{!data?.session?checkinUnavailable?"تسجيل الحضور غير متاح":overtimeAllowed?"تسجيل حضور خارج الدوام":"تسجيل الحضور":data.session.break_started_at?"استئناف العمل":"تأكيد الاستمرار"}</button>}<button type="button" className="rounded-xl border border-white/30 px-5 py-3" onClick={()=>setBlocked("")}>متابعة المشاهدة</button></div>{!data?.session&&pastCutoff&&!overtimeAllowed&&<Link href="/employee/requests/overtime" onClick={()=>setBlocked("")} className="mt-4 inline-block text-sm font-bold text-amber-200">طلب خارج دوام ←</Link>}{error&&<p role="alert" className="mt-3 text-rose-200">{error}</p>}</WorkConfirmation>}</Context.Provider>;
}

export function WorkStartButton({taskId}:{taskId:string}){
 const state=useWorkSession();if(!state)return null;
 const active=state.data?.session && state.data.active?.task_id===taskId;
 const eligible=state.data?.tasks.some(task=>task.id===taskId);
 return <button type="button" title={!state.data?.session?"سجلي الحضور أولًا":state.data.canControl===false?"التحكم من جهاز الدوام":state.data.session.break_started_at?"استأنفي العمل أولًا":undefined} disabled={state.busy||state.data?.canControl===false||!state.data?.session||!!state.data?.session?.break_started_at||active===true||!eligible} onClick={()=>void state.command("task",{task_id:taskId})} className="rounded-xl border border-amber-200/40 bg-amber-200/15 px-4 py-2 text-xs font-bold disabled:opacity-45">{active?"تعملين عليها الآن":"بدء العمل"}</button>;
}

function WorkConfirmation({children,titleId="work-confirm-title"}:{children:ReactNode;titleId?:string}) {
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal();},[]);
 return <dialog ref={dialog} aria-labelledby={titleId} onCancel={e=>e.preventDefault()} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-amber-200/40 bg-[#10243c] p-7 text-center text-white shadow-2xl backdrop:bg-black/75">{children}</dialog>;
}

export function WorkSessionBar({embedded=false}:{embedded?:boolean}={}){
 const state=useWorkSession();
 const [expanded,setExpanded]=useState(false),[task,setTask]=useState(""),[activity,setActivity]=useState(""),[tick,setTick]=useState(0);
 useEffect(()=>{const timer=setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(timer)},[]);
 if(!state)return null;
 const {data,busy,error,command}=state;
 if(!data)return <div className="mx-4 mb-4 rounded-2xl border border-white/15 p-4 text-sm" role={error?"alert":"status"}>{error||"جارٍ تحميل الدوام…"}</div>;
 const now=Math.max(Date.parse(data.now),tick?tick+state.clockOffset:0),session=data.session,segment=data.active;
 const afterHours=new Date(now).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Riyadh"})>="17:00";
 const approvedOvertime=!!data.overtimeWindow&&now<Date.parse(data.overtimeWindow.ends_at);
 const holiday=data.paidHoliday??paidHolidayAt(now),dayOff=isFriday(now)||!!holiday,onBreak=!!session?.break_started_at;
 const due=!dayOff&&data.canControl!==false&&!!session?.next_confirmation_at && !onBreak && now>=Date.parse(session.next_confirmation_at);
 const remaining=onBreak?Math.max(0,(Date.parse(session!.break_paid_until!)-now)/60000):Math.max(0,30-data.breakUsedSeconds/60);
 const action="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold transition hover:bg-white/20 disabled:opacity-40";
 return <section className={`portal-panel rounded-3xl border border-white/15 bg-[#10243c]/95 p-4 shadow-xl ${embedded?"":"mx-4 mb-5 sm:mx-6"}`} aria-label="جلسة دوامي">
  <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2 text-xs font-bold"><span className={`h-2 w-2 rounded-full ${session?onBreak?"bg-amber-300":"bg-emerald-300":"bg-slate-400"}`}/>{dayOff?(holiday?`${holiday} · إجازة مدفوعة`:"الجمعة إجازة"):session?onBreak?"في استراحة":session.overtime_request_id?"خارج دوام معتمد":"الدوام جارٍ":data.lastSession?.close_reason?data.lastSession.overtime_request_id&&data.lastSession.close_reason==="day_end"?"انتهت فترة خارج الدوام":CLOSE_REASONS[data.lastSession.close_reason]:"خارج الدوام · للعرض فقط"}{!dayOff&&<span className="mr-2 opacity-60">{session?.overtime_request_id||approvedOvertime?`حتى ${new Date(session?.cutoff_at??data.overtimeWindow!.ends_at).toLocaleTimeString("ar-SA",{timeZone:"Asia/Riyadh",hour:"2-digit",minute:"2-digit"})}`:"النهاية 5 مساءً"}</span>}</div>{!dayOff&&<p className="mt-2 truncate text-sm font-black">{session?segment?.title||"اختاري مهمتك التالية":"سجلي الحضور ثم اختاري المهمة"}</p>}</div>
   <div className="flex flex-wrap gap-2">{!session?<button className={`${action} !bg-[#dcb969] !text-[#0c2039]`} disabled={busy||(afterHours&&!approvedOvertime)||dayOff} onClick={()=>void command("in")}>{!dayOff&&afterHours&&!approvedOvertime?"انتهى دوام اليوم":approvedOvertime?"تسجيل حضور خارج الدوام":"تسجيل الحضور"}</button>:<>
    {data.canControl===false?<span className="text-xs text-amber-200">التحكم من جهاز الدوام</span>:<><button className={action} disabled={busy||dayOff} onClick={()=>void command(onBreak?"resume":"break")}>{onBreak?"استئناف العمل":"استراحة"}</button>
    <button className={action} disabled={busy||dayOff} onClick={()=>void command("out")}>تسجيل الانصراف</button>
    <button className={action} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}> {expanded?"طي":"المهمة والنشاط"} </button></>}
   </>}</div>
  </div>
  {onBreak&&<div className="mt-3 flex flex-wrap justify-between gap-2 rounded-xl bg-amber-300/10 p-3 text-xs"><strong>{remaining>0?`المتبقي من الاستراحة المدفوعة ${Math.ceil(remaining)} دقيقة`:"انتهت الاستراحة المدفوعة · الوقت الإضافي غير محتسب"}</strong><span>اضغطي استئناف العمل عند العودة</span></div>}
  {session&&!onBreak&&<p className="mt-2 text-[11px] opacity-65">{Date.parse(session.next_confirmation_at!)<Date.parse(session.cutoff_at!)?"تأكيد الاستمرار":"نهاية الدوام"} {new Date(session.next_confirmation_at!).toLocaleTimeString("ar-SA",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Riyadh"})}{segment&&` · فترة النشاط ${attendanceDuration(Math.max(0,(now-Date.parse(segment.starts_at))/60000))}`}</p>}
  {data.canControl!==false&&(expanded||session&&(!segment||segment.kind==="unallocated"))&&!onBreak&&session&&<div className="mt-4 grid gap-3 border-t border-white/10 pt-4 lg:grid-cols-2">
    <div className="flex flex-wrap gap-2"><select aria-label="المهمة الحالية" value={task} onChange={e=>setTask(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/20 bg-[#10243c] p-3 text-sm"><option value="">بماذا ستبدئين؟</option>{data.tasks.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select><button className={action} disabled={busy||!task} onClick={()=>void command("task",{task_id:task})}>بدء العمل</button></div>
    <div className="flex flex-wrap gap-2"><input aria-label="عنوان النشاط الآخر" placeholder="اجتماع، اتصال عميل، عمل إداري" maxLength={200} value={activity} onChange={e=>setActivity(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/20 bg-[#10243c] p-3 text-sm"/><button className={action} disabled={busy||activity.trim().length<3} onClick={()=>void command("activity",{title:activity})}>بدء نشاط آخر</button></div>
   </div>}
  {session&&segment?.task_id&&<Link href={`/employee/work/tasks/${segment.task_id}`} className="mt-3 inline-block text-xs font-bold text-amber-200">فتح المهمة والتسليم ←</Link>}
  {error&&<p role="alert" className="mt-3 text-sm text-rose-200">{error}</p>}
  {due&&<WorkConfirmation><span className="text-3xl" aria-hidden>◷</span><h2 id="work-confirm-title" className="mt-4 text-xl font-black">هل ما زلت تعملين؟</h2><p className="mt-3 text-sm opacity-80">{segment?.title}</p><p className="mt-2 text-xs text-amber-200">المتبقي للتأكيد {Math.max(0,Math.ceil((Date.parse(session!.next_confirmation_at!)+300000-now)/60000))} دقائق</p><button className={`${action} mt-6 !bg-[#dcb969] !text-[#0c2039]`} disabled={busy} onClick={()=>void command("confirm")}>أواصل العمل</button>{error&&<p role="alert" className="mt-3 text-sm text-rose-200">{error}</p>}</WorkConfirmation>}
 </section>;
}

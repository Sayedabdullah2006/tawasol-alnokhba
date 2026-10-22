"use client";
import {useMemo,useState} from "react";
import PortalScreen from "@/components/layout/PortalScreen";
import WorkSessionProvider,{WorkSessionBar} from "@/components/workforce/WorkSessionProvider";
import AttendanceProgressCard from "@/components/workforce/AttendanceProgressCard";
import EmployeeFocus from "@/components/workforce/EmployeeFocus";
import type {WorkSnapshot,WorkInput} from "@/lib/workforce/work-session";
import type {AttendanceSummary} from "@/lib/workforce/attendance-summary";
type PreviewSnapshot=WorkSnapshot&{summary:AttendanceSummary};
export default function WorkSessionPreview(){
 const [employee,setEmployee]=useState("noor"),[data,setData]=useState<PreviewSnapshot|null>(null),[revision,setRevision]=useState(0),[error,setError]=useState("");
 const base=`http://127.0.0.1:3122`,query=`?employee=${employee}`;
 const adapter=useMemo(()=>{
  const request=async(path="",body?:unknown)=>{const response=await fetch(`${base}${path}${query}`,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined});const result=await response.json();if(!response.ok)throw Error(result.error);setData(result);return result;};
  return{read:()=>request(),write:(input:WorkInput)=>request("",input),advance:(minutes:number,connected:boolean)=>request('/advance',{minutes,connected}),reset:()=>request('/reset',{})};
 },[query,base]);
 async function advance(minutes:number,connected:boolean){try{await adapter.advance(minutes,connected);window.dispatchEvent(new Event('workforce-data-changed'));setError("");}catch(e){setError((e as Error).message);}}
 return <PortalScreen area="employee"><div className="mx-auto w-full max-w-[1500px] p-5" dir="rtl">
  <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/15 bg-[#10243c]/95 p-5"><div><p className="text-xs text-amber-200">معاينة محلية معزولة · لا رسائل ولا بيانات فعلية</p><h1 className="mt-2 text-2xl font-black">مساحة {employee==='noor'?'نور':'منوه'}</h1></div><nav className="flex flex-wrap gap-3 text-sm font-bold"><span>ملفي الوظيفي</span><span>مهامي</span><span>الحضور والطلبات</span><span>مركز المعرفة</span></nav><select aria-label="الموظفة في المعاينة" value={employee} onChange={e=>{setEmployee(e.target.value);setData(null);setRevision(r=>r+1)}} className="rounded-xl border border-white/20 bg-[#10243c] p-3"><option value="noor">نور</option><option value="monwa">منوه</option></select></header>
  <WorkSessionProvider key={`${employee}:${revision}`} adapter={adapter}><WorkSessionBar/>
   {data&&<div data-dashboard-panels className="grid gap-5 lg:grid-cols-3"><EmployeeFocus today={data.tasks.map(t=>({...t,overdue:false,deliverable:'ملف التسليم وملاحظات التنفيذ',blocked_reason:''}))} upcoming={[]} todayCount={data.tasks.length} upcomingCount={0}/><AttendanceProgressCard summary={data.summary} open={data.session} leaveDays={0}/></div>}
  </WorkSessionProvider>
  <aside className="mt-6 rounded-2xl border border-dashed border-white/20 p-4 text-xs"><strong>ساعة المعاينة: {data&&new Date(data.now).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Riyadh'})}</strong><div className="mt-3 flex flex-wrap gap-2">{[[1,'دقيقة'],[30,'نصف ساعة'],[60,'ساعة']] .map(([n,label])=><button key={n} className="rounded-xl border border-white/20 px-3 py-2" onClick={()=>void advance(Number(n),true)}>تقديم {label} مع الاتصال</button>)}<button className="rounded-xl border border-rose-200/30 px-3 py-2" onClick={()=>void advance(6,false)}>انقطاع الجهاز 6 دقائق</button><button className="rounded-xl border border-white/20 px-3 py-2" onClick={()=>void advance(Math.max(0,1020-(new Date(data?.now??Date.now()).getUTCHours()*60+new Date(data?.now??Date.now()).getUTCMinutes()+180)),true)}>الوصول للخامسة</button><button className="rounded-xl border border-white/20 px-3 py-2" onClick={()=>void adapter.reset().then(()=>setRevision(r=>r+1))}>إعادة المعاينة</button></div>{error&&<p role="alert" className="mt-2 text-rose-200">{error}</p>}</aside>
 </div></PortalScreen>;
}

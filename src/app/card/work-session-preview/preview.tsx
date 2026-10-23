"use client";
import {useMemo,useState} from "react";
import PortalScreen from "@/components/layout/PortalScreen";
import WorkSessionProvider,{WorkSessionBar} from "@/components/workforce/WorkSessionProvider";
import EmployeeWorkSummary from "@/components/workforce/EmployeeWorkSummary";
import type {LeaveBalance} from "@/lib/workforce/leave";
import type {WorkSummary} from "@/lib/workforce/work-summary";
import type {PayrollCardData} from "@/lib/workforce/payroll-attendance";
import EmployeeFocus from "@/components/workforce/EmployeeFocus";
import {isFriday,type WorkSnapshot,type WorkInput} from "@/lib/workforce/work-session";
import type {AttendanceSummary} from "@/lib/workforce/attendance-summary";
type PreviewSnapshot=WorkSnapshot&{summary:AttendanceSummary;payroll:PayrollCardData|null;fullName?:string;employeeId:string;leave:LeaveBalance};
export default function WorkSessionPreview(){
 const [view,setView]=useState("current");
 const [employee,setEmployee]=useState("noor"),[data,setData]=useState<PreviewSnapshot|null>(null),[revision,setRevision]=useState(0),[error,setError]=useState("");
 const currentDate=data?.now?new Date(data.now).toLocaleDateString('en-CA',{timeZone:'Asia/Riyadh'}):'';
 const normalize=(t:WorkSnapshot['tasks'][number])=>({...t,overdue:!!t.due_at&&Date.parse(t.due_at)<Date.parse(data!.now),deliverable:'',blocked_reason:''});
 const todays=data?.tasks.filter(t=>t.due_at&&new Date(t.due_at).toLocaleDateString('en-CA',{timeZone:'Asia/Riyadh'})<=currentDate)??[];
 const upcoming=data?.tasks.filter(t=>!todays.includes(t))??[];
 const base=`http://127.0.0.1:3122`,query=`?employee=${employee}&view=${view}`;
 const adapter=useMemo(()=>{
  const request=async(path="",body?:unknown)=>{const response=await fetch(`${base}${path}${query}`,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined});const result=await response.json();if(!response.ok)throw Error(result.error);setData(result);return result;};
  return{read:()=>request(),write:(input:WorkInput)=>request("",input),advance:(minutes:number,connected:boolean)=>request('/advance',{minutes,connected}),reset:()=>request('/reset',{})};
 },[query,base]);
 const readSummary=useMemo(()=>(id:string):Promise<WorkSummary>=>fetch(`${base}?view=current&viewer=noor&employee=${id.endsWith('2')?'monwa':'noor'}`).then(async response=>{const v=await response.json();if(!response.ok)throw Error(v.error);return {employee:{id:v.employeeId,full_name:v.fullName},summary:v.summary,open:v.session,payroll:v.payroll,leave:v.leave};}),[base]);
 const previewPeople=useMemo(()=>[{id:'20000000-0000-4000-8000-000000000001',full_name:'نور محمود باجنيد'},{id:'20000000-0000-4000-8000-000000000002',full_name:'منوه صالح سالم'}],[]);
 async function advance(minutes:number,connected:boolean){try{await adapter.advance(minutes,connected);window.dispatchEvent(new Event('workforce-data-changed'));setError("");}catch(e){setError((e as Error).message);}}
 return <PortalScreen area="employee"><div className="mx-auto w-full max-w-[1500px] p-5" dir="rtl">
  <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/15 bg-[#10243c]/95 p-5"><div><p className="text-xs text-amber-200">معاينة محلية · دون إشعارات أو إيميلات</p><h1 className="mt-2 text-2xl font-black">مساحة {data?.fullName||(employee==='noor'?'نور':'منوه')}</h1></div><nav className="flex flex-wrap gap-3 text-sm font-bold"><span>ملفي الوظيفي</span><span>مهامي</span><span>الحضور والطلبات</span><span>مركز المعرفة</span></nav><select aria-label="الموظفة في المعاينة" value={employee} onChange={e=>{setEmployee(e.target.value);setData(null);setRevision(r=>r+1)}} className="rounded-xl border border-white/20 bg-[#10243c] p-3"><option value="noor">نور</option><option value="monwa">منوه</option></select></header>
  <div className="mb-5 flex gap-3 text-xs">{[["current","الوضع الحالي"],["sandbox","تجربة التحديث"]].map(([value,label])=><button key={value} aria-pressed={view===value} className="rounded-xl border border-white/20 px-4 py-2 aria-pressed:bg-white/20" onClick={()=>{setView(value);setData(null);setRevision(r=>r+1)}}>{label}</button>)}</div>
  <WorkSessionProvider key={`${employee}:${view}:${revision}`} adapter={adapter}>{(view!=="current"||data&&isFriday(data.now))&&<WorkSessionBar/>}
   {data&&<div data-dashboard-panels className="grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-4"><EmployeeFocus today={todays.map(normalize)} upcoming={upcoming.map(normalize)} todayCount={todays.length} upcomingCount={upcoming.length}/><EmployeeWorkSummary canViewTeam={employee==="noor"&&view==="current"} people={previewPeople} read={readSummary} preview initial={{employee:{id:data.employeeId,full_name:data.fullName??(employee==="noor"?"نور":"منوه")},summary:data.summary,open:data.session,payroll:data.payroll,leave:data.leave}}/>
   </div>}
  </WorkSessionProvider>
  {view!=="current"&&<aside className="mt-6 rounded-2xl border border-dashed border-white/20 p-4 text-xs"><strong>ساعة المعاينة: {data&&new Date(data.now).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Riyadh'})}</strong><div className="mt-3 flex flex-wrap gap-2">{[[1,'دقيقة'],[30,'نصف ساعة'],[60,'ساعة']] .map(([n,label])=><button key={n} className="rounded-xl border border-white/20 px-3 py-2" onClick={()=>void advance(Number(n),true)}>تقديم {label} مع الاتصال</button>)}<button className="rounded-xl border border-rose-200/30 px-3 py-2" onClick={()=>void advance(6,false)}>انقطاع الجهاز 6 دقائق</button><button className="rounded-xl border border-white/20 px-3 py-2" onClick={()=>void advance(Math.max(0,1020-(new Date(data?.now??Date.now()).getUTCHours()*60+new Date(data?.now??Date.now()).getUTCMinutes()+180)),true)}>الوصول للخامسة</button><button className="rounded-xl border border-white/20 px-3 py-2" onClick={()=>void adapter.reset().then(()=>setRevision(r=>r+1))}>إعادة المعاينة</button></div>{error&&<p role="alert" className="mt-2 text-rose-200">{error}</p>}</aside>}
 </div></PortalScreen>;
}

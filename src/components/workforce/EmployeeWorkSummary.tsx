"use client";
import {useEffect,useState} from "react";
import type {WorkSummary} from "@/lib/workforce/work-summary";
import AttendanceProgressCard from "./AttendanceProgressCard";
import PayrollCard from "./PayrollCard";
import {api} from "./shared";
type Person={id:string;full_name:string};
export default function EmployeeWorkSummary({initial,canViewTeam=false,people,read,preview=false,compact=false}:{compact?:boolean;initial:WorkSummary;canViewTeam?:boolean;people?:Person[];read?:(id:string)=>Promise<WorkSummary>;preview?:boolean}){
 const [selected,setSelected]=useState(initial.employee.id),[team,setTeam]=useState<Person[]>(people??[initial.employee]),[remote,setRemote]=useState<{id:string;data:WorkSummary;source:WorkSummary}|null>(null),[error,setError]=useState("");
 const other=selected!==initial.employee.id,data=remote?.id===selected&&remote.source===initial?remote.data:other?null:initial;
 useEffect(()=>{if(!canViewTeam||people)return;const abort=new AbortController();api<{employees:Person[]}>("/api/workforce/team",{signal:abort.signal}).then(v=>setTeam(v.employees)).catch(e=>{if(e.name!=="AbortError")setError("تعذر تحميل قائمة الموظفات");});return()=>abort.abort();},[canViewTeam,people]);
 useEffect(()=>{if(!other&&preview)return;const abort=new AbortController();let running=false;const refresh=async()=>{if(running)return;running=true;try{
  const value=read?await read(selected):await api<WorkSummary>(`/api/workforce/work-summary?employee_id=${selected}`,{signal:abort.signal});
  if(!abort.signal.aborted){setRemote({id:selected,data:value,source:initial});setError("");}
 }catch(e){if(!abort.signal.aborted){setRemote(null);setError((e as Error).message);}}finally{running=false;}};
 if(other)void refresh();const timer=setInterval(()=>void refresh(),60000);window.addEventListener("focus",refresh);window.addEventListener("workforce-data-changed",refresh);
 return()=>{abort.abort();clearInterval(timer);window.removeEventListener("focus",refresh);window.removeEventListener("workforce-data-changed",refresh);};
 },[selected,other,read,initial,preview]);
 const cards=data?<><AttendanceProgressCard compact={compact} title={other?`دوام ${data.employee.full_name.split(" ")[0]}`:"ساعات دوامي"} summary={data.summary} open={data.open} leaveDays={data.leave.available} leave={data.leave} linkedSession={!other&&!preview} readOnly={other}/><PayrollCard title={other?`مستحقات ${data.employee.full_name.split(" ")[0]}`:"مستحقاتي"} initial={data.payroll} month={data.summary.month} preview={preview||other}/></>:<p role="status" className="col-span-2 rounded-2xl border border-white/20 p-6">جارٍ تحميل الملخص…</p>;
 if(!canViewTeam)return cards;
 return <div className="min-w-0 space-y-3 md:col-span-2"><label className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-[#10243c] px-4 py-3 text-xs font-bold text-white"><span>ساعات الدوام والمستحقات</span><select aria-label="عرض ساعات الدوام والمستحقات للموظفة" value={selected} onChange={e=>{setSelected(e.target.value);setRemote(null);setError("");}} className="max-w-full rounded-xl border border-white/20 bg-[#10243c] p-2">{team.map(p=><option key={p.id} value={p.id}>{p.id===initial.employee.id?`${p.full_name} — أنا`:p.full_name}</option>)}</select></label>{error&&<p role="alert" className="rounded-xl border border-rose-300/30 p-3 text-sm">{error}</p>}<div className="grid min-w-0 items-stretch gap-5 md:grid-cols-2" data-dashboard-panels>{cards}</div></div>;
}

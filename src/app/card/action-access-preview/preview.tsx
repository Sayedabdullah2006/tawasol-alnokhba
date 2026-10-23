'use client';
import {useMemo,useState} from 'react';
import WorkSessionProvider,{WorkSessionBar} from '@/components/workforce/WorkSessionProvider';
import PortalScreen from '@/components/layout/PortalScreen';
import type {WorkSnapshot,WorkInput} from '@/lib/workforce/work-session';

function Actions(){
 const [message,setMessage]=useState('');
 const attempt=(url:string,options:RequestInit)=>{const e=new CustomEvent('workforce-action-attempt',{cancelable:true,detail:{url,options,message:''}});if(window.dispatchEvent(e))setMessage('الإجراء متاح');else setMessage(e.detail.message);};
 return <div className="grid gap-4 md:grid-cols-3">{[['التسليم والمرفقات','تسليم المهمة','tasks'],['مركز المعرفة','رفع ملف','knowledge'],['الطلبات','طلب إجازة','requests']].map(([title,label,path])=><section key={path} className="rounded-3xl border border-white/15 bg-[#10243c]/95 p-6"><h2 className="mb-4 text-lg font-black">{title}</h2><button className="rounded-xl bg-[#dcb969] px-5 py-3 font-bold text-[#0c2039]" onClick={()=>{const form=new FormData();form.set('kind','leave');attempt(`/api/workforce/${path}`,{method:'POST',body:path==='requests'?form:'{}'})}}>{label}</button></section>)}<p role="status" className="text-sm text-amber-200">{message}</p></div>;
}
export default function Preview(){
 const [name,setName]=useState('نور'),[revision,setRevision]=useState(0),[period,setPeriod]=useState('day');
 const adapter=useMemo(()=>{
  const tick=Date.parse(period==='day'?'2026-10-24T09:00:00+03:00':'2026-10-24T18:00:00+03:00');
  let data:WorkSnapshot={now:new Date(tick).toISOString(),overtimeWindow:period==='overtime'?{ends_at:'2026-10-24T19:00:00+03:00'}:null,todaySeconds:0,canControl:true,session:null,lastSession:null,active:null,breakUsedSeconds:0,tasks:[]};
  return {read:async()=>data,write:async(input:WorkInput)=>{
   if(input.command==='in')data={...data,session:{id:'preview',checked_in:data.now,checked_out:null,business_date:'2026-10-24',close_reason:null,policy_version:1,overtime_request_id:period==='overtime'?'preview':null,cutoff_at:period==='overtime'?'2026-10-24T19:00:00+03:00':'2026-10-24T17:00:00+03:00',last_seen_at:data.now,next_confirmation_at:period==='day'?'2026-10-24T11:00:00+03:00':'2026-10-24T19:00:00+03:00',break_started_at:null}};
   if(input.command==='out')data={...data,lastSession:data.session,session:null,active:null};
   if(input.command==='break'&&data.session)data={...data,session:{...data.session,break_started_at:data.now,break_paid_until:new Date(tick+1800000).toISOString()}};
   if(input.command==='resume'&&data.session)data={...data,session:{...data.session,break_started_at:null,break_paid_until:null}};
   return data;
  }};
 },[revision,name,period]);
 return <PortalScreen area="employee"><main dir="rtl" className="mx-auto w-full max-w-6xl space-y-6 p-6 text-white"><header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/15 bg-[#10243c]/95 p-6"><div><p className="text-xs text-amber-200">معاينة محلية · لا تُحفظ بيانات ولا تُرسل رسائل</p><h1 className="mt-2 text-2xl font-black">مساحة {name}</h1></div><div className="flex gap-3">{['نور','منوه'].map(n=><button key={n} className="rounded-xl border border-white/20 px-4 py-2" onClick={()=>{setName(n);setRevision(v=>v+1)}}>{n}</button>)}</div></header><div className="flex flex-wrap gap-3">{[["day","قبل الخامسة"],["evening","بعد الخامسة"],["overtime","خارج دوام معتمد"]].map(([value,label])=><button className="rounded-xl border border-white/20 px-4 py-2" key={value} onClick={()=>{setPeriod(value);setRevision(v=>v+1)}}>{label}</button>)}</div><WorkSessionProvider key={name+revision} adapter={adapter}><WorkSessionBar/><Actions/></WorkSessionProvider></main></PortalScreen>;
}

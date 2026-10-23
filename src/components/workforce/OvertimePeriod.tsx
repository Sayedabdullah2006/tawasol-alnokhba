"use client";
import {controlClass,Field} from './shared';
import {overtimeAmount} from '@/lib/workforce/overtime';
import type {EmployeeRequest} from '@/lib/workforce/requests';
export const localRequestTime=(value:string|null)=>value?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)).replace(' ','T'):'';
export default function OvertimePeriod({startsAt,endsAt,onChange,id='overtime',quote}:{startsAt:string;endsAt:string;onChange:(v:{starts_at:string;ends_at:string})=>void;id?:string;quote?:EmployeeRequest['overtime_details']}){
 const day=startsAt.slice(0,10),start=startsAt.slice(11,16),end=endsAt.slice(11,16);
 const update=(d:string,s:string,e:string)=>{
  let finish=d;
  if(d&&s&&e==='00:00'&&s!=='00:00')finish=new Date(Date.parse(`${d}T12:00:00Z`)+86400000).toISOString().slice(0,10);
  onChange({starts_at:d&&s?`${d}T${s}`:'',ends_at:d&&e?`${finish}T${e}`:''});
 };
 const hours=startsAt&&endsAt?(Date.parse(`${endsAt}:00+03:00`)-Date.parse(`${startsAt}:00+03:00`))/3600000:0;
 let amount:string|null=null;try{if(quote&&quote.work_day===day&&hours>0&&hours<=24)amount=overtimeAmount(quote.actual_salary,quote.basic_salary,Math.round(hours*3600));}catch{}
 return <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-3"><Field id={`${id}-day`} label="اليوم"><input id={`${id}-day`} type="date" required value={day} className={controlClass} onChange={e=>update(e.target.value,start||'17:00',end||'18:00')}/></Field><Field id={`${id}-start`} label="من الساعة"><input id={`${id}-start`} type="time" required value={start} className={controlClass} onChange={e=>update(day,e.target.value,end)}/></Field><Field id={`${id}-end`} label="إلى الساعة"><input id={`${id}-end`} type="time" required value={end} className={controlClass} onChange={e=>update(day,start,e.target.value)}/></Field></div>{hours>0&&hours<=24&&<p className="text-sm font-bold">{hours.toLocaleString('ar-SA',{maximumFractionDigits:2})} ساعة{amount&&` · ${Number(amount).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})} ر.س`}</p>}</div>;
}

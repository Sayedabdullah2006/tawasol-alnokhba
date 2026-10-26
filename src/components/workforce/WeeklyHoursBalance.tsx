import type {WeeklyHours} from '@/lib/workforce/weekly-hours';
import {attendanceDuration} from '@/lib/workforce/attendance-summary';
export default function WeeklyHoursBalance({value}:{value?:WeeklyHours}){
 if(!value?.enabled||!value.weeks.length)return null;
 const week=value.current_week??{starts_on:value.weeks[0].starts_on,ends_on:value.weeks.at(-1)!.ends_on,
  generated_seconds:value.weeks.reduce((sum,w)=>sum+w.generated_seconds,0),applied_seconds:value.applied_seconds??0,available_seconds:0};
 const date=(v:string)=>new Date(v+'T12:00:00+03:00').toLocaleDateString('ar-SA',{calendar:'gregory',day:'numeric',month:'short'});
 return <section aria-label="رصيد تعويض الساعات" className="my-4 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-3">
  <header className="flex flex-wrap items-center justify-between gap-2 text-xs"><h3 className="font-black">رصيد التعويض</h3><span className="opacity-75">{date(week.starts_on)} — {date(week.ends_on)}</span></header>
  <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">{[['المكتسب',week.generated_seconds],['المستخدم',week.applied_seconds],['المتاح',week.available_seconds]].map(([label,seconds])=><div key={label}><dt className="opacity-75">{label}</dt><dd className="mt-1 whitespace-nowrap font-black tabular-nums">{attendanceDuration(Number(seconds)/60)}</dd></div>)}</dl>
  <details className="mt-3 border-t border-current/10 pt-2 text-[11px]"><summary className="cursor-pointer font-bold">حركة التعويض</summary><ul className="mt-2 space-y-2">{value.transfers.filter(t=>t.source_day>=week.starts_on&&t.source_day<=week.ends_on).map(t=><li key={`${t.source_day}:${t.target_day}`} className="flex flex-wrap justify-between gap-1"><span>{date(t.source_day)} ← {date(t.target_day)}</span><strong>{attendanceDuration(t.seconds/60)}</strong></li>)}{!week.applied_seconds&&<li>لا توجد ساعات مستخدمة</li>}</ul></details>
 </section>;
}

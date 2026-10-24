'use client';
import {useState} from 'react';
import {CALENDAR_WEEKDAYS,addCalendarDays,calendarDate,calendarMonth,calendarTime,calendarWeek,meetingsOnDay,shiftCalendarMonth} from '@/lib/workforce/meeting-calendar';
import type {Meeting} from '@/lib/workforce/meetings';
export default function MeetingCalendar({meetings,selectedDay,onDayChange,onOpen,onCreate,today,loading=false}:{meetings:Meeting[];selectedDay:string;onDayChange:(day:string)=>void;onOpen:(meeting:Meeting)=>void;onCreate?:()=>void;today:string;loading?:boolean}){
 const [view,setView]=useState<'month'|'week'>('month');
 const month=selectedDay.slice(0,7),days=view==='month'?calendarMonth(month):calendarWeek(selectedDay),selected=meetingsOnDay(meetings,selectedDay);
 const step=(direction:number)=>onDayChange(view==='month'?shiftCalendarMonth(selectedDay,direction):addCalendarDays(selectedDay,direction*7));
 const action='rounded-xl border border-white/20 px-3 py-2 text-sm font-bold transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-amber-200';
 return <section className="space-y-4" aria-label="تقويم الاجتماعات" aria-busy={loading}>
  <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><h2 className="min-w-40 text-xl font-black">{calendarDate(selectedDay,true)}</h2><button className={action} aria-label={view==='month'?'الشهر السابق':'الأسبوع السابق'} onClick={()=>step(-1)}>‹</button><button className={action} aria-label={view==='month'?'الشهر التالي':'الأسبوع التالي'} onClick={()=>step(1)}>›</button><button className={action} onClick={()=>onDayChange(today)}>اليوم</button></div><div className="portal-toolbar flex gap-2" aria-label="عرض التقويم">{([['month','شهر'],['week','أسبوع']] as const).map(([id,label])=><button key={id} className={action} aria-pressed={view===id} onClick={()=>setView(id)}>{label}</button>)}</div></header>
  <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
   <div className="portal-panel min-w-0 overflow-x-auto rounded-3xl border border-white/15" tabIndex={0} aria-label="أيام التقويم">
    <div className="min-w-[650px]"><div className="grid grid-cols-7 border-b border-white/15">{CALENDAR_WEEKDAYS.map(day=><span key={day} className="px-2 py-3 text-center text-xs font-bold text-amber-200">{day}</span>)}</div>
     <div className="grid grid-cols-7">{days.map(day=>{const events=meetingsOnDay(meetings,day),chosen=day===selectedDay;return <div key={day} className={`min-w-0 border-b border-l border-white/10 p-2 ${view==='month'?'min-h-24':'min-h-80'} ${day.slice(0,7)!==month?'bg-black/15 opacity-60':''} ${chosen?'bg-amber-200/10':''}`} data-calendar-day={day}>
      <button aria-label={calendarDate(day)} aria-pressed={chosen} className={`mb-2 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${day===today?'bg-[#daba78] text-[#10213a]':chosen?'border border-amber-200 text-amber-200':'hover:bg-white/10'}`} onClick={()=>onDayChange(day)}>{Number(day.slice(-2))}</button>
      <div className="space-y-1">{events.slice(0,view==='month'?3:events.length).map((m,i)=><button key={m.id} onClick={()=>{onDayChange(day);onOpen(m);}} className="block w-full rounded-lg border-r-2 px-2 py-1.5 text-right text-[11px] font-bold transition hover:brightness-125 focus-visible:outline-2 focus-visible:outline-amber-200" style={{backgroundColor:['#1b4055','#34345c','#164b41'][i%3],borderColor:['#8edaf0','#c5b0fa','#8de0bc'][i%3],color:'#f1f5ff'}} title={`${m.title} · ${calendarTime(m.starts_at)} — ${calendarTime(m.ends_at)}`}><span className="block tabular-nums opacity-80">{calendarTime(m.starts_at)}</span><span className="block truncate">{m.title}</span></button>)}{view==='month'&&events.length>3&&<button onClick={()=>onDayChange(day)} className="px-1 text-[11px] font-bold text-amber-200">＋ {events.length-3} اجتماعات</button>}</div>
     </div>;})}</div>
    </div>
   </div>
   <aside className="portal-panel min-w-0 space-y-4 rounded-3xl border border-white/15 p-4" aria-label="اجتماعات اليوم المحدد"><header className="flex items-start justify-between gap-2"><div><p className="text-xs text-amber-200">{selectedDay===today?'اجتماعات اليوم':'الموعد المحدد'}</p><h3 className="mt-2 text-sm font-black">{calendarDate(selectedDay)}</h3></div><span className="rounded-xl bg-white/10 px-3 py-1 text-sm font-bold">{selected.length}</span></header>
    {loading?<p role="status" className="text-sm opacity-70">جارٍ تحميل المواعيد…</p>:!selected.length?<p className="py-5 text-sm opacity-70">لا توجد اجتماعات</p>:<div className="space-y-2">{selected.map(m=><button key={m.id} className="w-full space-y-2 rounded-2xl border border-white/15 bg-white/5 p-3 text-right transition hover:bg-white/10" onClick={()=>onOpen(m)}><span className="block text-xs font-bold text-amber-200">{calendarTime(m.starts_at)} — {calendarTime(m.ends_at)}</span><span className="block text-sm font-black">{m.title}</span><span className="block text-xs opacity-70">فتح التفاصيل والانضمام ←</span></button>)}</div>}
    {onCreate&&<button className="w-full rounded-xl bg-[#daba78] px-4 py-3 text-sm font-black text-[#10213a]" onClick={onCreate}>＋ اجتماع في هذا اليوم</button>}
   </aside>
  </div>
 </section>;
}

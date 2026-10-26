'use client';
import {useEffect,useState} from 'react';
import PortalScreen from '@/components/layout/PortalScreen';
import AttendanceProgressCard from '@/components/workforce/AttendanceProgressCard';
import PayrollCard from '@/components/workforce/PayrollCard';
import type {AttendanceSummary} from '@/lib/workforce/attendance-summary';
import {attendanceDuration} from '@/lib/workforce/attendance-summary';
import type {PayrollCardData} from '@/lib/workforce/payroll-attendance';
type Row={key:string;name:string;now:string;summary:AttendanceSummary;payroll:PayrollCardData;before:PayrollCardData};
export default function Preview(){
 const [data,setData]=useState<{current:Row[];example:Row[]}|null>(null),[employee,setEmployee]=useState('noor'),[mode,setMode]=useState<'current'|'example'>('current'),[error,setError]=useState('');
 useEffect(()=>{fetch('http://127.0.0.1:3126').then(r=>r.json()).then(setData).catch(()=>setError('شغلي خادم المعاينة المحلي'));},[]);
 const row=data?.[mode].find(r=>r.key===employee);
 return <PortalScreen area="employee"><main dir="rtl" className="mx-auto max-w-6xl space-y-5 p-5 md:p-8"><header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/20 bg-[#10243c]/95 p-5"><div><p className="text-xs text-amber-200">معاينة محلية · دون إشعارات أو إيميلات</p><h1 className="mt-2 text-2xl font-black">رصيد تعويض الساعات</h1></div><div className="flex flex-wrap gap-2">{[['noor','نور'],['monwa','منوه']].map(([value,label])=><button key={value} onClick={()=>setEmployee(value)} aria-pressed={employee===value} className="rounded-xl border border-white/20 px-5 py-2 font-bold aria-pressed:bg-amber-200 aria-pressed:text-slate-900">{label}</button>)}</div></header>
 <nav className="flex gap-3">{[['current','البيانات الحالية'],['example','مثال: 10 ساعات ثم 6 ساعات']].map(([value,label])=><button key={value} onClick={()=>setMode(value as 'current'|'example')} aria-pressed={mode===value} className="rounded-xl border border-white/20 px-4 py-2 text-sm aria-pressed:bg-white/15">{label}</button>)}</nav>
 {error&&<p role="alert">{error}</p>}{row&&<><h2 className="text-xl font-black">{row.name}</h2><div className="grid items-stretch gap-5 md:grid-cols-2"><AttendanceProgressCard summary={row.summary} open={null} leaveDays={0} linkedSession={false} readOnly/><PayrollCard initial={row.payroll} month="2026-10" preview/></div>
 <section className="grid gap-3 rounded-2xl border border-white/15 bg-[#10243c]/95 p-4 text-sm sm:grid-cols-3"><div><span className="block opacity-70">تعويض مستخدم هذا الشهر</span><strong>{attendanceDuration((row.summary.weeklyCompensation?.applied_seconds??0)/60)}</strong></div><div><span className="block opacity-70">تسوية الساعات قبل</span><strong>{Number(row.before.attendance_amount).toFixed(2)} ر.س</strong></div><div><span className="block opacity-70">تسوية الساعات بعد</span><strong>{Number(row.payroll.attendance_amount).toFixed(2)} ر.س</strong></div></section>
 {row.payroll.attendance_details.waiver_reason&&<p className="rounded-2xl border border-amber-300/20 bg-amber-200/10 p-4 text-sm">إعفاء أكتوبر محفوظ؛ التعويض يحدّث الساعات دون تغيير صافي هذا الشهر بسبب الإعفاء.</p>}
 </>}</main></PortalScreen>;
}

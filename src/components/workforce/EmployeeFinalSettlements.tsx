'use client';
import { useCallback, useEffect, useState } from 'react';
import type { EmployeeFinalSettlement } from '@/lib/workforce/employee-final-settlement';
import { api, Notice } from './shared';

const money = (value: string) => `${Number(value).toLocaleString('ar-SA', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ر.س`;
const date = (value: string) => new Intl.DateTimeFormat('ar-SA', {calendar: 'gregory', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Riyadh'}).format(new Date(value.length === 10 ? `${value}T12:00:00+03:00` : value));

export function EmployeeSettlementDetails({settlement: s}: {settlement: EmployeeFinalSettlement}) {
  const paid = s.status === 'paid', zero = Number(s.net_due) === 0;
  const rows = [
    ['الأجور والحوافز وخارج الدوام', s.gross], ['مقابل رصيد الإجازات', s.leave_amount],
    ['مكافأة نهاية الخدمة', s.eos_amount], ['تعويض مصروفات العمل', s.expenses],
    ['حقوق إضافية', s.additional_credits], ['التأمينات الاجتماعية', s.insurance],
    ['تسوية الحضور والإجازات', s.attendance], ['استقطاعات بالكشوف', s.other],
    ['استقطاعات إضافية', s.additional_debits], ['المصروف سابقًا', s.already_paid],
    ['مسترد بسند تحصيل', s.recovered_amount],
  ].filter(([label, value]) => Number(value) !== 0 || ['الأجور والحوافز وخارج الدوام', 'مقابل رصيد الإجازات', 'مكافأة نهاية الخدمة'].includes(label));
  return <section aria-label="تسويتي النهائية" className="my-5 min-w-0 rounded-2xl border border-amber-200/30 bg-[#10243c] p-4 text-white md:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-bold text-amber-200">التسوية النهائية</h2><p className="mt-2 text-xs text-slate-300">آخر يوم عمل: {date(s.ends_on)} · اعتمدت في {date(s.approved_at)}</p></div>
      <span className={`rounded-full border px-3 py-1 text-xs font-bold ${paid ? 'border-emerald-300/40 text-emerald-200' : 'border-amber-200/40 text-amber-200'}`}>
        {paid ? (zero ? 'مقفلة دون صرف' : 'مصروفة') : (zero ? 'معتمدة · بانتظار الإقفال' : 'معتمدة · بانتظار الصرف')}
      </span>
    </header>
    <div className="mt-5 grid min-w-0 gap-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <dl className="min-w-0 divide-y divide-white/10 text-sm">{rows.map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5"><dt>{label}</dt><dd className="whitespace-nowrap font-bold tabular-nums">{money(value)}</dd></div>)}</dl>
      <div className="min-w-0 space-y-4 rounded-xl bg-white/5 p-4">
        <div><p className="text-sm text-slate-200">{paid ? (zero ? 'صافي التسوية' : 'صافي التسوية المصروف') : 'صافي التسوية المعتمد'}</p><strong className="mt-2 block whitespace-nowrap text-2xl font-bold text-amber-200">{money(s.net_due)}</strong></div>
        <p className="text-xs text-slate-300">رصيد الإجازات المعوّض: {s.leave_days.toLocaleString('ar-SA', {maximumFractionDigits: 4})} يوم</p>
        {paid && <dl className="space-y-3 border-t border-white/10 pt-3 text-sm"><div><dt className="text-xs text-slate-300">{zero ? 'تاريخ الإقفال' : 'تاريخ توثيق الصرف'}</dt><dd className="mt-1">{s.paid_at ? date(s.paid_at) : '—'}</dd></div><div><dt className="text-xs text-slate-300">{zero ? 'مرجع محضر التسوية' : 'مرجع التحويل'}</dt><dd dir="auto" className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{s.payment_reference ?? '—'}</dd></div></dl>}
      </div>
    </div>
    {!!s.months.length && <details className="mt-4 border-t border-white/10 pt-3"><summary className="cursor-pointer text-sm font-bold">تفاصيل الأشهر والبنود</summary><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[300px] text-right text-xs"><caption className="sr-only">الكشوف ضمن التسوية عند اعتمادها</caption><thead className="text-slate-300"><tr><th className="py-2">الشهر</th><th>صافي الحقوق</th><th>المصروف قبل التسوية</th></tr></thead><tbody>{s.months.map(row => <tr key={row.month} className="border-t border-white/10"><td className="py-3"><bdi>{row.month.slice(0, 7)}</bdi></td><td className="whitespace-nowrap">{money(row.due)}</td><td className="whitespace-nowrap">{money(row.paid)}</td></tr>)}</tbody></table></div>{!!s.adjustments.length && <ul className="mt-3 space-y-2 text-xs">{s.adjustments.map((row, i) => <li key={i} className="flex flex-wrap justify-between gap-2"><span>{row.kind === 'credit' ? 'حق إضافي' : row.kind === 'debit' ? 'استقطاع' : 'مسترد'} · {row.title}</span><span className="whitespace-nowrap">{money(row.amount)}</span></li>)}</ul>}</details>}
  </section>;
}

export default function EmployeeFinalSettlements({transport = api}: {transport?: typeof api}) {
  const [rows, setRows] = useState<EmployeeFinalSettlement[]>([]), [error, setError] = useState('');
  const load = useCallback((signal: AbortSignal) => transport<{settlements: EmployeeFinalSettlement[]}>('/api/workforce/my-final-settlements', {signal})
    .then(result => {if (!signal.aborted) {setRows(result.settlements); setError('');}})
    .catch(e => {if (!signal.aborted) {setRows([]); setError(e.message || 'تعذر تحميل التسوية النهائية');}}), [transport]);
  useEffect(() => {
    let controller = new AbortController();
    void load(controller.signal);
    const refresh = () => {controller.abort(); controller = new AbortController(); void load(controller.signal);};
    window.addEventListener('workforce-data-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {controller.abort(); window.removeEventListener('workforce-data-changed', refresh); window.removeEventListener('focus', refresh);};
  }, [load]);
  return <><Notice message={error} error/>{rows.map(row => <EmployeeSettlementDetails key={row.id} settlement={row}/>)}</>;
}

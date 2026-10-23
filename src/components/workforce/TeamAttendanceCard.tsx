"use client";
import { useEffect, useState } from "react";
import type { TeamAttendance } from "@/lib/workforce/dashboard-types";
import type { AttendanceData } from "@/lib/workforce/attendance";
import { attendanceDuration, liveAttendance, attendanceEnd, workedSeconds } from "@/lib/workforce/attendance-summary";
import { api, Notice } from "./shared";

const dateTime = (value: string) => new Date(value).toLocaleString("ar-SA", { calendar: "gregory", timeZone: "Asia/Riyadh", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export default function TeamAttendanceCard({ employeeId, attendance, refreshKey }: {
  employeeId: string; attendance: TeamAttendance; refreshKey: string;
}) {
  const [expanded, setExpanded] = useState(false), [page, setPage] = useState(1);
  const [data, setData] = useState<AttendanceData | null>(null), [error, setError] = useState("");
  const [loaded, setLoaded] = useState(""), [tick, setTick] = useState(0), [retry, setRetry] = useState(0);
  useEffect(() => { const timer = setInterval(() => setTick(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const month = attendance.summary.month;
  const key = `${employeeId}:${month}:${page}:${refreshKey}:${retry}`, loading = key !== loaded;
  useEffect(() => {
    if (!expanded) return;
    const abort = new AbortController();
    const params = new URLSearchParams({ employee_id: employeeId, year: month.slice(0, 4), month, page: String(page) });
    api<AttendanceData>(`/api/workforce/attendance?${params}`, { signal: abort.signal })
      .then(result => { setData(result); setError(""); setLoaded(key); })
      .catch(e => { if (e.name !== "AbortError") { setData(null); setError(e.message); setLoaded(key); } });
    return () => abort.abort();
  }, [expanded, employeeId, month, page, refreshKey, key]);
  const live = liveAttendance(attendance.summary, attendance.open, tick);
  const current = liveAttendance(attendance.todaySummary, attendance.open, tick);
  const status = current.today < current.startsOn ? "قبل المباشرة" : current.needsCorrection ? "يحتاج تصحيح الحضور" : current.isPresent ? attendance.open?.break_started_at ? "في استراحة" : "حاضرة الآن" : current.todayPeriods ? "تم الانصراف" : current.dayOff ? current.paidHoliday?`${current.paidHoliday} · مدفوعة`:"يوم إجازة" : "لم تسجل الحضور اليوم";
  const progress = live.targetMinutes ? Math.min(100, live.workedMinutes * 100 / live.targetMinutes) : 0;
  const detailsId = `attendance-periods-${employeeId}`;
  return <section className="attendance-stat mt-4 rounded-2xl border border-white/60 bg-white/45 p-4" aria-label="دوام الشهر" data-team-attendance={employeeId}>
    <header className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-black">دوام {new Date(`${month}-01T12:00:00+03:00`).toLocaleDateString("ar-SA", {calendar:"gregory", month:"long", year:"numeric"})}</h4><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${current.isPresent ? "bg-emerald-100 text-emerald-950" : current.needsCorrection ? "bg-amber-100 text-amber-950" : "bg-slate-100 text-slate-800"}`}>{status}</span></header>
    {current.isPresent&&attendance.active&&<p className="mt-3 truncate text-xs font-bold">{attendance.active.title}</p>}
    <dl className="my-4 grid grid-cols-2 gap-3"><div><dt className="text-xs opacity-75">المنجز</dt><dd className="mt-1 text-lg font-black tabular-nums" data-team-worked>{attendanceDuration(live.workedMinutes)}</dd></div><div><dt className="text-xs opacity-75">المتبقي</dt><dd className="mt-1 text-lg font-black tabular-nums" data-team-remaining>{attendanceDuration(live.remainingMinutes)}</dd></div></dl>
    <div role="meter" aria-label="إنجاز ساعات الشهر" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="h-1.5 overflow-hidden rounded-full bg-sky-200/30"><div className="h-full rounded-full bg-sky-500 transition-all" style={{width:`${progress}%`}} /></div>
    <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] opacity-80"><span>المستهدف {attendanceDuration(live.targetMinutes)} · {live.workdayCount} يوم عمل</span><span>اليوم {attendanceDuration(current.todayMinutes)}</span></div>
    {live.paidHolidayMinutes>0&&<p className="mt-3 text-xs font-bold">إجازات رسمية مدفوعة · {attendanceDuration(live.paidHolidayMinutes)}</p>}
    {!!live.extraMinutes && <p className="mt-2 text-xs font-bold">إضافي {attendanceDuration(live.extraMinutes)}</p>}
    <button type="button" className="mt-4 flex w-full items-center justify-between border-t border-current/10 pt-3 text-xs font-bold hover:underline" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}><span>فترات الحضور والانصراف</span><span aria-hidden>{expanded ? "−" : "＋"}</span></button>
    {expanded && <div id={detailsId} className="mt-3 space-y-3" aria-busy={loading}>
      <Notice message={error} error />
      {error && <button type="button" onClick={() => setRetry(value => value + 1)} className="text-xs underline">إعادة المحاولة</button>}
      {loading ? <p role="status" className="text-xs">جارٍ تحميل الفترات…</p> : data && <>
        {!data.sessions.length ? <p className="text-xs">لا توجد فترات حضور لهذا الشهر</p> : <ol className="max-h-80 space-y-2 overflow-y-auto overscroll-contain">{data.sessions.map(session => {
          const start = Date.parse(session.checked_in), end = attendanceEnd(session,tick || Date.parse(live.asOf));
          return <li key={session.id} className="rounded-xl border border-current/10 p-3 text-xs"><div className="grid grid-cols-2 gap-2"><div><span className="block opacity-70">الحضور</span><time dateTime={session.checked_in} className="mt-1 block font-bold">{dateTime(session.checked_in)}</time></div><div><span className="block opacity-70">الانصراف</span>{session.checked_out ? <time dateTime={session.checked_out} className="mt-1 block font-bold">{dateTime(session.checked_out)}</time> : <strong className="mt-1 block">{session.policy_version===1 && end < (tick || Date.parse(live.asOf)) ? `انصراف تلقائي · ${dateTime(new Date(end).toISOString())}` : end >= start + 86400000 ? "يحتاج تصحيحًا" : "مستمرة"}</strong>}</div></div><p className="mt-2 border-t border-current/10 pt-2 font-bold tabular-nums">{attendanceDuration(workedSeconds([session],0,Infinity,tick || Date.parse(live.asOf))/60)}</p></li>;
        })}</ol>}
        {data.count > 20 && <nav aria-label="صفحات فترات الحضور" className="flex items-center justify-between gap-2 text-xs"><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">السابق</button><span>{page} / {Math.ceil(data.count / 20)}</span><button type="button" disabled={page * 20 >= data.count} onClick={() => setPage(value => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">التالي</button></nav>}
      </>}
    </div>}
  </section>;
}

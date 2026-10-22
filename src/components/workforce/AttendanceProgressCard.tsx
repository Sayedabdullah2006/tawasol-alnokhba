"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { attendanceDuration, liveAttendance, type AttendanceSummary } from "@/lib/workforce/attendance-summary";
import ProgressOrbit from "./ProgressOrbit";
import {useWorkSession} from "./WorkSessionProvider";
import type {AttendancePeriod} from "@/lib/workforce/attendance-summary";

export default function AttendanceProgressCard({ summary, open, leaveDays }: {
  summary: AttendanceSummary; open: AttendancePeriod | null; leaveDays: number;
}) {
  const work=useWorkSession();
  open=work?.data?work.data.session:open;
  const [tick, setTick] = useState(0);
  useEffect(() => { const timer = setInterval(() => setTick(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const live = liveAttendance(summary, open, tick?tick+(work?.clockOffset??0):0);
  const beforeStart = summary.today < summary.startsOn;
  const status = beforeStart ? "قبل المباشرة" : live.needsCorrection ? "يحتاج تصحيح الحضور" : live.isPresent ? open?.break_started_at?"في استراحة":"الدوام جارٍ" : live.todayMinutes ? "تم الانصراف" : live.dayOff ? "يوم إجازة" : "لم يبدأ الدوام";
  const progress = live.targetMinutes ? live.workedMinutes / live.targetMinutes * 100 : 0;
  const dayProgress = live.dailyMinutes ? Math.min(100, live.todayMinutes / live.dailyMinutes * 100) : 0;
  const date = (value: string) => new Date(`${value}T12:00:00+03:00`).toLocaleDateString("ar-SA", {calendar:"gregory", day:"numeric", month:"short"});
  return <section className="portal-panel flex min-w-0 flex-col rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-100/80 p-5 text-sky-950 shadow-sm sm:p-6" aria-label="ساعات دوامي">
    <header className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-black">ساعات دوامي</h2>
      <span className="rounded-full border border-sky-200/50 px-3 py-1 text-xs font-bold">{new Date(`${summary.month}-01T12:00:00+03:00`).toLocaleDateString("ar-SA", {calendar:"gregory",month:"long",year:"numeric"})}</span>
    </header>
    <div className="my-5 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><p className="text-xs font-bold opacity-75">المنجز هذا الشهر</p><p className="mt-2 text-2xl font-black tabular-nums sm:text-3xl" data-month-worked>{attendanceDuration(live.workedMinutes)}</p><p className="mt-2 text-xs opacity-75">{summary.startsOn > summary.endsOn ? `المباشرة ${date(summary.startsOn)}` : `${date(summary.startsOn)} — ${date(summary.endsOn)} · ${summary.workdayCount} يوم عمل`}</p></div>
      <ProgressOrbit value={progress} label="إنجاز ساعات الشهر" detail="من ساعات الشهر" />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="attendance-stat rounded-2xl border border-sky-200/40 bg-white/40 p-3"><p className="text-xs opacity-75">المتبقي للشهر</p><strong className="mt-2 block text-lg tabular-nums" data-month-remaining>{attendanceDuration(live.remainingMinutes)}</strong></div>
      <div className="attendance-stat rounded-2xl border border-sky-200/40 bg-white/40 p-3"><p className="text-xs opacity-75">المستهدف</p><strong className="mt-2 block text-lg tabular-nums">{attendanceDuration(live.targetMinutes)}</strong></div>
    </div>
    {!!live.extraMinutes && <p className="mt-3 text-sm font-bold text-emerald-700">إضافي: {attendanceDuration(live.extraMinutes)}</p>}
    <div className="attendance-stat my-4 rounded-2xl border border-sky-200/40 bg-white/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black">اليوم</h3><span className={`inline-flex items-center gap-2 rounded-full px-2 py-1 text-[11px] font-bold ${live.isPresent ? "bg-emerald-100 text-emerald-900" : "bg-sky-100 text-sky-900"}`}>{live.isPresent && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}{status}</span></div>
      <p className="mt-3 flex flex-wrap items-baseline justify-between gap-2"><strong className="text-xl tabular-nums" data-today-worked>{attendanceDuration(live.todayMinutes)}</strong><span className="text-xs opacity-75">{live.dayOff ? "يوم إجازة" : `من ${attendanceDuration(live.dailyMinutes)}`}</span></p>
      {!live.dayOff && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sky-200/30" role="meter" aria-label="إنجاز ساعات اليوم" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(dayProgress)}><div className="h-full rounded-full bg-sky-500 transition-all" style={{width:`${dayProgress}%`}} /></div>}
      {!!live.todayPeriods && <p className="mt-2 text-[11px] opacity-70">فترات الحضور: {live.todayPeriods}</p>}
    </div>
    <div className="mt-auto flex items-center justify-between text-xs opacity-75"><span>رصيد الإجازة</span><strong>{leaveDays} يوم</strong></div>
    <Link href={live.needsCorrection ? "/employee/requests/attendance-correction" : "/employee/attendance/overview"} className="mt-4 flex items-center justify-between gap-2 border-t border-current/10 pt-4 text-sm font-black hover:underline"><span>{live.needsCorrection ? "طلب تصحيح الحضور" : live.isPresent ? "تسجيل الانصراف" : "الحضور والانصراف"}</span><span aria-hidden>←</span></Link>
  </section>;
}

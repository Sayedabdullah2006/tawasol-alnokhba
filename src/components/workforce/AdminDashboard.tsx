"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import type { AdminWorkDashboard, WorkMetrics } from "@/lib/workforce/dashboard-types";
import { STATUS_LABELS } from "@/lib/workforce/types";
import { api, Notice } from "./shared";
import MonthlyPayroll from "./MonthlyPayroll";
import DashboardJourneys from "./DashboardJourneys";
import DashboardLiveStatus from "./DashboardLiveStatus";
import PerformanceCard from "./PerformanceCard";
import PortalIntro from "@/components/layout/PortalIntro";
import TeamAttendanceCard from "./TeamAttendanceCard";
import TeamPayrollCard from "./TeamPayrollCard";
import MeetingUpcoming from './MeetingUpcoming';
import { riyadhDate } from "@/lib/workforce/attendance-summary";

const count = (value: number) => value.toLocaleString("en-US");
const metrics: { key: keyof WorkMetrics; label: string; color: string }[] = [
  { key: "assigned", label: "المهام المسندة", color: "border-blue-200 bg-blue-50 text-blue-950" },
  { key: "completed", label: "المنجزة", color: "border-emerald-200 bg-emerald-50 text-emerald-950" },
  { key: "open", label: "المفتوحة", color: "border-sky-200 bg-sky-50 text-sky-950" },
  { key: "overdue", label: "المتأخرة", color: "border-rose-200 bg-rose-50 text-rose-950" },
];
const box = "min-w-0 rounded-3xl border p-5 shadow-[0_8px_28px_-18px_rgba(16,43,87,0.3)] sm:p-6";

export default function AdminDashboard({ previewData }: { userId: string; previewData?: AdminWorkDashboard }) {
  const router = useRouter(), params = useSearchParams();
  const [staffView, setStaffView] = useState<"all" | "attention">("all");
  const [data, setData] = useState<AdminWorkDashboard | null>(previewData ?? null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const [selectedPayroll, setSelectedPayroll] = useState<string | null>(null);
  const attendanceMonth = params.get("attendance_month") || riyadhDate(new Date()).slice(0, 7);
  const query = new URLSearchParams();
  for (const key of ["due_from", "due_to", "assignee_id", "client_name", "attendance_month"]) {
    const value = params.get(key); if (value) query.set(key, value);
  }
  const summaryQuery = query.toString(), requestKey = `${summaryQuery}:${revision}`;
  const loading = !previewData && loadedKey !== requestKey;
  useEffect(() => {
    const refresh = () => setRevision(n => n + 1);
    window.addEventListener("workforce-data-changed", refresh);
    window.addEventListener("workforce-dashboard-tick", refresh);
    return () => {
      window.removeEventListener("workforce-data-changed", refresh);
      window.removeEventListener("workforce-dashboard-tick", refresh);
    };
  }, []);
  useEffect(() => {
    if (previewData) return;
    const abort = new AbortController();
    api<AdminWorkDashboard>(`/api/workforce/dashboard?${summaryQuery}`, { signal: abort.signal })
      .then(result => { setData(result); setError(""); setLoadedKey(requestKey); })
      .catch(error => { if (error.name !== "AbortError") { setData(null); setError(error.message); setLoadedKey(requestKey); } });
    return () => abort.abort();
  }, [summaryQuery, requestKey, previewData]);
  function taskHref(key?: keyof WorkMetrics, employee?: string, create = false) {
    const next = new URLSearchParams();
    if (employee) next.set("assignee_id", employee);
    if (key === "completed") next.set("state", "done");
    if (key === "open") next.set("open", "true");
    if (key === "overdue") next.set("overdue", "true");
    if (create) next.set("create", "1");
    return `/admin/workforce/tasks${next.size ? `?${next}` : ""}`;
  }
  function changeMonth(month: string) {
    if (!month) return;
    const next = new URLSearchParams(params.toString()); next.set("attendance_month", month);
    router.replace(`/admin/workforce?${next}`, { scroll: false });
  }
  async function exportAttendance() {
    setExporting(true); setError("");
    try {
      const response = await fetch(`/api/workforce/attendance/export?month=${encodeURIComponent(attendanceMonth)}`, { cache: "no-store" });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || "تعذر تحميل التقرير"); }
      const url = URL.createObjectURL(await response.blob()), link = document.createElement("a");
      link.href = url; link.download = `nukhba-attendance-${attendanceMonth}.xlsx`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setError((error as Error).message); } finally { setExporting(false); }
  }
  const employees = data?.employees.filter(employee => staffView === "all" || employee.metrics.overdue > 0 || employee.metrics.blocked > 0) ?? [];
  return <div className="mx-auto w-full min-w-0 max-w-screen-2xl space-y-6 p-4 md:p-6 lg:p-8" data-admin-dashboard>
    <PortalIntro title="أداء الفريق" eyebrow="إدارة فريق النخبة" detail={data ? `آخر تحديث ${new Date(data.generated_at).toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" })}` : undefined}>
      <Button disabled={!!previewData} onClick={() => router.push(taskHref(undefined, undefined, true))}>＋ إسناد مهمة</Button>
      <Button variant="outline" disabled={loading || !!previewData} onClick={() => setRevision(n => n + 1)}>تحديث</Button>
      {!previewData && <DashboardLiveStatus admin />}
    </PortalIntro>
    <Notice message={error} error />
    <section aria-label="ملخص أداء الفريق" aria-busy={loading} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {metrics.map(item => <button key={item.key} type="button" disabled={!!previewData || loading || !data} onClick={() => router.push(taskHref(item.key))} className={`rounded-2xl border p-4 text-right transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60 motion-reduce:transform-none ${item.color}`}>
        <span className="text-xs font-bold sm:text-sm">{item.label}</span><span className="mt-4 flex items-end justify-between"><strong className="text-3xl font-black tabular-nums">{data ? count(data.totals[item.key]) : "—"}</strong><span aria-hidden>↗</span></span>
      </button>)}
    </section>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white/60 p-4">
      <label className="flex items-center gap-3 text-sm font-bold">شهر المتابعة<input type="month" aria-label="شهر المتابعة" min="2020-01" max="2200-12" disabled={!!previewData || !!selectedPayroll} value={attendanceMonth} onChange={event => changeMonth(event.target.value)} className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label>
      <Button size="sm" variant="outline" disabled={loading || !data || exporting || !!previewData} onClick={() => void exportAttendance()}>{exporting ? "جارٍ تجهيز التقرير…" : "تحميل تقرير الحضور Excel"}</Button>
    </div>
    {!previewData&&<MeetingUpcoming admin/>}
    <details aria-labelledby="staff-performance" className="space-y-4 rounded-3xl border border-border bg-white/60 p-4 sm:p-5">
      <summary className="cursor-pointer py-2 text-lg font-black"><h2 id="staff-performance" className="inline text-lg font-black text-dark">نبض الفريق</h2></summary>
      <div role="group" aria-label="تصفية أداء الموظفات" className="flex flex-wrap gap-2">{([{ id: "all", title: "الفريق" }, { id: "attention", title: "تحتاج متابعة" }] as const).map(tab => <button key={tab.id} type="button" aria-pressed={staffView === tab.id} onClick={() => setStaffView(tab.id)} className={`rounded-xl border px-4 py-2 text-xs font-bold ${staffView === tab.id ? "bg-[#102b57] text-white" : "bg-white text-slate-700"}`}>{tab.title}</button>)}</div>
      <div className="grid items-start gap-4 lg:grid-cols-2" data-staff-cards>
        {!data && loading && [0, 1].map(n => <div key={n} role="status" aria-label="جارٍ تحميل أداء الموظفات" className="h-64 animate-pulse rounded-3xl border bg-white/70 motion-reduce:animate-none" />)}
        {employees.map((employee, i) => <article key={employee.id} className={`${box} ${i % 2 ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-100/70 text-emerald-950" : "border-sky-200 bg-gradient-to-br from-sky-50 to-blue-100/80 text-sky-950"}`} data-staff-card={employee.id}>
          <header className="flex items-start justify-between gap-3"><div><h3 className="font-black">{employee.full_name}</h3><p className="mt-1 text-xs opacity-75">{employee.job_title || "دون مسمى"} · {STATUS_LABELS[employee.status]}</p></div><span className="rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold">{count(employee.metrics.assigned)} مسندة</span></header>
          <PerformanceCard initial={employee.performance} employeeId={employee.id} admin embedded preview={!!previewData} />
          <TeamAttendanceCard employeeId={employee.id} attendance={employee.attendance} refreshKey={data!.generated_at} preview={!!previewData} />
          {!previewData && <div className="mt-5 flex flex-wrap gap-3 border-t border-current/10 pt-4 text-xs font-bold"><Link href={taskHref(undefined, employee.id, true)}>＋ إسناد مهمة</Link><Link href={taskHref("assigned", employee.id)}>عرض مهامها ←</Link></div>}
        </article>)}
      </div>
      {data && !employees.length && <p className="rounded-2xl border p-5 text-sm">لا توجد حالات ضمن هذه التصفية</p>}
    </details>
    <section aria-labelledby="team-finances" className="space-y-4 rounded-3xl border border-border bg-white/60 p-4 sm:p-5">
      <h2 id="team-finances" className="text-lg font-black text-dark">المستحقات المالية للفريق</h2>
      <div className="grid items-stretch gap-4 lg:grid-cols-2">{data?.employees.map(employee => <TeamPayrollCard key={`${employee.id}:${attendanceMonth}`} employeeId={employee.id} name={employee.full_name} month={attendanceMonth} refreshKey={data.generated_at} preview={!!previewData} previewPayroll={employee.previewPayroll} onOpen={() => setSelectedPayroll(employee.id)} />)}</div>
      {selectedPayroll && <MonthlyPayroll key={`${selectedPayroll}:${attendanceMonth}`} employeeId={selectedPayroll} initialMonth={attendanceMonth} admin onClose={() => setSelectedPayroll(null)} />}
    </section>
    <DashboardJourneys admin />
  </div>;
}

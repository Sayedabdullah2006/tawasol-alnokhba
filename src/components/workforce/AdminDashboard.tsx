"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import { type AdminWorkDashboard, type WorkMetrics } from "@/lib/workforce/dashboard-types";
import { STATUS_LABELS } from "@/lib/workforce/types";
import { api, Notice, hasUnsavedWorkforceChanges, useConfirm } from "./shared";
import TaskWorkspace, { type TaskWorkspaceActions } from "./TaskWorkspace";
import TaskDetail from "./TaskDetail";
import MonthlyPayroll from "./MonthlyPayroll";
import RequestCenter from "./RequestCenter";
import DashboardJourneys from "./DashboardJourneys";
import DashboardLiveStatus from "./DashboardLiveStatus";
import ProgressOrbit from "./ProgressOrbit";
import PortalIntro from "@/components/layout/PortalIntro";
import TeamAttendanceCard from "./TeamAttendanceCard";

const count = (value: number) => value.toLocaleString("en-US");
const percent = (part: number, total: number) => total ? `${count(Math.round(part * 100 / total))}%` : "—";
const metrics: { key: keyof WorkMetrics; label: string; color: string }[] = [
  { key: "assigned", label: "المهام المسندة", color: "border-blue-200 bg-blue-50 text-blue-950" },
  { key: "completed", label: "المنجزة", color: "border-emerald-200 bg-emerald-50 text-emerald-950" },
  { key: "open", label: "المفتوحة", color: "border-sky-200 bg-sky-50 text-sky-950" },
  { key: "overdue", label: "المتأخرة", color: "border-rose-200 bg-rose-50 text-rose-950" },
  { key: "pending", label: "تسليمات معلقة", color: "border-amber-200 bg-amber-50 text-amber-950" },
];
const box = "min-w-0 rounded-3xl border p-5 shadow-[0_8px_28px_-18px_rgba(16,43,87,0.3)] sm:p-6";
const arrow = <span aria-hidden="true">←</span>;
const shortDate = (value: string) => new Date(value).toLocaleDateString("ar-SA", { calendar: "gregory", timeZone: "Asia/Riyadh", day: "numeric", month: "short" });
export default function AdminDashboard({ userId }: { userId: string }) {
  const [staffView, setStaffView] = useState<"all" | "attention" | "review">("all");
  const params = useSearchParams(), pathname = usePathname();
  const [data, setData] = useState<AdminWorkDashboard | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selectedPanel, setSelectedPanel] = useState("brief");
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [selectedPayroll, setSelectedPayroll] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<{ id?: string; tab: "requests" | "profile" } | null>(null);
  const detailOpen = !!selectedTask || !!selectedPayroll || !!selectedRequest;
  const workspace = useRef<TaskWorkspaceActions>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const pendingQuery = useRef(params.toString());
  const { confirm, confirmation } = useConfirm();
  const summaryParams = new URLSearchParams();
  for (const key of ["due_from", "due_to", "assignee_id", "client_name"]) { const value = params.get(key); if (value) summaryParams.set(key, value); }
  const summaryQuery = summaryParams.toString(), requestKey = `${summaryQuery}:${revision}`, loading = loadedKey !== requestKey, query = params.toString();
  useEffect(() => {
    const refresh = () => setRevision(n => n + 1);
    window.addEventListener("workforce-data-changed", refresh);
    window.addEventListener("workforce-dashboard-tick", refresh);
    return () => { window.removeEventListener("workforce-data-changed", refresh); window.removeEventListener("workforce-dashboard-tick", refresh); };
  }, []);
  useEffect(() => { pendingQuery.current = query; }, [query]);
  useEffect(() => {
    const abort = new AbortController();
    api<AdminWorkDashboard>(`/api/workforce/dashboard?${summaryQuery}`, { signal: abort.signal })
      .then(result => { setData(result); setError(""); setLoadedKey(requestKey); })
      .catch(e => { if (e.name !== "AbortError") { setData(null); setError(e.message); setLoadedKey(requestKey); } });
    return () => abort.abort();
  }, [summaryQuery, requestKey]);
  const scrollToWork = () => document.getElementById("admin-work")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  function filter(patch: Record<string, string>) {
    const next = new URLSearchParams(pendingQuery.current);
    for (const [key, value] of Object.entries(patch)) { if (value) next.set(key, value); else next.delete(key); }
    for (const key of ["page", "board_id", "scope", "archived", "column_id", "q"]) next.delete(key);
    pendingQuery.current = next.toString();
    window.history.replaceState(null, "", `${pathname}?${next}`);
    scrollToWork();
  }
  function metricFilter(key: keyof WorkMetrics, employee?: string) {
    filter({ state: key === "completed" ? "done" : key === "pending" ? "review" : "", overdue: key === "overdue" ? "true" : "", open: key === "open" ? "true" : "", blocked: "", ...(employee ? { assignee_id: employee } : {}) });
  }
  function changed() { setRevision(n => n + 1); window.dispatchEvent(new Event("workforce-notifications")); }
  function openTask(id: string, panel = "brief") { setSelectedPanel(panel); setSelectedTask(id); scrollToWork(); }
  function openRequests(tab: "requests" | "profile" = "requests", id?: string) { setSelectedRequest({ tab, id }); scrollToWork(); }
  async function closeRequests() {
    if (hasUnsavedWorkforceChanges() && !(await confirm("تجاهل التعديلات غير المحفوظة؟"))) return;
    setSelectedRequest(null);
  }
  const disabled = loading || !data || detailOpen;
  return <div className="mx-auto w-full min-w-0 max-w-screen-2xl space-y-6 p-4 md:p-6 lg:p-8" data-admin-dashboard>
    {confirmation}
    <PortalIntro title="فريقك، في الصورة" eyebrow="إدارة فريق النخبة" detail={data ? `آخر تحديث ${new Date(data.generated_at).toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" })}` : undefined}>
      <Button disabled={disabled} onClick={() => workspace.current?.createTask()}>＋ إسناد مهمة</Button><Button variant="outline" onClick={changed} disabled={loading}>{loading ? "جارٍ التحديث…" : "تحديث"}</Button><DashboardLiveStatus admin />
    </PortalIntro>
    <Notice message={error} error />
    <section aria-label="ملخص أداء الفريق" aria-busy={loading} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {metrics.map(item => <button key={item.key} type="button" disabled={disabled} onClick={() => metricFilter(item.key)} className={`group rounded-2xl border p-4 text-right transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-default disabled:opacity-60 motion-reduce:transform-none ${item.color}`}><span className="text-xs font-bold sm:text-sm">{item.label}</span><span className="mt-4 flex items-end justify-between"><strong className="text-3xl font-black tabular-nums">{data ? count(data.totals[item.key]) : "—"}</strong><span aria-hidden className="opacity-40">↗</span></span></button>)}
      <button type="button" disabled={disabled} onClick={() => openRequests()} className="group rounded-2xl border border-violet-200 bg-violet-50 p-4 text-right text-violet-950 transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-default disabled:opacity-60 motion-reduce:transform-none"><span className="text-xs font-bold sm:text-sm">طلبات معلقة</span><span className="mt-4 flex items-end justify-between"><strong className="text-3xl font-black tabular-nums">{data ? count(data.pendingRequestCount) : "—"}</strong><span aria-hidden className="opacity-40">↗</span></span></button>
    </section>
    <section aria-labelledby="staff-performance" className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="staff-performance" className="text-lg font-black text-dark">نبض الفريق</h2><div role="group" aria-label="تصفية أداء الموظفات" className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white/80 p-1">{([{ id: "all", title: "الفريق" }, { id: "attention", title: "تحتاج متابعة" }, { id: "review", title: "للاعتماد" }] as const).map(tab => <button key={tab.id} type="button" aria-pressed={staffView === tab.id} onClick={() => setStaffView(tab.id)} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${staffView === tab.id ? "bg-[#102b57] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>{tab.title}</button>)}</div></div>
      <div className="grid gap-4 md:grid-cols-2" data-staff-cards>
        {!data && loading && [0,1].map(n => <div key={n} role="status" aria-label="جارٍ تحميل أداء الموظفات" className="h-64 animate-pulse rounded-3xl border border-white bg-white/70 motion-reduce:animate-none" />)}
        {data?.employees.filter(employee => staffView === "all" || (staffView === "attention" ? employee.metrics.overdue > 0 || employee.metrics.blocked > 0 : employee.metrics.pending > 0)).map((employee, i) => <article key={employee.id} className={`${box} ${i % 2 ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-100/70 text-emerald-950" : "border-sky-200 bg-gradient-to-br from-sky-50 to-blue-100/80 text-sky-950"}`} data-staff-card={employee.id}>
          <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-xl font-black">{employee.full_name.trim().slice(0,1)}</span><div className="min-w-0"><h3 className="font-black">{employee.full_name}</h3><p className="mt-1 text-xs opacity-75">{employee.job_title || "دون مسمى"} · {STATUS_LABELS[employee.status]}</p></div></div><span className="shrink-0 rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold">{count(employee.metrics.assigned)} مسندة</span></div>
          <div className="my-5 grid grid-cols-3 gap-2">{metrics.filter(m => ["completed", "overdue", "pending"].includes(m.key)).map(m => <button key={m.key} type="button" disabled={disabled} onClick={() => metricFilter(m.key, employee.id)} className="rounded-xl border border-white/80 bg-white/60 p-3 text-right hover:bg-white disabled:opacity-60"><span className="block text-xs">{m.label}</span><strong className={`mt-2 block text-xl font-black tabular-nums ${m.key === "overdue" && employee.metrics.overdue ? "text-rose-700" : ""}`}>{count(employee.metrics[m.key])}</strong></button>)}</div>
          <div className="flex items-center gap-5 rounded-2xl border border-white/80 bg-white/45 p-3"><ProgressOrbit value={employee.metrics.assigned ? employee.metrics.completed * 100 / employee.metrics.assigned : 0} label={`نسبة إنجاز ${employee.full_name}`} detail="الإنجاز" className={i % 2 ? "text-emerald-600" : "text-sky-600"} /><div className="space-y-3 text-xs"><p>الالتزام بالموعد <strong className="mt-1 block text-lg">{percent(employee.metrics.on_time, employee.metrics.dated_completed)}</strong></p><p className={employee.metrics.blocked ? "font-bold text-amber-800" : "opacity-75"}>{employee.metrics.blocked ? `${count(employee.metrics.blocked)} مهام متوقفة` : "لا توجد عوائق مسجلة"}</p></div></div>
          <TeamAttendanceCard employeeId={employee.id} attendance={employee.attendance} refreshKey={data.generated_at} />
          <div className="mt-5 flex flex-wrap gap-2 border-t border-current/10 pt-4"><Button size="sm" disabled={disabled || employee.status !== "active"} onClick={() => workspace.current?.createTask(employee.id)}>إسناد مهمة</Button><Button size="sm" variant="outline" disabled={disabled} onClick={() => metricFilter("assigned",employee.id)}>عرض مهامها</Button><Button size="sm" variant="ghost" disabled={disabled} onClick={() => { setSelectedPayroll(employee.id); scrollToWork(); }}>الراتب والحوافز</Button></div>
        </article>)}
      </div>
      {data && !data.employees.some(employee => staffView === "all" || (staffView === "attention" ? employee.metrics.overdue > 0 || employee.metrics.blocked > 0 : employee.metrics.pending > 0)) && <p className={`${box} bg-white text-sm text-muted`}>لا توجد حالات ضمن هذه التصفية</p>}
      {!!data?.unassigned?.assigned && <p className="inline-block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">{count(data.unassigned.assigned)} مهام غير مسندة</p>}
    </section>
    <div className="grid items-stretch gap-4 md:grid-cols-2" data-admin-queues>
      <section aria-label="التسليمات بانتظار الاعتماد" className={`${box} flex flex-col border-[#244b77] bg-gradient-to-br from-[#102b57] to-[#234d7b] text-white`}><header className="mb-5 flex justify-between gap-3"><h2 className="text-lg font-black">التسليمات بانتظار الاعتماد</h2><span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold">{data ? count(data.totals.pending) : "—"}</span></header><div className="max-h-80 flex-1 space-y-3 overflow-y-auto overscroll-contain">{data && !data.pendingSubmissions.length && <p className="flex min-h-24 items-center text-sm text-blue-100">لا توجد تسليمات معلقة</p>}{data?.pendingSubmissions.map(row => <button type="button" key={row.id} disabled={disabled} onClick={() => openTask(row.taskId,"submit")} className="block w-full rounded-2xl border border-white/15 bg-white/10 p-4 text-right hover:bg-white/20 disabled:opacity-60"><span className="flex flex-wrap justify-between gap-2 text-xs text-blue-100"><span>{row.employeeName} · {row.client || "تطوير الشركة"}</span><time dateTime={row.createdAt}>{shortDate(row.createdAt)}</time></span><strong className="mt-2 block text-sm">{row.title}</strong><span className="mt-3 block text-xs font-bold text-[#e2c47b]">مراجعة واعتماد التسليم ←</span></button>)}</div><button type="button" disabled={disabled} onClick={() => metricFilter("pending")} className="mt-5 flex items-center justify-between border-t border-white/15 pt-4 text-sm font-bold disabled:opacity-60"><span>كل التسليمات</span>{arrow}</button></section>
      <section aria-label="الطلبات المعلقة" className={`${box} flex flex-col border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-100/60 text-violet-950`}><header className="mb-5 flex justify-between gap-3"><h2 className="text-lg font-black">الطلبات المعلقة</h2><span className="rounded-full bg-white/70 px-3 py-1 text-sm font-bold">{data ? count(data.pendingRequestCount) : "—"}</span></header><div className="max-h-80 flex-1 space-y-3 overflow-y-auto overscroll-contain">{data && !data.pendingRequests.length && <p className="flex min-h-24 items-center text-sm text-violet-800">لا توجد طلبات معلقة</p>}{data?.pendingRequests.map(row => <button type="button" key={row.id} disabled={disabled} onClick={() => openRequests(row.type,row.id)} className="block w-full rounded-2xl border border-violet-200/70 bg-white/70 p-4 text-right hover:bg-white disabled:opacity-60"><span className="flex flex-wrap justify-between gap-2 text-xs text-violet-700"><span>{row.employeeName}</span><time dateTime={row.createdAt}>{shortDate(row.createdAt)}</time></span><strong className="mt-2 block text-sm">{row.title}</strong><span className="mt-3 block text-xs font-bold">مراجعة واتخاذ القرار ←</span></button>)}</div><div className="mt-5 flex flex-wrap gap-4 border-t border-violet-900/10 pt-4 text-sm font-bold"><button type="button" disabled={disabled} onClick={() => openRequests()}>الطلبات الإدارية {arrow}</button><button type="button" disabled={disabled} onClick={() => openRequests("profile")}>تعديلات البيانات {arrow}</button></div></section>
    </div>
    <DashboardJourneys admin />
    <section id="admin-work" className="scroll-mt-32 rounded-3xl border border-border bg-white/80 p-4 sm:p-6" aria-label="إسناد المهام ومراجعة التسليمات">
      {selectedPayroll ? <MonthlyPayroll key={selectedPayroll} employeeId={selectedPayroll} admin onClose={() => setSelectedPayroll(null)} /> : selectedTask ? <TaskDetail key={selectedTask} id={selectedTask} initialPanel={selectedPanel} admin onChanged={changed} onClose={() => setSelectedTask(null)} /> : selectedRequest ? <><div className="mb-5"><Button variant="outline" onClick={() => void closeRequests()}>العودة للمهام {arrow}</Button></div><RequestCenter key={`${selectedRequest.tab}:${selectedRequest.id ?? "all"}`} admin embedded initialTab={selectedRequest.tab} initialRequest={selectedRequest.id} onChanged={changed} /></> : <TaskWorkspace admin userId={userId} embedded actionsRef={workspace} refreshKey={revision} clients={data?.clients} onOpenTask={openTask} onChanged={changed} />}
    </section>
  </div>;
}

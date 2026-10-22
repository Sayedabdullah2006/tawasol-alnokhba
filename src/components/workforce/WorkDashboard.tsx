import Link from "next/link";
import type { ReactNode } from "react";
import type { WorkforceActor } from "@/lib/workforce/server";
import { employeeDashboard } from "@/lib/workforce/employee-dashboard";

import DashboardJourneys from "./DashboardJourneys";
import EmployeeFocus from "./EmployeeFocus";
import AttendanceProgressCard from "./AttendanceProgressCard";
import PayrollCard from "./PayrollCard";

type IconName = "tasks" | "clock" | "check" | "review" | "calendar" | "wallet" | "request" | "profile";
const paths: Record<IconName, ReactNode> = {
  tasks: <><rect x="5" y="4" width="14" height="17" rx="3" /><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  review: <><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4M9 3v5h5M9 3l5 5" /><path d="m12 16 7-7 3 3-7 7-4 1z" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 11h18M7 15h3M14 15h3" /></>,
  wallet: <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 9h18M21 13h-6v4h6M7 5V3h10v2" /></>,
  request: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 22v-2a8 8 0 0 1 16 0v2" /></>,
};
function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
const card = "flex min-w-0 flex-col rounded-3xl border p-5 shadow-[0_8px_28px_-18px_rgba(16,43,87,0.3)] transition-shadow duration-300 hover:shadow-lg sm:p-6";
const footer = "mt-5 flex items-center justify-between gap-2 border-t border-current/10 pt-4 text-sm font-bold hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4";
const requestState: Record<string, string> = { pending: "بانتظار القرار", approved: "معتمد", rejected: "مرفوض", cancelled: "ملغى" };
function CardTitle({ title, icon, children }: { title: string; icon: IconName; children?: ReactNode }) {
  return <div className="mb-5 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-current/5"><Icon name={icon} /></span><h2 className="text-base font-black sm:text-lg">{title}</h2></div>{children}</div>;
}
export default async function WorkDashboard({ actor }: { actor: WorkforceActor }) {
  let data;
  try { data = await employeeDashboard(actor); }
  catch { return <p role="alert" className={`${card} bg-white`}>تعذر تحميل الملخص. <Link href="/employee" className="font-bold underline">إعادة المحاولة</Link></p>; }
  return <EmployeeDashboardView data={data} />;
}

function EmployeeDashboardView({ data }: { data: Awaited<ReturnType<typeof employeeDashboard>> }) {
  const { tasks, attendance, payroll } = data;
  const statistics: { label: string; value: number; href: string; icon: IconName; color: string }[] = [
    { label: "مهام مفتوحة", value: tasks.open, href: "/employee/work/tasks?scope=assigned&open=true", icon: "tasks", color: "border-blue-200/70 bg-blue-50 text-blue-900" },
    { label: "متأخرة", value: tasks.overdue, href: "/employee/work/tasks?scope=assigned&overdue=true&actionable=true", icon: "clock", color: "border-rose-200/70 bg-rose-50 text-rose-900" },
    { label: "بانتظار الاعتماد", value: tasks.review, href: "/employee/work/tasks?scope=assigned&state=review", icon: "review", color: "border-violet-200/70 bg-violet-50 text-violet-900" },
    { label: "مكتملة هذا الشهر", value: tasks.completedThisMonth, href: `/employee/work/tasks?scope=assigned&state=done&completed_from=${data.month}`, icon: "check", color: "border-emerald-200/70 bg-emerald-50 text-emerald-900" },
  ];
  return <div className="space-y-5" data-employee-dashboard={data.employee.id}>
    <nav className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="ملخص مهامي">
      {statistics.map(s => <Link key={s.label} href={s.href} className={`group rounded-2xl border p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 motion-reduce:transform-none sm:p-5 ${s.color}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold sm:text-sm">{s.label}</span><Icon name={s.icon} /></div><div className="mt-4 flex items-end justify-between"><span className="text-3xl font-black tabular-nums">{s.value.toLocaleString("en-US")}</span><span aria-hidden="true" className="opacity-40 transition group-hover:opacity-100">↗</span></div></Link>)}
    </nav>
    <div className="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-4" data-dashboard-panels>
      <EmployeeFocus today={tasks.today} upcoming={tasks.upcoming} todayCount={tasks.todayCount} upcomingCount={tasks.upcomingCount} />
      <AttendanceProgressCard summary={attendance.summary} open={attendance.open} leaveDays={data.leave.available} />

      <PayrollCard initial={payroll} month={data.month} employeeId={data.employee.id}/>
      <section className={`${card} border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-100/60 text-violet-950`} aria-label="طلباتي">
        <CardTitle title="طلباتي" icon="request"><span className="rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold">{data.requests.pending} معلقة</span></CardTitle>
        <div className="flex-1">{data.requests.latest.length ? <div className="space-y-2">{data.requests.latest.map(request => <Link key={request.id} href={`/employee/requests/history?request=${request.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-violet-200/60 bg-white/60 p-3 hover:bg-white"><p className="text-sm font-bold">{request.title}</p><span className="shrink-0 text-xs text-violet-700">{requestState[request.status]}</span></Link>)}</div> : <p className="flex min-h-24 items-center text-sm text-violet-800">لا توجد طلبات سابقة</p>}<Link href="/employee/requests/general" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-800"><span aria-hidden>＋</span>طلب جديد</Link></div>
        <Link href="/employee/requests/history" className={footer}><span>متابعة طلباتي</span><span aria-hidden>←</span></Link>
      </section>
      <section className={`${card} border-slate-200 bg-white text-[#102b57]`} aria-label="ملفي وأدواتي">
        <CardTitle title="ملفي وأدواتي" icon="profile" />
        <div className="grid flex-1 grid-cols-2 gap-2">{[
          { href: "/employee/profile/documents", title: "مستنداتي", detail: `${data.documents} مستند`, color: "bg-slate-50 hover:bg-slate-100" },
          { href: "/employee/profile/business-card", title: "بطاقة العمل", detail: "عرض وتنزيل ↗", color: "bg-amber-50 hover:bg-amber-100" },
          { href: "/employee/notifications/inbox", title: "الإشعارات", detail: `${data.unread} غير مقروءة`, color: "bg-blue-50 hover:bg-blue-100" },
          { href: "/employee/knowledge", title: "مركز المعرفة", detail: "ملفات الفريق ↗", color: "bg-violet-50 hover:bg-violet-100" },
        ].map(item => <Link key={item.href} href={item.href} className={`flex flex-col justify-center rounded-xl p-3 transition ${item.color}`}><span className="text-sm font-bold">{item.title}</span><span className="mt-2 text-xs text-slate-600">{item.detail}</span></Link>)}</div>
        <Link href="/employee/profile/job-description" className={footer}><span>الوصف الوظيفي</span><span aria-hidden>←</span></Link>
      </section>
    </div>
    <DashboardJourneys />
  </div>;
}


import Link from "next/link";
import type { ReactNode } from "react";
import type { WorkforceActor } from "@/lib/workforce/server";
import { employeeDashboard } from "@/lib/workforce/employee-dashboard";
import { TASK_STATES, workDate } from "@/lib/workforce/task-types";

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
const card = "flex min-w-0 flex-col rounded-3xl border p-5 shadow-[0_8px_28px_-18px_rgba(16,43,87,0.3)] sm:p-6";
const footer = "mt-5 flex items-center justify-between gap-2 border-t border-current/10 pt-4 text-sm font-bold hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4";
const requestState: Record<string, string> = { pending: "بانتظار القرار", approved: "معتمد", rejected: "مرفوض", cancelled: "ملغى" };
const money = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function CardTitle({ title, icon, children }: { title: string; icon: IconName; children?: ReactNode }) {
  return <div className="mb-5 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-current/5"><Icon name={icon} /></span><h2 className="text-base font-black sm:text-lg">{title}</h2></div>{children}</div>;
}
export default async function WorkDashboard({ actor }: { actor: WorkforceActor }) {
  let data;
  try { data = await employeeDashboard(actor); }
  catch { return <p role="alert" className={`${card} bg-white`}>تعذر تحميل الملخص. <Link href="/employee" className="font-bold underline">إعادة المحاولة</Link></p>; }
  const { tasks, attendance, payroll } = data;
  const beforeStart = data.today < data.employee.start_date;
  const attendanceState = beforeStart ? "قبل المباشرة" : attendance.open ? "الحضور مسجل" : attendance.minutes ? "تم الانصراف" : attendance.dayOff ? "يوم إجازة" : "لم يسجل الحضور";
  const progress = attendance.dailyMinutes > 0 ? Math.min(100, Math.max(0, attendance.minutes / attendance.dailyMinutes * 100)) : 0;
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
    <div className="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3" data-dashboard-panels>
      <section className={`${card} border-[#244b77] bg-gradient-to-br from-[#102b57] to-[#234d7b] text-white`} aria-label="المطلوب اليوم">
        <CardTitle title="المطلوب اليوم" icon="tasks"><time dateTime={data.today} className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-blue-100">{new Date(`${data.today}T12:00:00+03:00`).toLocaleDateString("ar-SA", { calendar: "gregory", timeZone: "Asia/Riyadh", day: "numeric", month: "short" })}</time></CardTitle>
        <div className="max-h-80 flex-1 space-y-3 overflow-y-auto overscroll-contain">
          {!tasks.today.length && <div className="flex min-h-32 flex-col items-start justify-center"><span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-[#e2c47b]"><Icon name="check" className="h-6 w-6" /></span><p className="font-bold">{beforeStart ? `تبدأ مباشرتك ${new Date(`${data.employee.start_date}T12:00:00+03:00`).toLocaleDateString("ar-SA", { calendar: "gregory", day: "numeric", month: "long", timeZone: "Asia/Riyadh" })}` : attendance.dayOff ? "يوم إجازة" : "لا توجد مهام مستحقة اليوم"}</p></div>}
          {tasks.today.map(task => <article key={task.id} data-today-task={task.id} className="rounded-2xl border border-white/15 bg-white/10 p-4"><div className="flex flex-wrap justify-between gap-2 text-xs text-blue-100"><span>{task.client_name || "تطوير الشركة"} · {TASK_STATES[task.state as keyof typeof TASK_STATES]}</span><span className={task.overdue ? "font-bold text-rose-200" : ""}>{task.overdue ? "متأخرة · " : ""}{workDate(task.due_at)}</span></div><h3 className="mt-3 font-bold"><Link href={`/employee/work/tasks/${task.id}`} className="hover:underline">{task.title}</Link></h3><p className="mt-3 text-xs font-bold text-blue-100">المطلوب تسليمه</p><p className="mt-1 whitespace-pre-line text-sm leading-7">{task.deliverable || "راجعي تفاصيل المهمة."}</p>{task.blocked_reason && <p className="mt-2 text-sm text-amber-200">العائق: {task.blocked_reason}</p>}<div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-blue-100">{task.estimate_minutes ? `${task.estimate_minutes} دقيقة` : ""}</span><Link href={`/employee/work/tasks/${task.id}?panel=submit`} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#102b57] hover:bg-blue-50">فتح المهمة والتسليم ←</Link></div></article>)}
        </div>
        <Link className={`${footer} text-white`} href={tasks.todayCount > tasks.today.length ? `/employee/work/tasks?scope=assigned&actionable=true&due_to=${data.today}` : "/employee/work/tasks?scope=assigned&open=true&sort=due"}><span>{tasks.todayCount > tasks.today.length ? "كل المهام المستحقة اليوم" : "فتح مهامي"}</span><span aria-hidden>←</span></Link>
      </section>
      <section className={`${card} border-sky-200 bg-gradient-to-br from-sky-50 to-blue-100/80 text-sky-950`} aria-label="الحضور والإجازات">
        <CardTitle title="الحضور والإجازات" icon="clock" />
        <div className="flex-1"><span className="inline-block rounded-full border border-sky-200 bg-white/70 px-3 py-1.5 text-xs font-bold">{attendanceState}</span>{!beforeStart && <><div className="mb-3 mt-5 flex items-end justify-between gap-2"><p className="font-black"><span className="text-3xl tabular-nums">{Math.floor(attendance.minutes / 60).toLocaleString("en-US")}</span><span className="mx-1 text-sm">س</span><span className="text-lg tabular-nums">{(attendance.minutes % 60).toLocaleString("en-US")}</span><span className="mx-1 text-sm">د</span></p>{!attendance.dayOff && <span className="text-xs text-sky-800">من {attendance.dailyMinutes / 60} ساعات</span>}</div>{!attendance.dayOff && <div role="progressbar" aria-label="إنجاز ساعات الدوام اليومية" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="h-2 overflow-hidden rounded-full bg-sky-200/70"><div style={{ width: `${progress}%` }} className="h-full rounded-full bg-sky-600" /></div>}</>}<div className="mt-5 flex justify-between text-sm"><span>رصيد الإجازة</span><strong>{data.leave.available} يوم</strong></div></div>
        <Link href="/employee/attendance/overview" className={footer}><span>{beforeStart || attendance.dayOff ? "الحضور والإجازات" : attendance.open ? "تسجيل الانصراف" : "فتح سجل الحضور"}</span><span aria-hidden>←</span></Link>
      </section>
      <section className={`${card} border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-100/80 text-emerald-950`} aria-label="مستحقاتي الخاصة">
        <CardTitle title="مستحقاتي" icon="wallet" />
        <div className="flex-1"><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{new Date(`${data.month}T12:00:00+03:00`).toLocaleDateString("ar-SA", { calendar: "gregory", month: "long", year: "numeric" })}</span>{payroll && <span className="rounded-full bg-white/70 px-3 py-1 font-bold">{payroll.status === "draft" ? "مسودة" : "معتمد"}</span>}</div>{payroll ? <><p className="mt-5 text-xs font-bold text-emerald-800">الصافي</p><p className="mt-1 flex flex-wrap items-baseline gap-2"><strong className="text-3xl font-black tabular-nums">{money(payroll.total_amount)}</strong><span className="text-sm">ر.س</span></p><div className="mt-5 flex flex-wrap justify-between gap-2 text-sm"><span>المصروف</span><strong>{money(payroll.paid_amount)} ر.س</strong></div></> : <p className="py-8 text-sm">لا يوجد كشف لهذا الشهر</p>}</div>
        <Link href="/employee/finance/overview" className={footer}><span>عرض كشف المستحقات</span><span aria-hidden>←</span></Link>
      </section>
      <section className={`${card} border-amber-200 bg-gradient-to-br from-amber-50 to-orange-100/70 text-amber-950`} aria-label="التسليمات القادمة">
        <CardTitle title="التسليمات القادمة" icon="calendar" />
        <div className="max-h-80 flex-1 overflow-y-auto overscroll-contain">{!tasks.upcoming.length ? <div className="flex min-h-24 items-center text-sm text-amber-800">لا توجد تسليمات قادمة</div> : <div className="divide-y divide-amber-900/10">{tasks.upcoming.map(task => <Link key={task.id} href={`/employee/work/tasks/${task.id}`} data-upcoming-task={task.id} className="block rounded-lg py-3 first:pt-0 hover:bg-white/40"><span className="text-xs text-amber-800">{task.client_name || "تطوير الشركة"}</span><p className="mt-1 text-sm font-bold">{task.title}</p><p className="mt-2 text-xs">{task.due_at ? workDate(task.due_at) : "دون موعد تسليم"}</p></Link>)}</div>}</div>
        <Link href="/employee/work/tasks?scope=assigned&open=true&sort=due" className={footer}><span>جدول مهامي</span><span aria-hidden>←</span></Link>
      </section>
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
  </div>;
}


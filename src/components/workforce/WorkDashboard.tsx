import Link from "next/link";
import type { WorkforceActor } from "@/lib/workforce/server";
import { employeeDashboard } from "@/lib/workforce/employee-dashboard";
import { TASK_STATES, workDate } from "@/lib/workforce/task-types";

const card = "rounded-2xl border border-border bg-white p-5";
const action =
  "inline-block rounded-xl bg-green px-4 py-2 text-sm font-bold text-white";
const requestState: Record<string, string> = {
  pending: "بانتظار القرار",
  approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغى",
};
const money = (value: number | string) =>
  Number(value).toLocaleString("ar-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default async function WorkDashboard({
  actor,
}: {
  actor: WorkforceActor;
}) {
  let data;
  try {
    data = await employeeDashboard(actor);
  } catch {
    return (
      <p role="alert" className={card}>
        تعذر تحميل الملخص.{" "}
        <Link href="/employee" className="font-bold text-green">
          إعادة المحاولة
        </Link>
      </p>
    );
  }
  const { tasks, attendance, payroll } = data;
  const beforeStart = data.today < data.employee.start_date;
  return (
    <div className="space-y-5" data-employee-dashboard={data.employee.id}>
      <div
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-label="ملخص مهامي"
      >
        {[
          [
            "مهام مفتوحة",
            tasks.open,
            "/employee/work/tasks?scope=assigned&open=true",
          ],
          [
            "متأخرة",
            tasks.overdue,
            "/employee/work/tasks?scope=assigned&overdue=true&actionable=true",
          ],
          [
            "بانتظار الاعتماد",
            tasks.review,
            "/employee/work/tasks?scope=assigned&state=review",
          ],
          [
            "مكتملة هذا الشهر",
            tasks.completedThisMonth,
            `/employee/work/tasks?scope=assigned&state=done&completed_from=${data.month}`,
          ],
        ].map(([label, value, href]) => (
          <Link href={String(href)} key={label} className={card}>
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-2 text-3xl font-black">{value}</p>
          </Link>
        ))}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className={card} aria-labelledby="today-work">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="today-work" className="text-xl font-black">
                المطلوب اليوم
              </h2>
              <time className="text-sm text-muted" dateTime={data.today}>
                {new Date(`${data.today}T12:00:00+03:00`).toLocaleDateString(
                  "ar-SA",
                  {
                    calendar: "gregory",
                    timeZone: "Asia/Riyadh",
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  },
                )}
              </time>
            </div>
            {!tasks.today.length && (
              <p className="mt-4 text-sm text-muted">
                {beforeStart
                  ? `تبدأ مباشرتك ${new Date(`${data.employee.start_date}T12:00:00+03:00`).toLocaleDateString("ar-SA", { calendar: "gregory", timeZone: "Asia/Riyadh", day: "numeric", month: "long" })}`
                  : attendance.dayOff
                    ? "إجازة اليوم؛ لا توجد تسليمات مستحقة."
                    : "لا توجد مهام مستحقة اليوم."}
              </p>
            )}
            <div className="mt-4 space-y-4">
              {tasks.today.map((task) => (
                <article
                  key={task.id}
                  className="rounded-xl border border-border p-4"
                  data-today-task={task.id}
                >
                  <div className="flex flex-wrap justify-between gap-2 text-xs">
                    <span>
                      {task.client_name || "تطوير الشركة"} ·{" "}
                      {TASK_STATES[task.state as keyof typeof TASK_STATES]}
                    </span>
                    <span
                      className={
                        task.overdue ? "font-bold text-red-700" : "text-muted"
                      }
                    >
                      {task.overdue ? "متأخرة · " : ""}
                      {workDate(task.due_at)}
                    </span>
                  </div>
                  <h3 className="mt-2 font-bold">
                    <Link href={`/employee/work/tasks/${task.id}`}>
                      {task.title}
                    </Link>
                  </h3>
                  <p className="mt-3 text-xs font-bold text-muted">
                    المطلوب تسليمه
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-7">
                    {task.deliverable || "راجعي تفاصيل المهمة."}
                  </p>
                  {task.blocked_reason && (
                    <p className="mt-2 text-sm text-amber-800">
                      العائق: {task.blocked_reason}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted">
                      {task.estimate_minutes
                        ? `${task.estimate_minutes} دقيقة`
                        : ""}
                    </span>
                    <Link
                      className={action}
                      href={`/employee/work/tasks/${task.id}?panel=submit`}
                    >
                      فتح المهمة والتسليم
                    </Link>
                  </div>
                </article>
              ))}
            </div>
            {tasks.todayCount > tasks.today.length && (
              <Link
                className="mt-4 inline-block text-sm font-bold text-green"
                href={`/employee/work/tasks?scope=assigned&actionable=true&due_to=${data.today}`}
              >
                كل المهام المستحقة اليوم ←
              </Link>
            )}
          </section>
          <section className={card} aria-labelledby="upcoming-work">
            <h2 id="upcoming-work" className="text-lg font-black">
              التسليمات القادمة
            </h2>
            {!tasks.upcoming.length && (
              <p className="mt-3 text-sm text-muted">لا توجد تسليمات قادمة.</p>
            )}
            <div className="mt-3 divide-y divide-border">
              {tasks.upcoming.map((task) => (
                <Link
                  key={task.id}
                  href={`/employee/work/tasks/${task.id}`}
                  className="block py-3"
                  data-upcoming-task={task.id}
                >
                  <span className="text-xs text-muted">{task.client_name}</span>
                  <p className="mt-1 font-bold">{task.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {task.due_at ? workDate(task.due_at) : "دون موعد تسليم"}
                  </p>
                </Link>
              ))}
            </div>
            <Link
              href="/employee/work/tasks?scope=assigned&open=true&sort=due"
              className="mt-3 inline-block text-sm font-bold text-green"
            >
              كل مهامي ←
            </Link>
          </section>
        </div>
        <div className="space-y-5">
          <section className={card}>
            <h2 className="text-lg font-black">الحضور والإجازات</h2>
            <p className="mt-3 font-bold">
              {beforeStart
                ? "قبل المباشرة"
                : attendance.open
                  ? "الحضور مسجل"
                  : attendance.minutes
                    ? "تم تسجيل الانصراف"
                    : attendance.dayOff
                      ? "يوم إجازة"
                      : "لم يسجل الحضور"}
            </p>
            {!beforeStart && (
              <p className="mt-2 text-sm text-muted">
                اليوم: {Math.floor(attendance.minutes / 60)} س{" "}
                {attendance.minutes % 60} د
                {!attendance.dayOff
                  ? ` / ${attendance.dailyMinutes / 60} ساعات`
                  : ""}
              </p>
            )}
            <p className="mt-3 text-sm">
              رصيد الإجازة: {data.leave.available} يوم
            </p>
            <Link
              href="/employee/attendance/overview"
              className="mt-4 inline-block text-sm font-bold text-green"
            >
              فتح الحضور والإجازات ←
            </Link>
          </section>
          <section className={card}>
            <div className="flex justify-between gap-2">
              <h2 className="text-lg font-black">طلباتي</h2>
              <span className="text-sm">{data.requests.pending} معلقة</span>
            </div>
            <div className="mt-3 space-y-2">
              {data.requests.latest.map((request) => (
                <Link
                  key={request.id}
                  href={`/employee/requests/history?request=${request.id}`}
                  className="block rounded-lg bg-slate-50 p-3 text-sm"
                >
                  <p className="font-bold">{request.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {requestState[request.status]}
                  </p>
                </Link>
              ))}
            </div>
            <div className="mt-4 flex gap-4 text-sm font-bold text-green">
              <Link href="/employee/requests/general">طلب جديد</Link>
              <Link href="/employee/requests/history">كل طلباتي ←</Link>
            </div>
          </section>
          <section className={card} aria-label="مستحقاتي الخاصة">
            <div className="flex justify-between gap-2">
              <h2 className="text-lg font-black">مستحقاتي</h2>
              <span className="text-xs text-muted">
                {new Date(`${data.month}T12:00:00+03:00`).toLocaleDateString(
                  "ar-SA",
                  { calendar: "gregory", month: "long", year: "numeric" },
                )}
              </span>
            </div>
            {payroll ? (
              <>
                <p className="mt-3 text-xs text-muted">
                  {payroll.status === "draft" ? "صافي متوقع" : "صافي معتمد"}
                </p>
                <p className="mt-1 text-2xl font-black">
                  {money(payroll.total_amount)} ر.س
                </p>
                <p className="mt-2 text-sm">
                  المصروف: {money(payroll.paid_amount)} ر.س
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted">لا يوجد كشف لهذا الشهر.</p>
            )}
            <Link
              href="/employee/finance/overview"
              className="mt-4 inline-block text-sm font-bold text-green"
            >
              عرض المستحقات ←
            </Link>
          </section>
          <section className={card}>
            <h2 className="text-lg font-black">ملفي والإشعارات</h2>
            <div className="mt-3 divide-y divide-border text-sm">
              <Link
                href="/employee/profile/job-description"
                className="block py-3"
              >
                {data.employee.job_title || "ملفي الوظيفي"} ←
              </Link>
              <Link
                href="/employee/profile/documents"
                className="flex justify-between py-3"
              >
                <span>مستنداتي</span>
                <span>{data.documents}</span>
              </Link>
              <Link
                href="/employee/notifications/inbox"
                className="flex justify-between py-3"
              >
                <span>إشعارات غير مقروءة</span>
                <span>{data.unread}</span>
              </Link>
              <Link
                href="/employee/work/tasks"
                className="block py-3 font-bold text-green"
              >
                مهام الفريق ←
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

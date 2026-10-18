import Link from "next/link";
import { employeePageActor } from "@/lib/workforce/employee-page";
import { employeeModules } from "@/lib/workforce/navigation";
import { FIELD_LABELS } from "@/lib/workforce/types";
import WorkDashboard from "@/components/workforce/WorkDashboard";
import MonthlyPayroll from "@/components/workforce/MonthlyPayroll";

export const dynamic = "force-dynamic";

export default async function Page() {
  const actor = await employeePageActor();
  const { employee, db } = actor;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
  }).format(new Date());
  const soonDate = new Date(`${today}T00:00:00Z`);
  soonDate.setUTCDate(soonDate.getUTCDate() + 30);
  const soon = soonDate.toISOString().slice(0, 10);
  const docCount = () =>
    db
      .from("wf_employee_documents")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employee.id)
      .is("archived_at", null);
  const taskCount = () => db.from("wf_tasks").select("id,column:wf_task_columns!inner(kind),board:wf_boards!inner(archived_at)", { count: "exact", head: true })
    .eq("assignee_id", employee.id).is("archived_at", null).is("board.archived_at", null);
  const [pending, documents, expiring, expired, bank, decisions, openTasks, reviewTasks] =
    await Promise.all([
      db
        .from("wf_profile_change_requests")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", employee.id)
        .eq("status", "pending"),
      docCount(),
      docCount().gte("expires_on", today).lte("expires_on", soon),
      docCount().lt("expires_on", today),
      db
        .from("wf_employee_bank_details")
        .select("iban,bank_name")
        .eq("employee_id", employee.id)
        .maybeSingle(),
      db
        .from("wf_profile_change_requests")
        .select("id,field,status,decision_reason,decided_at")
        .eq("employee_id", employee.id)
        .in("status", ["approved", "rejected"])
        .order("decided_at", { ascending: false })
        .limit(5),
      taskCount().neq("column.kind", "done"),
      taskCount().eq("column.kind", "review"),
    ]);
  const failed = [pending, documents, expiring, expired, bank, decisions, openTasks, reviewTasks].some(
    (result) => result.error,
  );
  const cards = [
    { label: "مهامي المفتوحة", count: openTasks.count, href: "/employee/work/tasks?scope=assigned&open=true", detail: "مهامك المسندة إليك، دون المكتملة" },
    { label: "تسليماتي قيد المراجعة", count: reviewTasks.count, href: "/employee/work/tasks?scope=assigned&state=review", detail: "تسليماتك التي تنتظر قرار الإدارة" },
    {
      label: "طلبات بانتظار الموافقة",
      count: pending.count,
      href: "/employee/requests/profile-change",
      detail: "طلبات تعديل البيانات",
    },
    {
      label: "مستنداتي",
      count: documents.count,
      href: "/employee/profile/documents",
      detail: "المستندات المتاحة لك",
    },
    {
      label: "تنتهي خلال 30 يومًا",
      count: expiring.count,
      href: "/employee/profile/documents",
      detail: "مستندات تحتاج متابعة",
    },
    {
      label: "مستندات منتهية",
      count: expired.count,
      href: "/employee/profile/documents",
      detail: "راجع صلاحيتها وارفع البديل",
    },
  ];
  const links = [
    { href: "/employee/work/tasks", label: "مهامي", description: "تنفيذ العمل ومتابعة التسليم وقرار المدير" },
    {
      href: "/employee/profile",
      label: "ملفي الوظيفي",
      description: "بيانات عملي وتحديث التواصل",
    },
    {
      href: "/employee/profile/documents",
      label: "مستنداتي",
      description: "رفع المستندات وتنزيلها",
    },
    {
      href: "/employee/requests/profile-change",
      label: "طلبات تعديل البيانات",
      description: "طلب جديد ومتابعة الموافقات",
    },
    {
      href: "/employee/finance/payment-details",
      label: "بيانات الصرف",
      description: "مراجعة البنك والآيبان",
    },
  ];
  const alerts: { text: string; href: string; label: string }[] = [];
  if (!failed) {
    if ((expired.count ?? 0) > 0)
      alerts.push({
        text: "لديك مستندات انتهت صلاحيتها. راجعها وارفع النسخ المحدثة.",
        href: "/employee/profile/documents",
        label: "مراجعة المستندات",
      });
    if ((expiring.count ?? 0) > 0)
      alerts.push({
        text: "بعض مستنداتك تنتهي خلال 30 يومًا.",
        href: "/employee/profile/documents",
        label: "متابعة الصلاحية",
      });
    if (!bank.data?.iban || !bank.data?.bank_name)
      alerts.push({
        text: "بيانات الصرف غير مكتملة. أرسل بياناتك الصحيحة لاعتمادها.",
        href: "/employee/requests/profile-change",
        label: "استكمال بيانات الصرف",
      });
    if (employee.contract_end && employee.contract_end <= soon)
      alerts.push({
        text:
          employee.contract_end < today
            ? "تاريخ نهاية التعاقد المسجل قد مضى. تواصل مع مدير النظام لمراجعته."
            : "تاريخ نهاية التعاقد المسجل خلال 30 يومًا. تواصل مع مدير النظام للمتابعة.",
        href: "/employee/profile",
        label: "عرض الملف الوظيفي",
      });
  }
  return (
    <div className="space-y-6 p-4 md:p-6">
      <section className="rounded-2xl bg-dark p-6 text-white md:p-8">
        <p className="text-sm text-white/70">مساحة العمل · تواصل النخبة</p>
        <h1 className="mt-3 break-words text-2xl font-black md:text-3xl">
          مرحبًا، {employee.full_name}
        </h1>
        <p className="mt-3 text-sm leading-7 text-white/80">
          ملخص بياناتك وطلباتك، وأهم ما يحتاج متابعتك.
        </p>
        <p className="mt-4 text-xs text-white/60">
          {new Intl.DateTimeFormat("ar-SA", {
            dateStyle: "full",
            calendar: "gregory",
            timeZone: "Asia/Riyadh",
          }).format(new Date())}
        </p>
      </section>
      <MonthlyPayroll employeeId={employee.id} compact />
      <WorkDashboard actor={actor} />
      {failed ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          تعذر تحميل بعض بيانات الملخص.{" "}
          <Link href="/employee" className="font-bold underline">
            أعد تحميل الملخص
          </Link>
        </div>
      ) : (
        <section
          aria-label="أرقامي"
          className="grid grid-cols-2 gap-3 xl:grid-cols-4"
        >
          {cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="rounded-2xl border border-border bg-white p-4 transition-shadow hover:shadow-md"
            >
              <p className="text-sm font-bold text-dark">{card.label}</p>
              <p className="my-3 text-3xl font-black text-green">
                {new Intl.NumberFormat("ar-SA").format(card.count ?? 0)}
              </p>
              <p className="text-xs leading-6 text-muted">{card.detail}</p>
            </Link>
          ))}
        </section>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="text-lg font-black">تنبيهات تحتاج انتباهك</h2>
          <div className="mt-4 space-y-3">
            {failed ? (
              <p className="text-sm text-muted">التنبيهات غير متاحة حاليًا.</p>
            ) : alerts.length ? (
              alerts.map((alert) => (
                <div
                  key={alert.text}
                  className="rounded-xl border border-amber-200 bg-amber-50 p-4"
                >
                  <p className="text-sm leading-7 text-amber-950">
                    {alert.text}
                  </p>
                  <Link
                    href={alert.href}
                    className="mt-2 inline-block text-sm font-bold text-dark underline"
                  >
                    {alert.label} ←
                  </Link>
                </div>
              ))
            ) : (
              <p className="text-sm leading-7 text-muted">
                لا توجد تنبيهات حاليًا تخص صلاحية المستندات أو اكتمال بيانات
                الصرف أو نهاية التعاقد.
              </p>
            )}
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="text-lg font-black">آخر القرارات على طلباتك</h2>
          <div className="mt-4 space-y-3">
            {decisions.error ? (
              <p className="text-sm text-muted">تعذر تحميل آخر القرارات.</p>
            ) : decisions.data?.length ? (
              decisions.data.map((decision) => (
                <Link
                  key={decision.id}
                  href="/employee/requests/profile-change"
                  className="block rounded-xl border border-border p-4"
                >
                  <p className="flex flex-wrap justify-between gap-2 text-sm font-bold">
                    <span>
                      {
                        FIELD_LABELS[
                          decision.field as keyof typeof FIELD_LABELS
                        ]
                      }
                    </span>
                    <span
                      className={
                        decision.status === "approved"
                          ? "text-green"
                          : "text-red-700"
                      }
                    >
                      {decision.status === "approved" ? "معتمد" : "مرفوض"}
                    </span>
                  </p>
                  <p className="mt-2 break-words text-sm leading-7 text-muted">
                    {decision.decision_reason}
                  </p>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted">
                ستظهر هنا قرارات مدير النظام على طلباتك.
              </p>
            )}
          </div>
        </section>
      </div>
      <section>
        <h2 className="mb-4 text-lg font-black">أقسام مساحة العمل</h2>
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {employeeModules.map((module) => (
            <Link
              key={module.key}
              href={`/employee/${module.key}`}
              className="rounded-2xl border border-border bg-white p-5 hover:shadow-md"
            >
              <p className="font-bold text-dark">{module.title} ←</p>
              <p className="mt-2 text-sm leading-7 text-muted">
                {module.purpose}
              </p>
            </Link>
          ))}
        </div>
        <h2 className="mb-4 text-lg font-black">الوصول السريع</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-2xl border border-border bg-white p-5 hover:shadow-md"
            >
              <p className="font-bold text-dark">{link.label} ←</p>
              <p className="mt-2 text-sm text-muted">{link.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

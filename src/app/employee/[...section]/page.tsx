import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import EmployeeProfile from "@/components/workforce/EmployeeProfile";
import { employeePageActor } from "@/lib/workforce/employee-page";
import {
  employeeModules,
  findEmployeeScreen,
} from "@/lib/workforce/navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const { section } = await params;
  const path = `/employee/${section.join("/")}`;
  const { employee } = await employeePageActor();
  if (path === "/employee/documents") redirect("/employee/profile/documents");
  if (path === "/employee/payment-details")
    redirect("/employee/finance/payment-details");
  const screen = findEmployeeScreen(path);
  const workspaceModule = employeeModules.find(
    (workspaceModule) =>
      `/employee/${workspaceModule.key}` === path ||
      workspaceModule.screens.some((item) => item.path === path),
  );
  if (!workspaceModule) notFound();
  if (screen?.live)
    return (
      <EmployeeProfile
        key={path}
        id={employee.id}
        role="employee"
        section={screen.live}
      />
    );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <nav
        aria-label="مسار الصفحة"
        className="flex flex-wrap gap-2 text-sm text-muted"
      >
        <Link href="/employee">الرئيسية</Link>
        <span>/</span>
        <Link href={`/employee/${workspaceModule.key}`}>{workspaceModule.title}</Link>
        {screen && (
          <>
            <span>/</span>
            <span aria-current="page">{screen.title}</span>
          </>
        )}
      </nav>
      <section className="rounded-2xl bg-dark p-6 text-white">
        <p className="mb-3 text-xs text-white/70">بوابة الموظف</p>
        <h1 className="text-2xl font-black">{screen?.title ?? workspaceModule.title}</h1>
        <p className="mt-3 text-sm leading-8 text-white/80">
          {screen?.purpose ?? workspaceModule.purpose}
        </p>
      </section>
      <p
        role="status"
        className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950"
      >
        معاينة الهيكلية: هذه الصفحة توضح مكان القسم وارتباطاته. الوظائف غير
        المفعلة لا تنشئ طلبات أو تغيّر أرصدة.
      </p>
      {!screen && (
        <section aria-label="صفحات القسم" className="grid gap-4 sm:grid-cols-2">
          {workspaceModule.screens.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className="rounded-2xl border border-border bg-white p-5 hover:shadow-md"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <h2 className="font-black">{item.title}</h2>
                <span
                  className={`text-xs ${item.available ? "text-green" : "text-muted"}`}
                >
                  {item.available ? "متاح" : "هيكل تمهيدي"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted">
                {item.purpose}
              </p>
              <p className="mt-4 text-sm font-bold">فتح الصفحة ←</p>
            </Link>
          ))}
        </section>
      )}
      {screen && (
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="font-black">يرتبط هذا القسم بـ</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {screen.related.map((path) => (
              <Link
                key={path}
                href={path}
                className="rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-slate-50"
              >
                {findEmployeeScreen(path)?.title ?? "القسم المرتبط"} ←
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="rounded-2xl border border-border bg-white p-5">
        <h2 className="font-black">الارتباط بإدارة الشركة</h2>
        <p className="mt-3 text-sm leading-7 text-muted">{workspaceModule.adminArea}</p>
        <p className="mt-2 text-sm leading-7 text-muted">
          يعرض الموظف بياناته وما تمت مشاركته معه، ويتولى مدير النظام التكليف
          والاعتماد والسياسات حسب نوع الإجراء.
        </p>
      </section>
    </div>
  );
}

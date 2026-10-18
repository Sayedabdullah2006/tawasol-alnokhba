import Link from "next/link";
import { Suspense } from "react";
import { employeePageActor } from "@/lib/workforce/employee-page";
import EmployeeLiveUpdates from "@/components/workforce/EmployeeLiveUpdates";
import WorkDashboard from "@/components/workforce/WorkDashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const actor = await employeePageActor();
  return (
    <div className="space-y-5 p-4 md:p-6">
      <EmployeeLiveUpdates />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">
          مرحبًا، {actor.employee.full_name}
        </h1>
        <nav className="flex flex-wrap gap-2" aria-label="إجراءات سريعة">
          {[
            ["/employee/work/tasks?scope=assigned", "مهامي"],
            ["/employee/requests/general", "طلب جديد"],
            ["/employee/finance/overview", "مستحقاتي"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-xl border border-border bg-white px-4 py-3 text-sm font-bold"
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <Suspense fallback={<p role="status">جارٍ تحميل المهام…</p>}>
        <WorkDashboard actor={actor} />
      </Suspense>
    </div>
  );
}

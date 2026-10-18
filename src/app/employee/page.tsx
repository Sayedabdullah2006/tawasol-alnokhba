import { Suspense } from "react";
import { employeePageActor } from "@/lib/workforce/employee-page";
import EmployeeLiveUpdates from "@/components/workforce/EmployeeLiveUpdates";
import WorkDashboard from "@/components/workforce/WorkDashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const actor = await employeePageActor();
  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <EmployeeLiveUpdates />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-black text-dark sm:text-2xl">مرحبًا، {actor.employee.full_name}</h1><p className="mt-2 text-sm text-muted">{actor.employee.job_title}</p></div>
        <time className="rounded-full border border-white/80 bg-white/70 px-4 py-2 text-sm font-bold text-dark" dateTime={new Date().toISOString()}>{new Date().toLocaleDateString("ar-SA", { calendar: "gregory", timeZone: "Asia/Riyadh", weekday: "long", day: "numeric", month: "long" })}</time>
      </header>
      <Suspense fallback={<div role="status" aria-label="جارٍ تحميل لوحة العمل" className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[1,2,3,4].map(n => <div key={n} className="h-32 animate-pulse rounded-2xl border border-white/80 bg-white/60 motion-reduce:animate-none" />)}</div>}>
        <WorkDashboard actor={actor} />
      </Suspense>
    </div>
  );
}

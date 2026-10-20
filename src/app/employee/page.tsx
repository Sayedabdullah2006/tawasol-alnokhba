import { Suspense } from "react";
import { employeePageActor } from "@/lib/workforce/employee-page";
import EmployeeLiveUpdates from "@/components/workforce/EmployeeLiveUpdates";
import WorkDashboard from "@/components/workforce/WorkDashboard";
import DashboardLiveStatus from "@/components/workforce/DashboardLiveStatus";
import PortalIntro from "@/components/layout/PortalIntro";
export const dynamic = "force-dynamic";
export default async function Page() {
  const actor = await employeePageActor();
  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <EmployeeLiveUpdates />
      <PortalIntro title={`مرحبًا، ${actor.employee.full_name.split(" ")[0]}`} eyebrow="مساحة عملك في النخبة" detail={actor.employee.job_title}><DashboardLiveStatus /></PortalIntro>
      <Suspense fallback={<div role="status" aria-label="جارٍ تحميل لوحة العمل" className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[1,2,3,4].map(n => <div key={n} className="h-32 animate-pulse rounded-2xl border border-white/80 bg-white/60 motion-reduce:animate-none" />)}</div>}>
        <WorkDashboard actor={actor} />
      </Suspense>
    </div>
  );
}

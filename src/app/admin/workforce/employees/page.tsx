import { Suspense } from "react";
import EmployeeDirectory from "@/components/workforce/EmployeeDirectory";
import { requireAdmin, workforceActor } from "@/lib/workforce/server";
export default async function Page() {
  const actor = await workforceActor();
  requireAdmin(actor);
  return (
    <Suspense fallback={<p className="p-8">جارٍ تحميل الفريق…</p>}>
      <EmployeeDirectory userId={actor.user.id} />
    </Suspense>
  );
}

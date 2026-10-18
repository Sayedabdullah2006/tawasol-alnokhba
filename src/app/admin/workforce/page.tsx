import { Suspense } from "react";
import AdminDashboard from "@/components/workforce/AdminDashboard";
import { requireAdmin, workforceActor } from "@/lib/workforce/server";
export default async function Page() {
  const actor = await workforceActor();
  requireAdmin(actor);
  return (
    <Suspense fallback={<p className="p-8">جارٍ تحميل الفريق…</p>}>
      <AdminDashboard userId={actor.user.id} />
    </Suspense>
  );
}

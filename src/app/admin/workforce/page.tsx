import { Suspense } from "react";
import SalesSummary from '@/components/workforce/SalesSummary';
import AdminDashboard from "@/components/workforce/AdminDashboard";
import { requireAdmin, workforceActor } from "@/lib/workforce/server";
export default async function Page() {
  const actor = await workforceActor();
  requireAdmin(actor);
  return (
    <><div className="px-4 pt-5 md:px-8"><Suspense fallback={null}><SalesSummary actor={actor}/></Suspense></div><Suspense fallback={<p className="p-8">جارٍ تحميل الفريق…</p>}>
      <AdminDashboard userId={actor.user.id} />
    </Suspense></>
  );
}

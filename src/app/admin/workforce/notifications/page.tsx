import WorkforceTestMode from "@/components/workforce/WorkforceTestMode";
import NotificationCenter from "@/components/workforce/NotificationCenter";
import { requireAdmin, workforceActor } from "@/lib/workforce/server";
export default async function Page() {
  requireAdmin(await workforceActor());
  return (
    <>
      <div className="mx-auto max-w-6xl p-4 md:px-8">
        <WorkforceTestMode admin />
      </div>
      <NotificationCenter admin />
    </>
  );
}

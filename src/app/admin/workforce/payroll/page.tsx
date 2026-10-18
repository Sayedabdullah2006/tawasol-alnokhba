import PayrollHub from "@/components/workforce/PayrollHub";
import { requireAdmin, workforceActor } from "@/lib/workforce/server";
export default async function Page() {
  requireAdmin(await workforceActor());
  return <PayrollHub />;
}

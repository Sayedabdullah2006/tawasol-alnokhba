import Link from "next/link";
import { workforceActor, requireAdmin } from "@/lib/workforce/server";
import AccountSettings from "@/components/workforce/AccountSettings";
export default async function AdminAccountPage() {
  const actor = await workforceActor(); requireAdmin(actor);
  return <><AccountSettings name="مدير الشركة" email={actor.user.email ?? ""} cardHref="/admin/workforce/profile/business-card" /><div className="mx-auto max-w-4xl px-8"><Link href="/admin/workforce" className="text-sm font-bold text-dark">العودة لإدارة الفريق</Link></div></>;
}

import { redirect } from "next/navigation";
import { workforceActor } from "@/lib/workforce/server";
import { WorkforceError } from "@/lib/workforce/validation";
import AdminNavigation from "@/components/workforce/AdminNavigation";
export default async function WorkforceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let actor;
  try {
    actor = await workforceActor();
  } catch (error) {
    if (error instanceof WorkforceError && error.status === 401)
      redirect("/auth/login?next=/admin/workforce");
    if (error instanceof WorkforceError && error.status === 403)
      redirect("/employee/unavailable");
    throw error;
  }
  if (actor.role !== "admin") redirect("/employee");
  return <><AdminNavigation />{children}</>;
}

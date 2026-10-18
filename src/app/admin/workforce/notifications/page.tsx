import NotificationCenter from "@/components/workforce/NotificationCenter";
import { requireAdmin, workforceActor } from "@/lib/workforce/server";
export default async function Page() { requireAdmin(await workforceActor()); return <NotificationCenter />; }

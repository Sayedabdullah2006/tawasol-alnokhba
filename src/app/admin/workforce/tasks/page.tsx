import { Suspense } from "react";
import TaskWorkspace from "@/components/workforce/TaskWorkspace";
import { requireAdmin, workforceActor } from "@/lib/workforce/server";
export default async function Page() { const actor = await workforceActor(); requireAdmin(actor); return <Suspense fallback={<p className="p-6">جارٍ تحميل مساحة العمل…</p>}><TaskWorkspace admin userId={actor.user.id} /></Suspense>; }

import { Suspense } from "react";
import TaskWorkspace from "@/components/workforce/TaskWorkspace";
import { employeePageActor } from "@/lib/workforce/employee-page";
export default async function Page() { const actor = await employeePageActor(); return <Suspense fallback={<p className="p-6">جارٍ تحميل مهامك…</p>}><TaskWorkspace admin={false} userId={actor.user.id} employeeId={actor.employee.id} /></Suspense>; }

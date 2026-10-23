import { Suspense } from "react";
import TaskWorkspace from "@/components/workforce/TaskWorkspace";
import { employeePageActor } from "@/lib/workforce/employee-page";
import EmployeeTaskFocus from "@/components/workforce/EmployeeTaskFocus";
export default async function Page() {
  const actor = await employeePageActor();
  return (
    <div className="space-y-5">
    <div className="px-4 pt-4 md:px-8"><Suspense fallback={<p role="status">جارٍ تحميل المطلوب اليوم…</p>}><EmployeeTaskFocus actor={actor} /></Suspense></div>
    <Suspense fallback={<p className="p-6">جارٍ تحميل مهامك…</p>}>
      <TaskWorkspace
        admin={false}
        canManageTasks={actor.canManageTasks}
        userId={actor.user.id}
        employeeId={actor.employee.id}
      />
    </Suspense>
    </div>
  );
}

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type { WorkforceActor } from "@/lib/workforce/server";
import { WorkforceError } from "@/lib/workforce/validation";
import { routeStaffDepartment } from "./department-routing";
import type { OfficeStaff } from "./domain";
import { hostEmployeeTasks } from "./host-team";

type DirectoryPerson = Omit<OfficeStaff, "metrics"> & {
  ownSessionId: string | null;
  manualState: "available" | "busy" | null;
};
export async function officeDirectory(actorId: string, workspace: string) {
  const db = await createServiceRoleClient();
  const { data, error } = await db.rpc("vo_staff_directory", {
    p_actor: actorId,
    p_workspace: workspace,
  });
  if (error) throw error;
  return {
    now: data.now as string,
    staff: (data.staff as DirectoryPerson[]).map((person) => ({
      ...person,
      ...(() => {
        const routing = routeStaffDepartment(
          person.jobTitle,
          person.registeredDepartment || "",
        );
        return {
          officeDepartment: routing.department,
          departmentReason: routing.reason,
        };
      })(),
    })),
  };
}
export async function employeeOfficeSnapshot(actor: WorkforceActor) {
  if (!actor.employee)
    throw new WorkforceError("افتح المكتب من حساب الموظف", 403);
  const directory = await officeDirectory(
    actor.user.id,
    process.env.VIRTUAL_OFFICE_WORKSPACE_ID || "nukhba",
  );
  const tasks = await hostEmployeeTasks(actor.db, actor.employee.id);
  const self = directory.staff.find(
    (person) => person.id === actor.employee!.id,
  );
  if (!self) throw new WorkforceError("الحساب الوظيفي غير نشط", 403);
  return {
    now: directory.now,
    employeeId: actor.employee.id,
    sessionId: self.ownSessionId,
    manualState: self.manualState || "available",
    canManageTasks: actor.canManageTasks,
    staff: directory.staff.map((person) => ({
      id: person.id,
      name: person.name,
      jobTitle: person.jobTitle,
      registeredDepartment: person.registeredDepartment,
      officeDepartment: person.officeDepartment,
      departmentReason: person.departmentReason,
      appearance: person.appearance,
      presence: person.presence,
    })),
    tasks,
  };
}
export type EmployeeOfficeSnapshot = Awaited<
  ReturnType<typeof employeeOfficeSnapshot>
>;

import "server-only";
import { redirect } from "next/navigation";
import { workforceActor } from "./server";
import { WorkforceError } from "./validation";

export async function employeePageActor() {
  let actor;
  try {
    actor = await workforceActor();
  } catch (error) {
    if (error instanceof WorkforceError && error.status === 401)
      redirect("/auth/login?next=/employee");
    if (error instanceof WorkforceError && error.status === 403)
      redirect("/employee/unavailable");
    throw error;
  }
  if (actor.role === "admin") redirect("/admin/workforce");
  return { ...actor, employee: actor.employee! };
}

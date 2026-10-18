import { employeeDashboard } from "@/lib/workforce/employee-dashboard";
import { apiError, workforceActor } from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";

export async function GET() {
  try {
    return privateResponse(await employeeDashboard(await workforceActor()));
  } catch (error) {
    return apiError(error);
  }
}

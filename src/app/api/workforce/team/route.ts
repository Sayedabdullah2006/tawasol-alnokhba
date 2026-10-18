import {
  apiError,
  createServiceRoleClient,
  workforceActor,
} from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";
import { workPage, workSearch } from "@/lib/workforce/task-server";
import { WorkforceError } from "@/lib/workforce/validation";

// Team work identity only; HR records, contact and pay remain private.
export async function GET(request: Request) {
  try {
    const actor = await workforceActor();
    const params = new URL(request.url).searchParams;
    const assignable = params.get("assignable") === "true";
    if (assignable && !actor.canManageTasks)
      throw new WorkforceError("ليس لديك صلاحية إسناد المهام", 403);
    const service = await createServiceRoleClient();
    const result = await service
      .from("wf_employees")
      .select("id,full_name")
      .eq("status", "active")
      .order("full_name")
      .limit(1000);
    if (result.error) throw result.error;
    const admins = assignable
      ? await service
          .from("wf_task_assignment_admins")
          .select("user_id,display_name,profile:profiles!inner(role)")
          .eq("profile.role", "admin")
      : { data: [], error: null };
    if (admins.error) throw admins.error;
    const rows = [
      ...(result.data || []),
      ...(admins.data || []).map((row) => ({
        id: `admin:${row.user_id}`,
        full_name: row.display_name,
      })),
    ].filter((row) => row.full_name.includes(workSearch(params)));
    const { from, to } = workPage(params);
    return privateResponse({
      employees: params.has("page") ? rows.slice(from, to + 1) : rows,
      count: rows.length,
    });
  } catch (error) {
    return apiError(error);
  }
}

import { workforceActor, apiError } from "@/lib/workforce/server";
import { privateResponse, workPage } from "@/lib/workforce/task-server";
import { WorkforceError } from "@/lib/workforce/validation";

export async function GET(request: Request) {
  try {
    const actor = await workforceActor();
    if (!actor.employee) throw new WorkforceError("هذه الصفحة للموظفة", 403);
    const params = new URL(request.url).searchParams;
    const { page, from, to } = workPage(params);
    const mode = params.get("mode");
    if (!["time", "deliveries"].includes(mode || ""))
      throw new WorkforceError("القسم غير صحيح");
    const result =
      mode === "time"
        ? await actor.db
            .from("wf_task_time_entries")
            .select(
              "id,task_id,starts_at,ends_at,note,task:wf_tasks!inner(id,title,client_name)",
              { count: "exact" },
            )
            .eq("employee_id", actor.employee.id)
            .is("archived_at", null)
            .order("starts_at", { ascending: false })
            .order("id")
            .range(from, to)
        : await actor.db
            .from("wf_task_submissions")
            .select(
              "id,task_id,summary,status,decision_reason,created_at,task:wf_tasks!inner(id,title,client_name)",
              { count: "exact" },
            )
            .eq("submitted_by", actor.user.id)
            .order("created_at", { ascending: false })
            .order("id")
            .range(from, to);
    if (result.error) throw result.error;
    return privateResponse({ rows: result.data, count: result.count, page });
  } catch (error) {
    return apiError(error);
  }
}

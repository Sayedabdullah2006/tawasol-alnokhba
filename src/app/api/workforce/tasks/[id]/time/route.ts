import { apiError, workforceActor } from "@/lib/workforce/server";
import { privateResponse, workPage } from "@/lib/workforce/task-server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await workforceActor();
    const id = uuid((await params).id);
    const search = new URL(request.url).searchParams;
    const { page, from, to } = workPage(search);
    const task = await actor.db
      .from("wf_tasks")
      .select(
        "id,assignee_id,co_assignee_ids,estimate_minutes,archived_at,board:wf_boards!inner(archived_at)",
      )
      .eq("id", id)
      .maybeSingle();
    if (task.error) throw task.error;
    if (!task.data) throw new WorkforceError("المهمة غير متاحة", 404);
    const entryId = search.get("entry_id");
    if (entryId) {
      const entry = await actor.db
        .from("wf_task_time_entries")
        .select("id,created_by")
        .eq("id", uuid(entryId))
        .eq("task_id", id)
        .maybeSingle();
      if (entry.error) throw entry.error;
      if (!entry.data) throw new WorkforceError("سجل الوقت غير متاح", 404);
      const owner = entry.data.created_by;
      const result = await actor.db
        .from("wf_task_time_revisions")
        .select(
          "version,starts_at,ends_at,note,archived,action,reason,changed_by,created_at",
          { count: "exact" },
        )
        .eq("entry_id", entry.data.id)
        .order("version", { ascending: false })
        .range(from, to);
      if (result.error && result.error.code !== "PGRST103") throw result.error;
      return privateResponse({
        revisions: (result.data ?? []).map(({ changed_by, ...row }) => ({
          ...row,
          actorName: changed_by === owner ? "صاحب السجل" : "مدير النظام",
        })),
        count: result.count ?? 0,
        page,
      });
    }
    const board = Array.isArray(task.data.board)
      ? task.data.board[0]
      : task.data.board;
    const active = !task.data.archived_at && !board?.archived_at;
    const canRecord =
      !!actor.employee &&
      active &&
      (task.data.assignee_id === actor.employee.id || task.data.co_assignee_ids.includes(actor.employee.id));
    let query = actor.db
      .from("wf_task_time_entries")
      .select(
        "id,version,employee_id,starts_at,ends_at,note,archived_at,employee:wf_employees(full_name)",
        { count: "exact" },
      )
      .eq("task_id", id)
      .order("starts_at", { ascending: false })
      .order("id")
      .range(from, to);
    query =
      search.get("archived") === "true"
        ? query.not("archived_at", "is", null)
        : query.is("archived_at", null);
    const [result, summary] = await Promise.all([
      query,
      actor.db.rpc("wf_time_summary", { p_task: id }),
    ]);
    if (result.error && result.error.code !== "PGRST103") throw result.error;
    if (summary.error) throw summary.error;
    return privateResponse({
      entries: (result.data ?? []).map(({ employee_id, employee, ...row }) => ({
        ...row,
        employeeName:
          (Array.isArray(employee) ? employee[0] : employee)?.full_name ??
          "موظف",
        canEdit:
          canRecord && employee_id === actor.employee?.id && !row.archived_at,
        canArchive:
          active &&
          (actor.role === "admin" ||
            (canRecord && employee_id === actor.employee?.id)),
      })),
      summary: summary.data,
      admin: actor.role === "admin",
      canRecord,
      estimateMinutes: task.data.estimate_minutes,
      archived: search.get("archived") === "true",
      count: result.count ?? 0,
      page,
    });
  } catch (error) {
    return apiError(error);
  }
}

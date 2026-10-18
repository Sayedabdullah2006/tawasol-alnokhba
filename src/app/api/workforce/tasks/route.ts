import { apiError, createServiceRoleClient, workforceActor } from "@/lib/workforce/server";
import {
  privateResponse,
  workCommand,
  workPage,
  workSearch,
} from "@/lib/workforce/task-server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";
import { TASK_SCOPES, executionScope } from "@/lib/workforce/task-scope";

export async function GET(request: Request) {
  try {
    const actor = await workforceActor();
    const params = new URL(request.url).searchParams;
    const { page, from, to } = workPage(params);
    const scope = params.get("scope") || "";
    if (scope && !Object.hasOwn(TASK_SCOPES, scope))
      throw new WorkforceError("تصفية المشاركة غير صحيحة");
    if (scope && !actor.employee)
      throw new WorkforceError("تصفية المشاركة متاحة لحساب الموظف فقط", 400);
    const sort = params.get("sort") ?? "updated";
    if (!["updated", "due", "title", "position"].includes(sort))
      throw new WorkforceError("ترتيب غير صحيح");
    let query = actor.db
      .from("wf_tasks")
      .select(
        "*,column:wf_task_columns!inner(id,title,kind),board:wf_boards!inner(id,title,archived_at),my_membership:wf_task_members()",
        { count: "exact" },
      )
      .order(
        sort === "updated" ? "updated_at" : sort === "due" ? "due_at" : sort,
        { ascending: sort !== "updated", nullsFirst: false },
      )
      .order("id")
      .range(from, to);
    if (scope && actor.employee) {
      if (scope === "assigned") query = query.eq("assignee_id", actor.employee.id);
      else {
        query = query.eq("my_membership.employee_id", actor.employee.id)
          .eq("my_membership.participation", scope === "watcher" ? "watcher" : "participant");
        query = scope === "executing"
          ? query.or(executionScope(actor.employee.id))
          : query.not("my_membership", "is", null);
      }
    }
    query =
      params.get("archived") === "true"
        ? query.not("archived_at", "is", null)
        : query.is("archived_at", null);
    // An explicitly opened archived board remains readable, but its tasks no longer
    // appear in the daily cross-board work list.
    if (!params.get("board_id")) query = query.is("board.archived_at", null);
    for (const field of ["board_id", "assignee_id", "column_id", "parent_id"]) {
      const value = params.get(field);
      if (value) query = query.eq(field, uuid(value));
    }
    const priority = params.get("priority");
    if (priority) {
      if (!["low", "normal", "high", "urgent"].includes(priority))
        throw new WorkforceError("أولوية غير صحيحة");
      query = query.eq("priority", priority);
    }
    const state = params.get("state");
    if (state) {
      if (!["new", "in_progress", "review", "changes", "done"].includes(state))
        throw new WorkforceError("حالة غير صحيحة");
      query = query.eq("column.kind", state);
    }
    if (params.get("blocked") === "true")
      query = query.neq("blocked_reason", "");
    if (params.get("open") === "true") query = query.neq("column.kind", "done");
    if (params.get("overdue") === "true")
      query = query
        .lt("due_at", new Date().toISOString())
        .neq("column.kind", "done");
    const clientName = (params.get("client_name") ?? "").trim().slice(0, 150);
    if (clientName) query = query.eq("client_name", clientName);
    for (const [param, method] of [["due_from", "gte"], ["due_to", "lte"]] as const) {
      const value = params.get(param);
      if (value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))) throw new WorkforceError("تاريخ التصفية غير صحيح");
        query = query[method]("due_at", `${value}T${method === "gte" ? "00:00:00" : "23:59:59.999"}+03:00`);
      }
    }
    const search = workSearch(params);
    if (search) query = query.ilike("title", `%${search}%`);
    const { data, count, error } = await query;
    if (error && error.code !== "PGRST103") throw error;
    const service = await createServiceRoleClient();
    const ids = [...new Set((data ?? []).map(task => task.assignee_id).filter(Boolean))];
    const names = ids.length ? await service.from("wf_employees").select("id,full_name").in("id", ids) : { data: [], error: null };
    if (names.error) throw names.error;
    const nameMap = new Map((names.data ?? []).map(row => [row.id, row.full_name]));
    return privateResponse({
      tasks: (data ?? []).map((task) => ({
        ...task,
        assigneeName: nameMap.get(task.assignee_id) ?? null,
        canWork:
          actor.role === "admin" ||
          task.assignee_id === actor.employee?.id,
      })),
      count: count ?? 0,
      page,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  return workCommand(request, "task");
}

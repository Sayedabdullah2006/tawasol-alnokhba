import { apiError, workforceActor } from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await workforceActor();
    const id = uuid((await params).id);
    const { data: board, error } = await actor.db.from("wf_boards").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!board) throw new WorkforceError("اللوحة غير متاحة", 404);
    const [columns, membership] = await Promise.all([
      actor.db.from("wf_task_columns").select("*").eq("board_id", id).order("position").order("id"),
      actor.employee ? actor.db.from("wf_board_members").select("employee_id").eq("board_id", id).eq("employee_id", actor.employee.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (columns.error || membership.error) throw columns.error || membership.error;
    return privateResponse({ board, columns: columns.data, canManage: actor.role === "admin", canCreate: !board.archived_at && (actor.role === "admin" || (board.allow_self_tasks && !!membership.data)) });
  } catch (error) { return apiError(error); }
}

import {
  apiError,
  createServiceRoleClient,
  workforceActor,
} from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await workforceActor();
    const id = uuid((await params).id);
    const task = await actor.db
      .from("wf_tasks")
      .select(
        "id,version,assignee_id,shared_with_board,archived_at,board:wf_boards!inner(archived_at)",
      )
      .eq("id", id)
      .maybeSingle();
    if (task.error) throw task.error;
    if (!task.data) throw new WorkforceError("المهمة غير متاحة", 404);
    const members = await actor.db
      .from("wf_task_members")
      .select("employee_id,participation")
      .eq("task_id", id)
      .order("created_at")
      .order("employee_id")
      .limit(100);
    if (members.error) throw members.error;
    const ids = [
      ...new Set([
        ...members.data.map((m) => m.employee_id),
        ...(task.data.assignee_id ? [task.data.assignee_id] : []),
      ]),
    ];
    const service = await createServiceRoleClient();
    const identities = ids.length
      ? await service.from("wf_employees").select("id,full_name").in("id", ids)
      : { data: [], error: null };
    if (identities.error) throw identities.error;
    const names = new Map(
      identities.data?.map((employee) => [employee.id, employee.full_name]),
    );
    const board = Array.isArray(task.data.board)
      ? task.data.board[0]
      : task.data.board;
    return privateResponse({
      version: task.data.version,
      sharedWithBoard: task.data.shared_with_board,
      canManage:
        actor.role === "admin" && !task.data.archived_at && !board?.archived_at,
      assignee: task.data.assignee_id
        ? {
            employee_id: task.data.assignee_id,
            name: names.get(task.data.assignee_id) ?? "موظف",
          }
        : null,
      members: members.data.map((member) => ({
        ...member,
        name: names.get(member.employee_id) ?? "موظف",
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

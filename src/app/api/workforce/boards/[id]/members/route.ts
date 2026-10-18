import { apiError, requireAdmin, workforceActor } from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await workforceActor();
    requireAdmin(actor);
    const id = uuid((await params).id);
    const [board, members] = await Promise.all([
      actor.db.from("wf_boards").select("version").eq("id", id).maybeSingle(),
      actor.db
        .from("wf_board_members")
        .select("employee_id,employee:wf_employees(full_name)")
        .eq("board_id", id)
        .order("employee_id")
        .limit(500),
    ]);
    if (board.error || members.error) throw board.error || members.error;
    if (!board.data) throw new WorkforceError("اللوحة غير متاحة", 404);
    return privateResponse({
      version: board.data.version,
      members: members.data,
    });
  } catch (error) {
    return apiError(error);
  }
}

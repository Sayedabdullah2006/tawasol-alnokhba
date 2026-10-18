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
    const { data: task, error } = await actor.db
      .from("wf_tasks")
      .select(
        "*,column:wf_task_columns(*),board:wf_boards!inner(*,columns:wf_task_columns(*))",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!task) throw new WorkforceError("المهمة غير متاحة", 404);
    const service = await createServiceRoleClient();
    const [submissionResult, checklistResult, assignee] = await Promise.all([
      actor.db
        .from("wf_task_submissions")
        .select(
          "id,summary,status,decision_reason,created_at,decided_at,submission_number",
        )
        .eq("task_id", id)
        .order("submission_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
      actor.db
        .from("wf_task_checklist")
        .select("id,title,required,completed,completed_at")
        .eq("task_id", id)
        .order("position")
        .order("id")
        .limit(200),
      task.assignee_id
        ? service
            .from("wf_employees")
            .select("full_name")
            .eq("id", task.assignee_id)
            .maybeSingle()
        : task.assignee_admin_id
          ? service
              .from("wf_task_assignment_admins")
              .select("full_name:display_name")
              .eq("user_id", task.assignee_admin_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
    ]);
    for (const result of [submissionResult, checklistResult, assignee])
      if (result.error) throw result.error;
    const { columns, ...board } = task.board;
    return privateResponse({
      task,
      boardDetail: {
        board,
        columns: columns.sort(
          (a: { position: number }, b: { position: number }) =>
            a.position - b.position,
        ),
        canManage: actor.role === "admin",
        canCreate: false,
      },
      latestSubmission: submissionResult.data,
      checklist: checklistResult.data || [],
      assigneeName: assignee.data?.full_name ?? null,
      canWork:
        actor.role === "admin" || task.assignee_id === actor.employee?.id,
      canEdit:
        actor.canManageTasks ||
        (task.assignment_origin === "self" &&
          task.created_by === actor.user.id &&
          task.assignee_id === actor.employee?.id),
      canReview: actor.role === "admin",
      canAssign: actor.canManageTasks,
      canArchive:
        actor.role === "admin" ||
        (task.assignment_origin === "self" &&
          task.created_by === actor.user.id &&
          task.assignee_id === actor.employee?.id),
      canConfigureChecklist:
        actor.role === "admin" ||
        (task.assignment_origin === "self" &&
          task.created_by === actor.user.id &&
          task.assignee_id === actor.employee?.id),
    });
  } catch (error) {
    return apiError(error);
  }
}

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
      .select("*,column:wf_task_columns(id,title,kind)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!task) throw new WorkforceError("المهمة غير متاحة", 404);
    const { data: latestSubmission, error: submissionError } = await actor.db
      .from("wf_task_submissions")
      .select(
        "id,summary,status,decision_reason,created_at,decided_at,submission_number",
      )
      .eq("task_id", id)
      .order("submission_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (submissionError) throw submissionError;
    const { data: checklist, error: checklistError } = await actor.db
      .from("wf_task_checklist")
      .select("id,title,required,completed,completed_at")
      .eq("task_id", id)
      .order("position")
      .order("id")
      .limit(200);
    if (checklistError) throw checklistError;
    // A readable task permits the minimal work identity of its assignee, not their HR record.
    const service = await createServiceRoleClient();
    const assignee = task.assignee_id
      ? await service
          .from("wf_employees")
          .select("full_name")
          .eq("id", task.assignee_id)
          .maybeSingle()
      : { data: null, error: null };
    if (assignee.error) throw assignee.error;
    return privateResponse({
      task,
      latestSubmission,
      checklist,
      assigneeName: assignee.data?.full_name ?? null,
      canWork:
        actor.role === "admin" ||
        task.assignee_id === actor.employee?.id,
      canEdit:
        actor.role === "admin" ||
        (task.assignment_origin === "self" &&
          task.created_by === actor.user.id &&
          task.assignee_id === actor.employee?.id),
      canReview: actor.role === "admin",
    });
  } catch (error) {
    return apiError(error);
  }
}

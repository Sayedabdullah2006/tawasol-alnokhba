import type { WorkforceActor } from "./server";

export function canReviewTask(
  actor: Pick<WorkforceActor, "role" | "employee" | "canManageTasks">,
  task: { assignee_id: string | null; co_assignee_ids?: string[] },
) {
  if (actor.role === "admin") return true;
  const employee = actor.employee?.id;
  return !!employee && actor.canManageTasks && task.assignee_id !== employee &&
    !(task.co_assignee_ids ?? []).includes(employee);
}

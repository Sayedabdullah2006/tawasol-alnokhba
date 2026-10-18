import type { WorkTask } from "./task-types";
export type CardAction = "move" | "submit" | "review";
export function cardAction(
  task: WorkTask,
  target: string,
  admin: boolean,
): CardAction | null {
  if (!task.canWork || task.archived_at || task.board?.archived_at) return null;
  const current = task.column.kind;
  if (current === "review")
    return admin && ["done", "changes"].includes(target) ? "review" : null;
  if (current === "done" && !admin) return null;
  if (target === "review")
    return !task.blocked_reason && current !== "done" ? "submit" : null;
  if (target === "changes") return null;
  if (target === "done")
    return !task.requires_approval && !task.blocked_reason ? "move" : null;
  if (target === "in_progress" && task.blocked_reason) return null;
  return ["new", "in_progress"].includes(target) ? "move" : null;
}

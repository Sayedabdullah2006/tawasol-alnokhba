import type { WorkforceActor } from "@/lib/workforce/server";
import { executionScope } from "@/lib/workforce/task-scope";
import EmployeeFocus from "./EmployeeFocus";

export default async function EmployeeTaskFocus({ actor }: { actor: WorkforceActor }) {
  if (!actor.employee || actor.role !== "employee") return null;
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  const tomorrow = new Date(Date.parse(`${today}T00:00:00+03:00`) + 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  const query = () => actor.db.from("wf_tasks")
    .select("id,title,due_at,description,completion_criteria,blocked_reason,column:wf_task_columns!inner(kind),board:wf_boards!inner(archived_at)", { count: "exact" })
    .or(executionScope(actor.employee!.id)).is("archived_at", null).is("board.archived_at", null)
    .not("column.kind", "in", "(done,review)").order("due_at").order("id").limit(10);
  const [due, upcoming] = await Promise.all([
    query().lt("due_at", `${tomorrow}T00:00:00+03:00`),
    query().gte("due_at", `${tomorrow}T00:00:00+03:00`),
  ]);
  if (due.error || upcoming.error) return <p role="alert" className="rounded-2xl border p-4 text-sm">تعذر تحميل ملخص مهامك؛ يمكنك متابعتها من اللوحة أدناه.</p>;
  const normalize = (task: NonNullable<typeof due.data>[number]) => ({
    id: task.id, title: task.title, due_at: task.due_at, blocked_reason: task.blocked_reason,
    state: (Array.isArray(task.column) ? task.column[0] : task.column)?.kind ?? "new",
    overdue: !!task.due_at && Date.parse(task.due_at) < now.getTime(),
    deliverable: task.description.match(/المطلوب تسليمه اليوم:\s*([^\n]+)/)?.[1] || task.completion_criteria,
  });
  return <EmployeeFocus today={(due.data || []).map(normalize)} upcoming={(upcoming.data || []).map(normalize)} todayCount={due.count || 0} upcomingCount={upcoming.count || 0} />;
}

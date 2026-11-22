import "server-only";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type { WorkforceActor } from "@/lib/workforce/server";
import { WorkforceError } from "@/lib/workforce/validation";
import { officeDirectory } from "./employee-server";
import {
  OFFICE_DEPARTMENTS,
  departmentWorkspace,
  type DepartmentId,
} from "./departments";
import type { OfficeSession, OfficeStaff } from "./domain";
import {
  buildMorningBriefing,
  officeDay,
  rankHelpCandidates,
  recordInteraction,
  staffContact,
  virtualContact,
  virtualInteractions,
  type CoordinationRecord,
  type CoordinationSnapshot,
  type CoordinationTask,
  type OfficeInteraction,
} from "./coordination";

export const coordinationWorkspace = () =>
  process.env.VIRTUAL_OFFICE_WORKSPACE_ID || "nukhba";
export async function coordinationSnapshot(
  actor: WorkforceActor,
  department: DepartmentId,
  selectedTask?: string,
): Promise<CoordinationSnapshot> {
  const service = await createServiceRoleClient(),
    now = new Date().toISOString(),
    bounds = officeDay(now),
    workspace = coordinationWorkspace();
  const [directory, tasksResult, recordsResult, sessionResult] =
    await Promise.all([
      officeDirectory(actor.user.id, workspace),
      actor.db
        .from("wf_tasks")
        .select(
          "id,title,version,assignee_id,co_assignee_ids,due_at,completed_at,updated_at,blocked_reason,priority,requires_approval,column:wf_task_columns!inner(kind),board:wf_boards!inner(archived_at)",
          { count: "exact" },
        )
        .is("deleted_at", null)
        .is("archived_at", null)
        .is("test_run_id", null)
        .is("board.archived_at", null)
        .or(`completed_at.is.null,completed_at.gte.${bounds.previousStart}`)
        .order("updated_at", { ascending: false })
        .limit(200),
      service.rpc("vo_coordination_feed", {
        p_actor: actor.user.id,
        p_workspace: workspace,
      }),
      actor.role === "admin"
        ? service
            .from("vo_sessions")
            .select(
              "id,workspace_id,agent_id,kind,title,brief,status,step,approved_step,workflow,plan,plan_version,approved_plan_version,progress,error_message,created_at,updated_at,context,input_tokens,output_tokens",
            )
            .in(
              "workspace_id",
              OFFICE_DEPARTMENTS.map((d) =>
                departmentWorkspace(workspace, d.id),
              ),
            )
            .order("updated_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (tasksResult.error || recordsResult.error || sessionResult.error)
    throw tasksResult.error || recordsResult.error || sessionResult.error;
  const staff: OfficeStaff[] = directory.staff.map((p) => ({
    ...p,
    metrics: { assigned: 0, open: 0, inProgress: 0, overdue: 0 },
  }));
  const tasks: CoordinationTask[] = tasksResult.data.map((t) => ({
    id: t.id,
    title: t.title,
    version: t.version,
    state: (Array.isArray(t.column) ? t.column[0] : t.column).kind,
    assigneeId: t.assignee_id,
    coAssigneeIds: t.co_assignee_ids || [],
    dueAt: t.due_at,
    completedAt: t.completed_at,
    updatedAt: t.updated_at,
    blockedReason: t.blocked_reason || "",
    priority: t.priority,
    requiresApproval: t.requires_approval,
  }));
  const records = recordsResult.data as CoordinationRecord[];
  const interactions: OfficeInteraction[] = [
    ...records.map((r) => recordInteraction(r, staff)),
    ...virtualInteractions(sessionResult.data as OfficeSession[]),
  ];
  for (const task of tasks.filter((t) => t.state === "review")) {
    const from = staffContact(staff, task.assigneeId, department);
    interactions.push({
      id: `review:${task.id}`,
      key: `review:${task.id}:${task.version}`,
      kind: "handoff",
      state: "review",
      title: task.title,
      text: `تسليم ${from.name} قيد مراجعة المدير. المرحلة التالية تنتظر الاعتماد.`,
      from,
      to: virtualContact(from.department, "editor"),
      at: task.updatedAt,
      resource: { type: "task", id: task.id },
    });
  }
  interactions.sort(
    (a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id),
  );
  const suggestions = tasks
    .filter(
      (t) =>
        !["done", "review"].includes(t.state) &&
        (t.blockedReason.trim() ||
          (t.dueAt && Date.parse(t.dueAt) < Date.parse(now))),
    )
    .slice(0, 8)
    .map((t) => ({
      taskId: t.id,
      reason: t.blockedReason.trim()
        ? `متوقفة بسبب: ${t.blockedReason}`
        : "تجاوزت موعدها؛ يمكن طلب مساعدة لتحديد ما يلزم لإنهائها",
    }));
  const candidateTaskId =
    selectedTask ||
    suggestions[0]?.taskId ||
    tasks.find((t) => t.state !== "done")?.id ||
    null;
  let candidateTask = tasks.find((t) => t.id === candidateTaskId);
  if (candidateTaskId && !candidateTask) {
    const check = await actor.db
      .from("wf_tasks")
      .select(
        "id,title,version,assignee_id,co_assignee_ids,blocked_reason,column:wf_task_columns!inner(kind)",
      )
      .eq("id", candidateTaskId)
      .is("deleted_at", null)
      .is("archived_at", null)
      .is("test_run_id", null)
      .maybeSingle();
    if (check.error) throw check.error;
    if (!check.data) throw new WorkforceError("المهمة غير متاحة", 404);
    const t = check.data;
    candidateTask = {
      id: t.id,
      title: t.title,
      version: t.version,
      state: (Array.isArray(t.column) ? t.column[0] : t.column).kind,
      assigneeId: t.assignee_id,
      coAssigneeIds: t.co_assignee_ids || [],
      blockedReason: t.blocked_reason,
      priority: "normal",
      dueAt: null,
      completedAt: null,
      updatedAt: now,
      requiresApproval: true,
    };
    tasks.push(candidateTask);
  }
  const eligible = candidateTask
    ? await service.rpc("vo_help_candidates", {
        p_actor: actor.user.id,
        p_task: candidateTask.id,
      })
    : { data: [], error: null };
  if (eligible.error) throw eligible.error;
  const briefing = buildMorningBriefing(
    tasks,
    interactions,
    now,
    actor.role === "admin",
    (tasksResult.count || 0) > 200,
  );
  const coordinator = virtualContact(
    (staff.find((p) => p.id === actor.employee?.id)?.officeDepartment ||
      department) as DepartmentId,
    "editor",
  );
  interactions.push({
    id: `morning:${briefing.day}`,
    key: `morning:${actor.user.id}:${briefing.day}`,
    kind: "morning",
    state: "ready",
    title: "ملخص الصباح",
    text: briefing.summary,
    from: coordinator,
    to: coordinator,
    at: now,
    resource: { type: "morning", id: briefing.day },
  });
  return {
    viewerId: actor.user.id,
    employeeId: actor.employee?.id || null,
    isManager: actor.canManageTasks,
    now,
    tasks,
    records,
    interactions,
    candidates: candidateTask
      ? rankHelpCandidates(staff, eligible.data || [], candidateTask, now)
      : [],
    candidateTaskId,
    briefing,
    suggestions,
  };
}

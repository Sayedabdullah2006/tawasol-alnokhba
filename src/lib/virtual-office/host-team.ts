import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { OfficeError, type OfficeStaff, type StaffAppearance } from "./domain";

/** Read-only host adapter. Replace with Hamza's staff directory when integrating. */
export async function readHostTeam(db: SupabaseClient, workspace: string) {
  const service = await createServiceRoleClient();
  const [summary, looks] = await Promise.all([
    db.rpc("wf_admin_dashboard", {
      p_from: null,
      p_to: null,
      p_employee: null,
      p_client: null,
    }),
    service
      .from("vo_staff_avatars")
      .select("employee_id,preset")
      .eq("workspace_id", workspace),
  ]);
  if (summary.error || looks.error) throw summary.error || looks.error;
  const rows = summary.data?.employees as {
    id: string;
    full_name: string;
    job_title: string;
    status: string;
    metrics: {
      assigned: number;
      open: number;
      in_progress: number;
      overdue: number;
    };
  }[];
  if (!Array.isArray(rows)) throw new Error("host_directory_unavailable");
  return rows
    .filter((row) => row.status === "active")
    .map((row): OfficeStaff => ({
      id: row.id,
      name: row.full_name,
      jobTitle: row.job_title,
      appearance: (looks.data.find((v) => v.employee_id === row.id)?.preset ??
        "unset") as StaffAppearance,
      metrics: {
        assigned: row.metrics.assigned,
        open: row.metrics.open,
        inProgress: row.metrics.in_progress,
        overdue: row.metrics.overdue,
      },
    }));
}
export async function hostEmployeeTasks(db: SupabaseClient, id: string) {
  const employee = await db
    .from("wf_employees")
    .select("id")
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();
  if (employee.error) throw employee.error;
  if (!employee.data) throw new OfficeError("الموظف غير متاح", 404);
  const tasks = await db
    .from("wf_tasks")
    .select(
      "id,title,due_at,column:wf_task_columns!inner(kind),board:wf_boards!inner(archived_at)",
    )
    .or(`assignee_id.eq.${id},co_assignee_ids.cs.{${id}}`)
    .is("archived_at", null)
    .is("board.archived_at", null)
    .neq("column.kind", "done")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(12);
  if (tasks.error) throw tasks.error;
  return tasks.data.map((t) => ({
    id: t.id,
    title: t.title,
    dueAt: t.due_at,
    stage: (Array.isArray(t.column) ? t.column[0] : t.column)?.kind ?? "todo",
  }));
}

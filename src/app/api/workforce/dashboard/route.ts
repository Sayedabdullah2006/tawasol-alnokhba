import {employeePerformance} from "@/lib/workforce/performance-server";
import { apiError, requireAdmin, workforceActor } from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";
import {
  dateField,
  uuid,
  textField,
  WorkforceError,
} from "@/lib/workforce/validation";
import { FIELD_LABELS } from "@/lib/workforce/types";
import type { AdminWorkDashboard } from "@/lib/workforce/dashboard-types";
import { attendanceMonth, employeeMonthAttendance } from "@/lib/workforce/attendance-server";

export async function GET(request: Request) {
  try {
    const actor = await workforceActor();
    requireAdmin(actor);
    const params = new URL(request.url).searchParams;
    const now = new Date(), month = attendanceMonth(params.get("attendance_month"), now);
    const from = dateField(params.get("due_from"), true);
    const to = dateField(params.get("due_to"), true);
    if (from && to && from > to)
      throw new WorkforceError("نهاية الفترة تسبق بدايتها");
    const employee = params.get("assignee_id");
    const employeeId = employee ? uuid(employee.replace(/^admin:/, "")) : null;
    const client = textField(params.get("client_name") ?? "", "العميل", 0, 150) || null;
    let submissions = actor.db.from("wf_task_submissions")
      .select("id,created_at,task:wf_tasks!inner(id,title,client_name,assignee_id,co_assignee_ids,assignee_admin_id,due_at,archived_at,column:wf_task_columns!inner(kind),board:wf_boards!inner(archived_at))")
      .eq("status", "pending").eq("task.column.kind", "review")
      .is("task.archived_at", null).is("task.board.archived_at", null)
      .order("created_at").order("id").limit(5);
    if (from) submissions = submissions.gte("task.due_at", `${from}T00:00:00+03:00`);
    if (to) submissions = submissions.lt("task.due_at", new Date(Date.parse(`${to}T00:00:00+03:00`) + 86400000).toISOString());
    if (employeeId) submissions = employee?.startsWith("admin:") ? submissions.eq("task.assignee_admin_id", employeeId) : submissions.or(`assignee_id.eq.${employeeId},co_assignee_ids.cs.{${employeeId}}`, { referencedTable: "task" });
    if (client) submissions = submissions.eq("task.client_name", client);
    // Counts cover all pending requests; only the five oldest items are previewed.
    // These queries keep the caller's RLS and never read financial or HR documents.
    let requests = actor.db.from("wf_employee_requests")
      .select("id,title,created_at,employee:wf_employees!inner(full_name)", { count: "exact" })
      .eq("status", "pending").order("created_at").order("id").limit(5);
    let profileChanges = actor.db.from("wf_profile_change_requests")
      .select("id,field,created_at,employee:wf_employees!inner(full_name)", { count: "exact" })
      .eq("status", "pending").order("created_at").order("id").limit(5);
    if (employeeId) { requests = requests.eq("employee_id", employeeId); profileChanges = profileChanges.eq("employee_id", employeeId); }
    const [summary, deliveryResult, requestResult, profileResult] = await Promise.all([
      actor.db.rpc("wf_admin_dashboard", {
      p_from: from,
      p_to: to,
      p_employee: employeeId,
      p_client: client,
      }), submissions, requests, profileChanges,
    ]);
    for (const result of [summary, deliveryResult, requestResult, profileResult]) if (result.error) throw result.error;
    const data = summary.data as AdminWorkDashboard;
    const employees = await Promise.all(data.employees.map(async employee => {
      const record = await actor.db.from("wf_employees").select("start_date").eq("id", employee.id).single();
      if (record.error) throw record.error;
      const { periods: _periods, ...attendance } = await employeeMonthAttendance(actor.db, employee.id, record.data.start_date, month, now);
      void _periods;
      return { ...employee, attendance, performance:await employeePerformance(actor,employee.id,month,now) };
    }));
    const one = <T,>(value: T | T[]) => Array.isArray(value) ? value[0] : value;
    return privateResponse({ ...data, employees,
      pendingSubmissions: (deliveryResult.data ?? []).map(row => {
        const task = one(row.task);
        return { id: row.id, taskId: task.id, title: task.title, client: task.client_name, employeeName: [...data.employees.filter(e => e.id === task.assignee_id || task.co_assignee_ids.includes(e.id)).map(e => e.full_name), ...(task.assignee_admin_id ? ["مدير الشركة"] : [])].join("، ") || "غير مسندة", createdAt: row.created_at };
      }),
      pendingRequests: [
        ...(requestResult.data ?? []).map(row => ({ id: row.id, title: row.title, employeeName: one(row.employee).full_name, createdAt: row.created_at, type: "requests" })),
        ...(profileResult.data ?? []).map(row => ({ id: row.id, title: `تعديل ${FIELD_LABELS[row.field as keyof typeof FIELD_LABELS] ?? "البيانات"}`, employeeName: one(row.employee).full_name, createdAt: row.created_at, type: "profile" })),
      ].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).slice(0,5),
      pendingRequestCount: (requestResult.count ?? 0) + (profileResult.count ?? 0),
    });
  } catch (error) {
    return apiError(error);
  }
}

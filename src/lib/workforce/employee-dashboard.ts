import "server-only";
import type { WorkforceActor } from "./server";
import { WorkforceError } from "./validation";

export async function employeeDashboard(
  actor: WorkforceActor,
  now = new Date(),
) {
  if (actor.role !== "employee" || !actor.employee)
    throw new WorkforceError("لوحة الموظف متاحة لحساب الموظف فقط", 403);
  const employee = actor.employee;
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  const month = `${today.slice(0, 7)}-01`;
  const year = Number(today.slice(0, 4));
  const tomorrow = new Date(
    Date.parse(`${today}T00:00:00+03:00`) + 86400000,
  ).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  const tasks = () =>
    actor.db
      .from("wf_tasks")
      .select(
        "id,title,client_name,description,completion_criteria,due_at,estimate_minutes,blocked_reason,column:wf_task_columns!inner(kind),board:wf_boards!inner(archived_at)",
        { count: "exact" },
      )
      .eq("assignee_id", employee.id)
      .is("archived_at", null)
      .is("board.archived_at", null);
  const taskCount = () =>
    actor.db
      .from("wf_tasks")
      .select(
        "id,column:wf_task_columns!inner(kind),board:wf_boards!inner(archived_at)",
        { count: "exact", head: true },
      )
      .eq("assignee_id", employee.id)
      .is("archived_at", null)
      .is("board.archived_at", null);
  const [
    todayTasks,
    upcoming,
    open,
    overdue,
    review,
    done,
    attendance,
    attendanceOpen,
    settings,
    pendingRequests,
    latestRequests,
    payroll,
    entitlement,
    movements,
    documents,
    notifications,
  ] = await Promise.all([
    tasks()
      .not("column.kind", "in", "(done,review)")
      .lt("due_at", `${tomorrow}T00:00:00+03:00`)
      .order("due_at")
      .order("id")
      .limit(10),
    tasks()
      .not("column.kind", "in", "(done,review)")
      .or(`due_at.gte.${tomorrow}T00:00:00+03:00,due_at.is.null`)
      .order("due_at", { nullsFirst: false })
      .order("id")
      .limit(5),
    taskCount().neq("column.kind", "done"),
    taskCount()
      .not("column.kind", "in", "(done,review)")
      .lt("due_at", now.toISOString()),
    taskCount().eq("column.kind", "review"),
    taskCount()
      .eq("column.kind", "done")
      .gte("completed_at", `${month}T00:00:00+03:00`),
    actor.db
      .from("wf_attendance_sessions")
      .select("checked_in,checked_out")
      .eq("employee_id", employee.id)
      .eq("business_date", today),
    actor.db
      .from("wf_attendance_sessions")
      .select("checked_in,business_date")
      .eq("employee_id", employee.id)
      .is("checked_out", null)
      .maybeSingle(),
    actor.db
      .from("wf_attendance_settings")
      .select("daily_minutes,workdays,schedule_mode")
      .eq("employee_id", employee.id)
      .maybeSingle(),
    actor.db
      .from("wf_employee_requests")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employee.id)
      .eq("status", "pending"),
    actor.db
      .from("wf_employee_requests")
      .select("id,title,status")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(2),
    actor.db
      .from("wf_monthly_payroll")
      .select("month,status,total_amount,paid_amount")
      .eq("employee_id", employee.id)
      .eq("month", month)
      .maybeSingle(),
    actor.db
      .from("wf_leave_entitlements")
      .select("days")
      .eq("employee_id", employee.id)
      .eq("year", year)
      .maybeSingle(),
    actor.db
      .from("wf_leave_movements")
      .select("days")
      .eq("employee_id", employee.id)
      .eq("year", year),
    actor.db
      .from("wf_employee_documents")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employee.id)
      .eq("employee_visible", true)
      .is("archived_at", null),
    actor.db
      .from("wf_notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", actor.user.id)
      .is("read_at", null),
  ]);
  for (const result of [
    todayTasks,
    upcoming,
    open,
    overdue,
    review,
    done,
    attendance,
    attendanceOpen,
    settings,
    pendingRequests,
    latestRequests,
    payroll,
    entitlement,
    movements,
    documents,
    notifications,
  ])
    if (result.error) throw result.error;
  const normalize = (task: NonNullable<typeof todayTasks.data>[number]) => {
    const { column, board: _board, description, ...rest } = task;
    void _board;
    return {
      ...rest,
      overdue: !!task.due_at && Date.parse(task.due_at) < now.getTime(),
      state: (Array.isArray(column) ? column[0] : column)?.kind as string,
      deliverable:
        description.match(/المطلوب تسليمه اليوم:\s*([^\n]+)/)?.[1] ||
        task.completion_criteria,
    };
  };
  return {
    employee: {
      id: employee.id,
      full_name: employee.full_name,
      job_title: employee.job_title,
      start_date: employee.start_date,
    },
    today,
    month,
    tasks: {
      today: (todayTasks.data || []).map(normalize),
      todayCount: todayTasks.count || 0,
      upcoming: (upcoming.data || []).map(normalize),
      upcomingCount: upcoming.count || 0,
      open: open.count || 0,
      overdue: overdue.count || 0,
      review: review.count || 0,
      completedThisMonth: done.count || 0,
    },
    attendance: {
      open: attendanceOpen.data,
      minutes: Math.floor(
        (attendance.data || []).reduce(
          (sum, row) =>
            sum +
            Math.max(
              0,
              Math.min(
                now.getTime(),
                row.checked_out ? Date.parse(row.checked_out) : now.getTime(),
              ) - Date.parse(row.checked_in),
            ),
          0,
        ) / 60000,
      ),
      dailyMinutes: settings.data?.daily_minutes ?? 480,
      dayOff: !(settings.data?.workdays ?? [0, 1, 2, 3, 4]).includes(
        new Date(`${today}T12:00:00Z`).getUTCDay(),
      ),
    },
    requests: {
      pending: pendingRequests.count || 0,
      latest: latestRequests.data || [],
    },
    payroll: payroll.data,
    leave: {
      year,
      available:
        Number(entitlement.data?.days || 0) -
        (movements.data || []).reduce((sum, row) => sum + Number(row.days), 0),
    },
    documents: documents.count || 0,
    unread: notifications.count || 0,
  };
}

import "server-only";
import type { WorkforceActor } from "./server";
import { monthBounds, type AttendancePeriod } from "./attendance-summary";

export async function attendanceMonthSessions(db: WorkforceActor["db"], employeeId: string, startDate: string, month: string) {
  const { first, next } = monthBounds(month), start = startDate > first ? startDate : first;
  const data: AttendancePeriod[] = [];
  if (start >= next) return { data, error: null };
  const from = new Date(`${start}T00:00:00+03:00`).toISOString();
  const until = new Date(`${next}T00:00:00+03:00`).toISOString();
  for (let offset = 0; ; offset += 500) {
    const page = await db.from("wf_attendance_sessions").select("checked_in,checked_out")
      .eq("employee_id", employeeId).lt("checked_in", until)
      .or(`checked_out.gte.${from},checked_out.is.null`)
      .order("checked_in").order("id").range(offset, offset + 499);
    if (page.error) return { data, error: page.error };
    data.push(...page.data);
    if (page.data.length < 500) return { data, error: null };
  }
}

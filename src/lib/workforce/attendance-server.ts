import "server-only";
import type { WorkforceActor } from "./server";
import { monthBounds, riyadhDate, summarizeAttendance, type AttendancePeriod } from "./attendance-summary";
import { WorkforceError } from "./validation";

export function attendanceMonth(value: string | null, now = new Date()) {
  const month = value ?? riyadhDate(now).slice(0, 7);
  if (!/^(20\d{2}|21\d{2}|2200)-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2020)
    throw new WorkforceError("الشهر غير صحيح");
  return month;
}

export async function employeeMonthAttendance(db: WorkforceActor["db"], employeeId: string, startDate: string, month: string, now: Date) {
  const currentMonth = riyadhDate(now).slice(0, 7);
  const [periods, currentPeriods, settings, open] = await Promise.all([
    attendanceMonthSessions(db, employeeId, startDate, month),
    month === currentMonth ? Promise.resolve(null) : attendanceMonthSessions(db, employeeId, startDate, currentMonth),
    db.from("wf_attendance_settings").select("daily_minutes,workdays").eq("employee_id", employeeId).maybeSingle(),
    db.from("wf_attendance_sessions").select("checked_in").eq("employee_id", employeeId).is("checked_out", null).maybeSingle(),
  ]);
  for (const result of [periods, currentPeriods, settings, open]) if (result?.error) throw result.error;
  const summarize = (data: AttendancePeriod[], selected: string) => summarizeAttendance({ periods: data, startDate, month: selected, now,
    dailyMinutes: settings.data?.daily_minutes ?? 480, workdays: settings.data?.workdays });
  const summary = summarize(periods.data, month);
  return { summary, todaySummary: currentPeriods ? summarize(currentPeriods.data, currentMonth) : summary, open: open.data, periods: periods.data };
}

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

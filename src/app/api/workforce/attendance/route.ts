import {
  apiError,
  assertMutation,
  requireAdmin,
  requireEmployeeAccess,
  workforceActor,
  createServiceRoleClient,
} from "@/lib/workforce/server";
import { uuid, textField, WorkforceError } from "@/lib/workforce/validation";
import { workPage, privateResponse } from "@/lib/workforce/task-server";
import { attendanceMonthSessions, attendanceCalendarDays, employeeUpcomingLeave, attendanceExcusedDays } from "@/lib/workforce/attendance-server";
import { DEFAULT_WORKDAYS, summarizeAttendance } from "@/lib/workforce/attendance-summary";
import {employeeLeaveBalance} from "@/lib/workforce/summary-server";
import {ATTENDANCE_COLUMNS} from "@/lib/workforce/attendance";
export async function GET(request: Request) {
  try {
    const actor = await workforceActor(),
      params = new URL(request.url).searchParams,
      { page, from, to } = workPage(params),
      today = new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Riyadh",
      }),
      year = Number(params.get("year") || today.slice(0, 4));
    if (!Number.isInteger(year) || year < 2020 || year > 2200)
      throw new WorkforceError("السنة غير صحيحة");
    const id =
      actor.role === "admin"
        ? uuid(params.get("employee_id"))
        : actor.employee!.id;
    requireEmployeeAccess(actor, id);
    const exists = await actor.db
      .from("wf_employees")
      .select("id,full_name,start_date")
      .eq("id", id)
      .maybeSingle();
    if (exists.error) throw exists.error;
    if (!exists.data) throw new WorkforceError("الموظفة غير متاحة", 404);
    let sessions = actor.db
      .from("wf_attendance_sessions")
      .select(ATTENDANCE_COLUMNS, { count: "exact" })
      .eq("employee_id", id)
      .order("checked_in", { ascending: false })
      .order("id")
      .range(from, to);
    const month = params.get("month");
    if (month) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
        throw new WorkforceError("الشهر غير صحيح");
      sessions = sessions
        .or(`checked_out.gte.${new Date(`${month}-01T00:00:00+03:00`).toISOString()},checked_out.is.null`)
        .lt(
          "checked_in",
          new Date(
            Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1),
          ).toISOString().slice(0, 10) + "T00:00:00+03:00",
        );
    } else sessions = sessions.gte("business_date", `${year}-01-01`).lte("business_date", `${year}-12-31`);
    const [records, open, settings, entitlement, movements, approved, monthSessions, paidCalendarDays, upcomingLeave, excusedDays] =
      await Promise.all([
        sessions,
        actor.db
          .from("wf_attendance_sessions")
          .select(ATTENDANCE_COLUMNS)
          .eq("employee_id", id)
          .is("checked_out", null)
          .maybeSingle(),
        actor.db
          .from("wf_attendance_settings")
          .select("workdays,starts_at,ends_at,schedule_mode,daily_minutes")
          .eq("employee_id", id)
          .maybeSingle(),
        actor.db
          .from("wf_leave_entitlements")
          .select("days")
          .eq("employee_id", id)
          .eq("year", year)
          .maybeSingle(),
        actor.db
          .from("wf_leave_movements")
          .select("days")
          .eq("employee_id", id)
          .eq("year", year),
        actor.db
          .from("wf_employee_requests")
          .select("id,kind,title,starts_at,ends_at,leave_type")
          .eq("employee_id", id)
          .eq("status", "approved")
          .in("kind", ["leave", "permission", "remote-work"])
          .gte("ends_at", `${year}-01-01T00:00:00+03:00`)
          .lte("starts_at", `${year}-12-31T23:59:59+03:00`)
          .order("starts_at", { ascending: false })
          .limit(100),
        attendanceMonthSessions(actor.db, id, exists.data.start_date, today.slice(0, 7)),
        attendanceCalendarDays(actor.db,[today.slice(0,7)]),
        employeeUpcomingLeave(actor.db,id,exists.data.start_date,today),
        attendanceExcusedDays(actor.db,id,[today.slice(0,7)]),
      ]);
    for (const result of [
      records,
      open,
      settings,
      entitlement,
      movements,
      approved,
      monthSessions,
    ])
      if (result.error && result.error.code !== "PGRST103") throw result.error;
    const leaveBalance=await employeeLeaveBalance(actor,id);
    const granted=Number(entitlement.data?.days||0);
    return privateResponse({
      employee: exists.data,
      sessions: records.data || [],
      count: records.count || 0,
      page,
      open: open.data,
      settings: settings.data || {
        workdays: DEFAULT_WORKDAYS,
        starts_at: "09:00",
        ends_at: "17:00",
        schedule_mode: "fixed",
        daily_minutes: 480,
      },
      leave: {...leaveBalance,current_year_opening:granted},
      approved: approved.data || [],
      upcomingLeave,
      today,
      summary: summarizeAttendance({ periods: monthSessions.data, startDate: exists.data.start_date,
        month: today.slice(0, 7), now: new Date(), dailyMinutes: settings.data?.daily_minutes ?? 480,
        workdays: settings.data?.workdays, paidCalendarDays, excusedDays }),
    });
  } catch (e) {
    return apiError(e);
  }
}
export { POST } from "../work-session/route";
export async function PATCH(request: Request) {
  try {
    await assertMutation(request);
    const actor = await workforceActor();
    requireAdmin(actor);
    const body = await request.json(),
      id = uuid(body.employee_id);
    const scheduleMode = body.schedule_mode ?? "fixed";
    const dailyMinutes = body.daily_minutes ?? 480;
    if (
      !["fixed", "flexible"].includes(scheduleMode) ||
      !Number.isInteger(dailyMinutes) ||
      dailyMinutes < 60 ||
      dailyMinutes > 960
    )
      throw new WorkforceError("حدد نوع الدوام وساعات العمل اليومية");
    if (
      !Array.isArray(body.workdays) ||
      !body.workdays.length ||
      body.workdays.length > 7 ||
      body.workdays.some(
        (day: unknown) =>
          !Number.isInteger(day) || Number(day) < 0 || Number(day) > 6,
      )
    )
      throw new WorkforceError("أيام العمل غير صحيحة");
    if (
      scheduleMode === "fixed" &&
      (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.starts_at) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.ends_at) ||
        body.ends_at <= body.starts_at)
    )
      throw new WorkforceError("ساعات الدوام غير صحيحة");
    if(scheduleMode === "fixed" && body.ends_at>"17:00") throw new WorkforceError("نهاية الدوام القصوى الخامسة مساءً");
    if (
      !Number.isInteger(body.year) ||
      body.year < 2020 ||
      body.year > 2200 ||
      !Number.isFinite(Number(body.days)) ||
      Number(body.days) < 0 ||
      Number(body.days) > 366
    )
      throw new WorkforceError("استحقاق الإجازة غير صحيح");
    const service = await createServiceRoleClient(),
      result = await service.rpc("wf_save_attendance_settings", {
        p_actor: actor.user.id,
        p_employee: id,
        p_workdays: [...new Set(body.workdays)],
        p_start: scheduleMode === "flexible" ? "09:00" : body.starts_at,
        p_end: scheduleMode === "flexible" ? "17:00" : body.ends_at,
        p_mode: scheduleMode,
        p_minutes: dailyMinutes,
        p_year: body.year,
        p_days: Number(body.days),
        p_reason: textField(body.reason, "سبب التعديل", 3, 2000),
      });
    if (result.error) throw result.error;
    return Response.json({ success: true });
  } catch (e) {
    return apiError(e);
  }
}

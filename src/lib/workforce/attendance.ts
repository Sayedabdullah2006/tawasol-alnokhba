import type { AttendanceSummary, AttendancePeriod } from "./attendance-summary";
export const WORKDAYS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];
export const ATTENDANCE_COLUMNS="id,employee_id,business_date,checked_in,checked_out,note,source,version,policy_version,cutoff_at,last_seen_at,next_confirmation_at,break_started_at,break_paid_until,unpaid_periods,close_reason";
export type AttendanceSession = AttendancePeriod & {
  id: string;
  employee_id: string;
  business_date: string;
  checked_in: string;
  checked_out: string | null;
  note: string;
  source: string;
  version: number;
  close_reason?: string | null;
};
export type AttendanceData = {
  employee: { id: string; full_name: string };
  sessions: AttendanceSession[];
  count: number;
  page: number;
  open: AttendanceSession | null;
  settings: {
    workdays: number[];
    starts_at: string;
    ends_at: string;
    schedule_mode: "fixed" | "flexible";
    daily_minutes: number;
  };
  leave: import("./leave").LeaveBalance;
  approved: {
    id: string;
    kind: string;
    title: string;
    starts_at: string;
    ends_at: string;
    leave_type: string;
  }[];
  today: string;
  summary: AttendanceSummary;
};

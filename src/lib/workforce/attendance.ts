export const WORKDAYS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];
export type AttendanceSession = {
  id: string;
  employee_id: string;
  business_date: string;
  checked_in: string;
  checked_out: string | null;
  note: string;
  source: string;
  version: number;
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
  leave: { year: number; granted: number; used: number; available: number };
  approved: {
    id: string;
    kind: string;
    title: string;
    starts_at: string;
    ends_at: string;
    leave_type: string;
  }[];
  today: string;
};

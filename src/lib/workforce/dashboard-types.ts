import type {PerformanceSummary} from "./performance";
import type { AttendanceSummary, AttendancePeriod } from "./attendance-summary";
export type TeamAttendance = { summary: AttendanceSummary; todaySummary: AttendanceSummary; open: AttendancePeriod | null; active?:{title:string;kind:string;starts_at:string}|null };
export type WorkMetrics = {
  assigned: number;
  completed: number;
  open: number;
  in_progress: number;
  overdue: number;
  pending: number;
  blocked: number;
  dated_completed: number;
  on_time: number;
};
export type AdminWorkDashboard = {
  generated_at: string;
  totals: WorkMetrics;
  unassigned: WorkMetrics | null;
  employees: {
    id: string;
    full_name: string;
    job_title: string;
    status: "active" | "suspended" | "ended";
    metrics: WorkMetrics;
    attendance: TeamAttendance;
    performance: PerformanceSummary;
    previewPayroll?: import("./payroll-attendance").PayrollCardData | null;
  }[];
  clients: string[];
  pendingSubmissions: { id: string; taskId: string; title: string; client: string; employeeName: string; createdAt: string }[];
  pendingRequests: { id: string; title: string; employeeName: string; createdAt: string; type: "requests" | "profile" }[];
  pendingRequestCount: number;
};

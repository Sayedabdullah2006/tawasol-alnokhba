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
  }[];
  clients: string[];
};

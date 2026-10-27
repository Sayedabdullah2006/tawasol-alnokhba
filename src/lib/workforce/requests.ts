export const REQUEST_KINDS = {
  leave: "إجازة",
  permission: "استئذان",
  overtime: "خارج دوام",
  "remote-work": "عمل عن بُعد",
  expenses: "تعويض مصروفات العمل",
  advance: "سلفة",
  letter: "خطاب أو شهادة",
  "payroll-review": "استفسار مالي",
  "attendance-correction": "تصحيح حضور",
  "missing-hours": "تسجيل ساعات مفقودة",
  general: "طلب إداري",
} as const;
export const REQUEST_STATUS = {
  pending: "بانتظار القرار",
  approved: "موافق عليه",
  rejected: "مرفوض",
  cancelled: "ملغى",
} as const;
export const datedRequest = (kind: string) =>
  ["leave", "permission", "overtime", "remote-work", "attendance-correction"].includes(
    kind,
  );
export const moneyRequest = (kind: string) =>
  ["expenses", "advance"].includes(kind);
export const requestAttachmentHref=(request:string,file:string,preview=false)=>`/api/workforce/requests/${request}/attachments/${file}${preview?'?preview=true':''}`;
export type RequestFile = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
};
export type EmployeeRequest = {
  id: string;
  employee_id: string;
  employeeName?: string;
  kind: keyof typeof REQUEST_KINDS;
  title: string;
  body: string;
  starts_at: string | null;
  ends_at: string | null;
  amount: string | null;
  attendance_session_id?: string | null;
  leave_type?: string;
  unpaid_estimate?:import('./unpaid-leave').UnpaidLeaveEstimate;
  unpaid_estimate_error?:string;
  work_day?: string | null;
  missing_minutes?: number | null;
  attachments: RequestFile[];
  status: keyof typeof REQUEST_STATUS;
  decision_reason: string | null;
  decided_at: string | null;
  created_at: string;
  version: number;
  overtime_details?:{hours:number;hourly_rate:string;actual_salary:string;basic_salary:string;work_day:string;payroll_month:string}|null;
  expense_details?:{payroll_month:string;approved_at:string}|null;
};

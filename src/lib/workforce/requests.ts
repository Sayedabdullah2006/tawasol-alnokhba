export const REQUEST_KINDS = {
  leave: "إجازة",
  permission: "استئذان",
  "remote-work": "عمل عن بُعد",
  expenses: "استرداد مصروف",
  advance: "سلفة",
  letter: "خطاب أو شهادة",
  "payroll-review": "استفسار مالي",
  "attendance-correction": "تصحيح حضور",
  general: "طلب إداري",
} as const;
export const REQUEST_STATUS = {
  pending: "بانتظار القرار",
  approved: "موافق عليه",
  rejected: "مرفوض",
  cancelled: "ملغى",
} as const;
export const datedRequest = (kind: string) =>
  ["leave", "permission", "remote-work", "attendance-correction"].includes(
    kind,
  );
export const moneyRequest = (kind: string) =>
  ["expenses", "advance"].includes(kind);
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
  attachments: RequestFile[];
  status: keyof typeof REQUEST_STATUS;
  decision_reason: string | null;
  decided_at: string | null;
  created_at: string;
  version: number;
};

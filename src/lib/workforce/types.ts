export type InternalRole = "admin" | "employee";
export type EmployeeStatus = "active" | "suspended" | "ended";
export type Department = { id: string; name: string };
export type Employee = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  city: string;
  department_id: string | null;
  job_title: string;
  responsibilities: string;
  contract_type: string;
  start_date: string;
  contract_end: string | null;
  status: EmployeeStatus;
  status_reason: string;
  version: number;
  created_at: string;
  updated_at: string;
};
export type ProfileChange = {
  id: string;
  employee_id: string;
  field: "full_name" | "iban" | "bank_name";
  proposed_value: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decision_reason: string | null;
  created_at: string;
};
export type EmployeeDocument = {
  id: string;
  employee_id: string;
  title: string;
  filename: string;
  size_bytes: number;
  employee_visible: boolean;
  expires_on: string | null;
  archived_at: string | null;
  created_at: string;
};
export type EmployeeDetail = {
  employee: Employee;
  departments: Department[];
  changes: ProfileChange[];
  documents: EmployeeDocument[];
  bank: { iban: string; bank_name: string } | null;
  documentsCursor: string | null;
  changesCursor: string | null;
  eventsCursor?: string | null;
  notes?: string;
  events?: {
    id: number;
    action: string;
    changed_fields: string[];
    created_at: string;
  }[];
};
export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: "نشط",
  suspended: "معلّق",
  ended: "انتهت علاقة العمل",
};
export const CONTRACT_LABELS: Record<string, string> = {
  full_time: "دوام كامل",
  part_time: "دوام جزئي",
  contractor: "متعاون",
  temporary: "مؤقت",
};
export const FIELD_LABELS = {
  full_name: "الاسم الكامل",
  iban: "رقم الآيبان",
  bank_name: "اسم البنك",
};

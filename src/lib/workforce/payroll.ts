import { dateField, textField, uuid, WorkforceError } from "./validation";
export type PayrollItem = {
  title: string;
  mode: "fixed" | "percent";
  value: string;
  basis_amount: string;
  task_id: string;
  reference: string;
  amount?: string;
};
export type PayrollInput = {
  basic_amount: string;
  allowances_amount: string;
  items: PayrollItem[];
  deductions: PayrollDeduction[];
  notes: string;
  reason: string;
};
export type PayrollDeduction = {
  title: string;
  kind: "insurance" | "other";
  amount: string;
  reference: string;
};
export type PayrollStatement = PayrollInput & {
  id: string;
  employee_id: string;
  month: string;
  version: number;
  status: "draft" | "approved" | "paid";
  total_amount: string;
  gross_amount: string;
  deductions_amount: string;
  paid_amount: string;
  approved_at: string | null;
};
export type PayrollData = {
  employee: { id: string; full_name: string; start_date: string };
  month: string;
  statement: PayrollStatement | null;
  defaults: {
    basic_amount: string;
    allowances_amount: string;
    effective_from: string;
  } | null;
  payments: {
    id: string;
    amount: string;
    reference: string;
    created_at: string;
  }[];
  payments_count: number;
  events: { id: string; action: string; reason: string; created_at: string }[];
  events_count: number;
};
export const payrollStatus = {
  draft: "متوقع — لم يعتمد بعد",
  approved: "معتمد",
  paid: "مصروف بالكامل",
};
export const payrollAction = {
  save: "تحديث التقدير",
  approve: "اعتماد",
  reopen: "إعادة فتح",
  pay: "توثيق صرف",
};
export function payrollMonth(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value))
    throw new WorkforceError("الشهر غير صحيح");
  return dateField(`${value}-01`)!;
}
export function moneyValue(value: unknown, rate = false): string {
  if (
    typeof value !== "string" ||
    !(rate ? /^\d{1,3}(\.\d{1,4})?$/ : /^\d{1,12}(\.\d{1,2})?$/).test(value) ||
    (rate && Number(value) > 100)
  )
    throw new WorkforceError(
      rate
        ? "النسبة بين0 و100 وبأربع خانات عشرية كحد أقصى"
        : "اكتب المبلغ بالأرقام الإنجليزية وبمنزلتين عشريتين كحد أقصى",
    );
  return value;
}
export const moneyCents = (value: string) => {
  const [whole, part = ""] = moneyValue(value).split(".");
  return BigInt(whole) * BigInt(100) + BigInt(part.padEnd(2, "0"));
};
export const fromCents = (value: bigint) =>
  `${value / BigInt(100)}.${String(value % BigInt(100)).padStart(2, "0")}`;
export function itemAmount(item: PayrollItem): string {
  if (item.mode === "fixed") return fromCents(moneyCents(item.value));
  const [whole, part = ""] = moneyValue(item.value, true).split(".");
  const rate = BigInt(whole) * BigInt(10000) + BigInt(part.padEnd(4, "0"));
  return fromCents(
    (moneyCents(item.basis_amount) * rate + BigInt(500000)) / BigInt(1000000),
  );
}
export function payrollInput(value: unknown): PayrollInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new WorkforceError("بيانات الكشف غير صحيحة");
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) =>
        ![
          "basic_amount",
          "allowances_amount",
          "items",
          "deductions",
          "notes",
          "reason",
        ].includes(key),
    ) ||
    !Array.isArray(body.items) ||
    body.items.length > 100 ||
    (body.deductions !== undefined &&
      (!Array.isArray(body.deductions) || body.deductions.length > 100))
  )
    throw new WorkforceError("بنود الكشف غير صحيحة");
  return {
    basic_amount: moneyValue(body.basic_amount),
    allowances_amount: moneyValue(body.allowances_amount),
    notes: textField(body.notes ?? "", "الملاحظات", 0, 2000),
    reason: textField(body.reason, "السبب", 3, 2000),
    deductions: ((body.deductions ?? []) as unknown[]).map((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new WorkforceError("بند الحسم غير صحيح");
      const deduction = raw as Record<string, unknown>;
      if (
        Object.keys(deduction).some(
          (key) => !["title", "kind", "amount", "reference"].includes(key),
        ) ||
        !["insurance", "other"].includes(String(deduction.kind))
      )
        throw new WorkforceError("بند الحسم غير صحيح");
      return {
        title: textField(deduction.title, "اسم الحسم", 3, 150),
        kind: deduction.kind as PayrollDeduction["kind"],
        amount: moneyValue(deduction.amount),
        reference: textField(deduction.reference, "مرجع الحسم", 3, 500),
      };
    }),
    items: body.items.map((raw) => {
      if (
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw) ||
        Object.keys(raw).some(
          (key) =>
            ![
              "title",
              "mode",
              "value",
              "basis_amount",
              "task_id",
              "reference",
            ].includes(key),
        ) ||
        !["fixed", "percent"].includes(raw.mode)
      )
        throw new WorkforceError("الحافز غير صحيح");
      const task_id = raw.task_id ? uuid(raw.task_id) : "";
      const reference = textField(
        raw.reference ?? "",
        "مرجع الصفقة أو الحافز",
        task_id ? 0 : 3,
        500,
      );
      return {
        title: textField(raw.title, "اسم الحافز", 3, 150),
        mode: raw.mode,
        value: moneyValue(raw.value, raw.mode === "percent"),
        basis_amount:
          raw.mode === "percent" ? moneyValue(raw.basis_amount) : "",
        task_id,
        reference,
      };
    }),
  };
}

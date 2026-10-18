import { dateField, textField, WorkforceError } from "./validation";

export const COMMISSION_BASES = {
  sales: "قيمة البيع",
  collections: "المبالغ المحصلة",
  revenue: "الإيراد",
  profit: "هامش الربح",
  custom: "أساس آخر موضح في الشروط",
} as const;
export type Allowance = { name: string; amount: string };
export type CommissionTerm = {
  name: string;
  mode: "percent" | "fixed";
  value: string;
  basis: keyof typeof COMMISSION_BASES;
  conditions: string;
};
export type CompensationInput = {
  basic_salary: string;
  effective_from: string;
  allowances: Allowance[];
  commissions: CommissionTerm[];
  reason: string;
};
export type CompensationVersion = CompensationInput & {
  id: string;
  employee_id: string;
  revision: number;
  created_at: string;
  currency: "SAR";
};
export type CompensationData = {
  current: CompensationVersion | null;
  latest: CompensationVersion | null;
  history: CompensationVersion[];
  page: number;
  count: number;
  companyDate: string;
};

function decimal(value: unknown, percent = false) {
  if (
    typeof value !== "string" ||
    !(percent ? /^\d{1,3}(\.\d{1,4})?$/ : /^\d{1,9}(\.\d{1,2})?$/).test(
      value,
    ) ||
    (percent && Number(value) > 100)
  )
    throw new WorkforceError(
      percent
        ? "نسبة العمولة يجب أن تكون بين 0 و100 وبأربع خانات عشرية كحد أقصى"
        : "المبلغ يجب أن يكون موجبًا أو صفرًا وبمنزلتين عشريتين كحد أقصى",
    );
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new WorkforceError("بيانات المستحقات غير صحيحة");
  return value as Record<string, unknown>;
}
export function compensationInput(value: unknown): CompensationInput {
  const data = object(value);
  const arrays = (field: string): unknown[] => {
    const entries = data[field];
    if (!Array.isArray(entries) || entries.length > 30)
      throw new WorkforceError("الحد الأقصى ثلاثون بندًا لكل نوع");
    return entries;
  };
  return {
    basic_salary: decimal(data.basic_salary),
    effective_from: dateField(data.effective_from)!,
    reason: textField(data.reason, "سبب الإعداد أو التعديل", 3, 2000),
    allowances: arrays("allowances").map((entry) => {
      const item = object(entry);
      return {
        name: textField(item.name, "اسم البدل", 2, 150),
        amount: decimal(item.amount),
      };
    }),
    commissions: arrays("commissions").map((entry) => {
      const item = object(entry);
      if (
        !["percent", "fixed"].includes(String(item.mode)) ||
        !Object.hasOwn(COMMISSION_BASES, String(item.basis))
      )
        throw new WorkforceError("حدد طريقة العمولة وأساس الحساب");
      return {
        name: textField(item.name, "اسم العمولة", 2, 150),
        mode: item.mode as CommissionTerm["mode"],
        value: decimal(item.value, item.mode === "percent"),
        basis: item.basis as CommissionTerm["basis"],
        conditions: textField(
          item.conditions,
          "شروط الاستحقاق",
          item.basis === "custom" ? 3 : 0,
          2000,
        ),
      };
    }),
  };
}
/** Exact fixed compensation in halalas. Commissions are never included as earned money. */
export function fixedCompensation(
  input: Pick<CompensationInput, "basic_salary" | "allowances">,
) {
  const cents = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  };
  const sum = input.allowances.reduce(
    (total, item) => total + cents(item.amount),
    cents(input.basic_salary),
  );
  return `${sum / BigInt(100)}.${String(sum % BigInt(100)).padStart(2, "0")}`;
}

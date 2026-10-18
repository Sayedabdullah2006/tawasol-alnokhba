export class WorkforceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function textField(value: unknown, label: string, min = 0, max = 150) {
  if (typeof value !== "string")
    throw new WorkforceError(`${label}: قيمة غير صحيحة`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max)
    throw new WorkforceError(`${label}: يجب أن يكون بين ${min} و${max} حرفًا`);
  return normalized;
}
export function uuid(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new WorkforceError("معرّف غير صحيح");
  return value;
}
export function dateField(value: unknown, optional = false): string | null {
  if (optional && (value === "" || value === null || value === undefined))
    return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new WorkforceError("التاريخ غير صحيح");
  const parsed = new Date(`${value}T12:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new WorkforceError("التاريخ غير صحيح");
  return value;
}
export function ibanField(value: unknown) {
  const iban = textField(value, "الآيبان", 15, 34)
    .replace(/\s/g, "")
    .toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban))
    throw new WorkforceError("صيغة الآيبان غير صحيحة");
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55),
  );
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  if (remainder !== 1 || (iban.startsWith("SA") && iban.length !== 24))
    throw new WorkforceError("رقم الآيبان لا يجتاز التحقق");
  return iban;
}
export function employeeFields(body: Record<string, unknown>) {
  const start_date = dateField(body.start_date)!;
  const contract_end = dateField(body.contract_end, true);
  if (contract_end && contract_end < start_date)
    throw new WorkforceError("انتهاء العقد يجب أن يلي تاريخ الانضمام");
  const contract_type = textField(body.contract_type, "نوع التعاقد", 1);
  if (
    !["full_time", "part_time", "contractor", "temporary"].includes(
      contract_type,
    )
  )
    throw new WorkforceError("نوع التعاقد غير صحيح");
  return {
    full_name: textField(body.full_name, "الاسم", 2),
    phone: textField(body.phone ?? "", "الهاتف", 0, 30),
    city: textField(body.city ?? "", "المدينة", 0, 100),
    job_title: textField(body.job_title ?? "", "المسمى", 0, 150),
    ...(body.responsibilities !== undefined ? { responsibilities: textField(body.responsibilities, "المهام والمسؤوليات", 0, 10000) } : {}),
    department_id: body.department_id ? uuid(body.department_id) : null,
    contract_type,
    start_date,
    contract_end,
  };
}

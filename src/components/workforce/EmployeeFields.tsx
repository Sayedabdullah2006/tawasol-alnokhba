"use client";
import { CONTRACT_LABELS, type Department } from "@/lib/workforce/types";
import { controlClass, Field } from "./shared";
import DateInput from "./DateInput";
export type EmployeeForm = {
  full_name: string;
  email: string;
  password: string;
  phone: string;
  city: string;
  job_title: string;
  responsibilities: string;
  national_id: string;
  birth_date: string;
  qualification: string;
  national_address: string;
  department_id: string;
  contract_type: string;
  start_date: string;
  contract_end: string;
};
export const emptyEmployeeForm: EmployeeForm = {
  full_name: "",
  email: "",
  password: "",
  phone: "",
  city: "",
  job_title: "",
  responsibilities: "",
  national_id: "",
  birth_date: "",
  qualification: "",
  national_address: "",
  department_id: "",
  contract_type: "full_time",
  start_date: "",
  contract_end: "",
};
export default function EmployeeFields({
  value,
  onChange,
  departments,
  creating = false,
  employee = false,
}: {
  value: EmployeeForm;
  onChange: (value: EmployeeForm) => void;
  departments: Department[];
  creating?: boolean;
  employee?: boolean;
}) {
  const input = (
    key: keyof EmployeeForm,
    label: string,
    type = "text",
    required = false,
    maxLength = 150,
  ) =>
    type === "date" ? (
      <DateInput
        id={`employee-${key}`}
        label={label}
        required={required}
        value={value[key]}
        onChange={(date) => onChange({ ...value, [key]: date })}
      />
    ) : (
      <Field label={label} id={`employee-${key}`}>
        <input
          id={`employee-${key}`}
          className={controlClass}
          type={type}
          maxLength={maxLength}
          required={required}
          value={value[key]}
          onChange={(event) =>
            onChange({ ...value, [key]: event.target.value })
          }
          dir={["email", "password", "tel"].includes(type) ? "ltr" : undefined}
          autoComplete={key === "password" ? "new-password" : undefined}
          minLength={key === "password" ? 12 : undefined}
        />
      </Field>
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {!employee && input("full_name", "الاسم الكامل", "text", true)}
      {creating && (
        <>
          {input("email", "بريد تسجيل الدخول", "email", true, 254)}
          {input(
            "password",
            "كلمة مرور أولية — 12 حرفًا على الأقل",
            "password",
            true,
            128,
          )}
        </>
      )}
      {input("phone", "رقم التواصل", "tel", false, 30)}
      {input("city", "المدينة", "text", false, 100)}
      {!employee && (
        <>
          {input("national_id", "رقم الهوية أو الإقامة", "text", false, 30)}
          {input("birth_date", "تاريخ الميلاد", "date")}
          {input("qualification", "المؤهل والتخصص", "text", false, 250)}
          {input("national_address", "العنوان الوطني", "text", false, 250)}
          {input("job_title", "المسمى الوظيفي")}
          <div className="sm:col-span-2">
            <Field label="الوصف الوظيفي" id="employee-responsibilities">
              <textarea
                id="employee-responsibilities"
                rows={4}
                maxLength={10000}
                className={controlClass}
                value={value.responsibilities}
                onChange={(event) =>
                  onChange({ ...value, responsibilities: event.target.value })
                }
              />
            </Field>
          </div>
          <Field label="القسم" id="employee-department_id">
            <select
              id="employee-department_id"
              className={controlClass}
              value={value.department_id}
              onChange={(event) =>
                onChange({ ...value, department_id: event.target.value })
              }
            >
              <option value="">دون قسم</option>
              {departments.map((department) => (
                <option value={department.id} key={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="نوع التعاقد" id="employee-contract_type">
            <select
              id="employee-contract_type"
              className={controlClass}
              value={value.contract_type}
              onChange={(event) =>
                onChange({ ...value, contract_type: event.target.value })
              }
            >
              {Object.entries(CONTRACT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {input("start_date", "تاريخ الانضمام", "date", true)}
          {input("contract_end", "انتهاء العقد — اختياري", "date")}
        </>
      )}
    </div>
  );
}

"use client";
import { useEffect, useId, useState } from "react";
import { TASK_PRIORITIES, type WorkTask } from "@/lib/workforce/task-types";
import { api, controlClass, Field, Notice } from "./shared";
import DateInput from "./DateInput";
import { dateField } from "@/lib/workforce/validation";
import Button from "@/components/ui/Button";

export type TaskForm = {
  client_name: string;
  title: string;
  description: string;
  completion_criteria: string;
  assignee_id: string;
  priority: string;
  starts_at: string;
  due_at: string;
  estimate_minutes: string;
  requires_approval: boolean;
  shared_with_board: boolean;
};
const localDate = (value: string | null) =>
  value
    ? new Date(new Date(value).getTime() + 3 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 16)
    : "";
export const taskForm = (task?: WorkTask): TaskForm => ({
  client_name: task?.client_name ?? "",
  title: task?.title ?? "",
  description: task?.description ?? "",
  completion_criteria: task?.completion_criteria ?? "",
  assignee_id: task?.assignee_id ?? "",
  priority: task?.priority ?? "normal",
  starts_at: localDate(task?.starts_at ?? null),
  due_at: localDate(task?.due_at ?? null),
  estimate_minutes: task?.estimate_minutes?.toString() ?? "",
  requires_approval: task?.requires_approval ?? true,
  shared_with_board: task?.shared_with_board ?? false,
});
export function taskPayload(form: TaskForm, admin: boolean) {
  const date = (value: string) => {
    if (!value) return null;
    dateField(value.slice(0, 10));
    return new Date(`${value}:00+03:00`).toISOString();
  };
  return {
    client_name: form.client_name.trim(),
    title: form.title,
    description: form.description,
    completion_criteria: form.completion_criteria,
    priority: form.priority,
    starts_at: date(form.starts_at),
    due_at: date(form.due_at),
    estimate_minutes:
      form.estimate_minutes === "" ? null : Number(form.estimate_minutes),
    ...(admin
      ? {
          assignee_id: form.assignee_id || null,
          requires_approval: form.requires_approval,
          shared_with_board: form.shared_with_board,
        }
      : {}),
  };
}
export function EmployeePicker({
  value,
  onChange,
  title = "المسؤول الأساسي",
  selectLabel = "اختيار المسؤول",
}: {
  value: string;
  onChange: (id: string, name?: string) => void;
  title?: string;
  selectLabel?: string;
}) {
  const pickerId = useId();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<{ id: string; full_name: string }[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    api<{ employees: typeof rows; count: number }>(
      `/api/workforce/employees?status=active&q=${encodeURIComponent(search)}&page=${page}&sort=name`,
      { signal: abort.signal },
    )
      .then((data) => {
        setRows(data.employees);
        setCount(data.count);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [search, page]);
  return (
    <fieldset className="space-y-3 rounded-xl border border-border p-3">
      <legend className="font-bold">{title}</legend>
      <Notice message={error} error />
      <Field label="البحث عن موظف" id={`${pickerId}-search`}>
        <input
          id={`${pickerId}-search`}
          className={controlClass}
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="الاسم أو المسمى…"
        />
      </Field>
      <Field label={selectLabel} id={`${pickerId}-assignee`}>
        <select
          id={`${pickerId}-assignee`}
          className={controlClass}
          value={value}
          onChange={(e) =>
            onChange(
              e.target.value,
              rows.find((row) => row.id === e.target.value)?.full_name,
            )
          }
        >
          <option value="">اختر موظفًا أو اتركه دون اختيار</option>
          {value && !rows.some((row) => row.id === value) && (
            <option value={value}>الموظف المحدد حاليًا</option>
          )}
          {rows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.full_name}
            </option>
          ))}
        </select>
      </Field>
      {count > 20 && (
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((n) => n - 1)}
          >
            موظفون سابقون
          </Button>
          <span>{page}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page * 20 >= count}
            onClick={() => setPage((n) => n + 1)}
          >
            موظفون تالون
          </Button>
        </div>
      )}
    </fieldset>
  );
}
export default function TaskFields({
  value,
  onChange,
  admin,
}: {
  value: TaskForm;
  onChange: (value: TaskForm) => void;
  admin: boolean;
}) {
  const change = (patch: Partial<TaskForm>) => onChange({ ...value, ...patch });
  const when = (field: "starts_at" | "due_at", label: string) => (
    <div className="space-y-2">
      <DateInput
        id={`task-${field}`}
        label={label}
        value={value[field].slice(0, 10)}
        onChange={(day) =>
          change({
            [field]: day ? `${day}T${value[field].slice(11) || "09:00"}` : "",
          })
        }
      />
      <Field label={`وقت ${label} — الرياض`} id={`task-${field}-time`}>
        <input
          id={`task-${field}-time`}
          type="time"
          className={controlClass}
          value={value[field].slice(11)}
          disabled={!value[field]}
          onChange={(e) =>
            change({
              [field]: `${value[field].slice(0, 10)}T${e.target.value || "09:00"}`,
            })
          }
        />
      </Field>
    </div>
  );
  return (
    <div className="space-y-4">
      <Field label="العميل أو مجال العمل" id="task-client" hint="اكتبي أي عميل جديد، أو تطوير الشركة للأعمال الداخلية.">
        <input id="task-client" className={controlClass} maxLength={150} list="task-clients" value={value.client_name} onChange={(e) => change({ client_name: e.target.value })} />
        <datalist id="task-clients"><option value="أول سعودي" /><option value="بلاتفورم" /><option value="تطوير الشركة" /></datalist>
      </Field>
      <Field label="عنوان المهمة" id="task-title">
        <input
          id="task-title"
          required
          minLength={2}
          maxLength={250}
          className={controlClass}
          value={value.title}
          onChange={(e) => change({ title: e.target.value })}
        />
      </Field>
      <Field label="وصف العمل المطلوب" id="task-description">
        <textarea
          id="task-description"
          rows={3}
          maxLength={30000}
          className={controlClass}
          value={value.description}
          onChange={(e) => change({ description: e.target.value })}
        />
      </Field>
      <Field label="معيار الإنجاز والتسليم" id="task-criteria">
        <textarea
          id="task-criteria"
          rows={2}
          maxLength={10000}
          className={controlClass}
          value={value.completion_criteria}
          onChange={(e) => change({ completion_criteria: e.target.value })}
          placeholder="ما النتيجة المطلوبة لقبول المهمة؟"
        />
      </Field>
      {admin && (
        <EmployeePicker
          value={value.assignee_id}
          onChange={(id) => change({ assignee_id: id })}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الأولوية" id="task-priority">
          <select
            id="task-priority"
            className={controlClass}
            value={value.priority}
            onChange={(e) => change({ priority: e.target.value })}
          >
            {Object.entries(TASK_PRIORITIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الوقت التقديري بالدقائق — اختياري" id="task-estimate">
          <input
            id="task-estimate"
            type="number"
            min={0}
            max={525600}
            step={1}
            className={controlClass}
            value={value.estimate_minutes}
            onChange={(e) => change({ estimate_minutes: e.target.value })}
          />
        </Field>
        {when("starts_at", "بداية المهمة")}
        {when("due_at", "موعد التسليم")}
      </div>
      {admin && (
        <div className="space-y-3 text-sm">
          <label className="flex gap-3">
            <input
              type="checkbox"
              checked={value.requires_approval}
              onChange={(e) => change({ requires_approval: e.target.checked })}
            />
            يتطلب الإكمال اعتماد المدير
          </label>
          <p className="text-muted">تظهر مهام الفريق للقراءة، وتقتصر إجراءات التنفيذ على الموظفة المسندة إليها المهمة.</p>
        </div>
      )}
    </div>
  );
}

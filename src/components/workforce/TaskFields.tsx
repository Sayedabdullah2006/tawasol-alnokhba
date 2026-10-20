"use client";
import { useEffect, useId, useState } from "react";
import { TASK_PRIORITIES, type WorkTask } from "@/lib/workforce/task-types";
import { api, controlClass, Field, Notice } from "./shared";
import DateRangePicker from "./DateRangePicker";
import { dateField } from "@/lib/workforce/validation";
import Button from "@/components/ui/Button";

export type TaskForm = {
  client_name: string;
  title: string;
  description: string;
  completion_criteria: string;
  assignee_id: string;
  co_assignee_ids: string[];
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
  assignee_id: task?.assignee_admin_id
    ? `admin:${task.assignee_admin_id}`
    : (task?.assignee_id ?? ""),
  co_assignee_ids: task?.co_assignee_ids ?? [],
  priority: task?.priority ?? "normal",
  starts_at: localDate(task?.starts_at ?? null),
  due_at: localDate(task?.due_at ?? null),
  estimate_minutes: task?.estimate_minutes?.toString() ?? "",
  requires_approval: task?.requires_approval ?? true,
  shared_with_board: task?.shared_with_board ?? false,
});
export function taskPayload(form: TaskForm, admin: boolean, canAssign = admin) {
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
    ...(canAssign
      ? {
          co_assignee_ids: form.co_assignee_ids.filter(id => id !== form.assignee_id),
          assignee_id: form.assignee_id.startsWith("admin:")
            ? null
            : form.assignee_id || null,
          assignee_admin_id: form.assignee_id.startsWith("admin:")
            ? form.assignee_id.slice(6)
            : null,
          requires_approval: admin ? form.requires_approval : true,
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
  includeAdmins = false,
}: {
  value: string;
  onChange: (id: string, name?: string) => void;
  title?: string;
  selectLabel?: string;
  includeAdmins?: boolean;
}) {
  const pickerId = useId();
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<{ id: string; full_name: string }[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    api<{ employees: typeof rows; count: number }>(
      `/api/workforce/team?page=${page}${includeAdmins ? "&assignable=true" : ""}`,
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
  }, [page, includeAdmins]);
  return (
    <fieldset className="space-y-3">
      <Notice message={error} error />
      <Field label={title} id={`${pickerId}-assignee`}>
        <select
          id={`${pickerId}-assignee`}
          className={controlClass}
          aria-label={selectLabel}
          value={value}
          onChange={(e) =>
            onChange(
              e.target.value,
              rows.find((row) => row.id === e.target.value)?.full_name,
            )
          }
        >
          <option value="">اختر المسؤول</option>
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
function CoAssignees({ value, primary, onChange }: { value: string[]; primary: string; onChange: (ids: string[]) => void }) {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const abort = new AbortController();
    api<{ employees: { id: string; full_name: string }[] }>("/api/workforce/team", { signal: abort.signal })
      .then(data => setNames(Object.fromEntries(data.employees.map(e => [e.id, e.full_name])))).catch(() => {});
    return () => abort.abort();
  }, []);
  return <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
    <EmployeePicker title="مسؤولون إضافيون" selectLabel="إضافة مسؤول مشترك" value="" onChange={(id, name) => {
      if (id && id !== primary && !value.includes(id)) { onChange([...value, id]); if (name) setNames(previous => ({ ...previous, [id]: name })); }
    }} />
    {!!value.length && <div className="flex flex-wrap gap-2">{value.filter(id => id !== primary).map(id => <span key={id} className="inline-flex items-center gap-3 rounded-full bg-white px-3 py-2 text-sm font-bold text-indigo-950">{names[id] || "مسؤول مشترك"}<button type="button" aria-label={`إزالة ${names[id] || "المسؤول المشترك"}`} onClick={() => onChange(value.filter(item => item !== id))} className="rounded-full px-1 hover:bg-indigo-100">×</button></span>)}</div>}
  </div>;
}
export default function TaskFields({
  value,
  onChange,
  admin,
  canAssign = admin,
}: {
  value: TaskForm;
  onChange: (value: TaskForm) => void;
  admin: boolean;
  canAssign?: boolean;
}) {
  const change = (patch: Partial<TaskForm>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
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
      <Field label="تفاصيل المهمة" id="task-description">
        <textarea
          id="task-description"
          rows={2}
          maxLength={30000}
          className={controlClass}
          value={value.description}
          onChange={(e) => change({ description: e.target.value })}
        />
      </Field>
      <Field label="المطلوب تسليمه" id="task-criteria">
        <textarea
          id="task-criteria"
          rows={2}
          maxLength={10000}
          className={controlClass}
          value={value.completion_criteria}
          onChange={(e) => change({ completion_criteria: e.target.value })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {canAssign && (
          <EmployeePicker
            includeAdmins
            value={value.assignee_id}
            onChange={(id) => change({ assignee_id: id })}
          />
        )}
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
      </div>
      {canAssign && <CoAssignees value={value.co_assignee_ids} primary={value.assignee_id} onChange={ids => change({ co_assignee_ids: ids })} />}
      <DateRangePicker
        start={value.starts_at.slice(0, 10)}
        end={value.due_at.slice(0, 10)}
        onChange={({ start, end }) =>
          change({
            starts_at: start ? `${start}T00:00` : "",
            due_at: end ? `${end}T23:59` : "",
          })
        }
      />
      {admin && (
        <div className="space-y-3 text-sm">
          <label className="flex gap-3">
            <input
              type="checkbox"
              checked={value.requires_approval}
              onChange={(e) => change({ requires_approval: e.target.checked })}
            />
            اعتماد المدير عند التسليم
          </label>
        </div>
      )}
    </div>
  );
}

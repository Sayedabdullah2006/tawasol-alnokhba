"use client";
import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { weeklyRows, weekDate, WEEK_DAYS } from "@/lib/workforce/weekly-plan";
import { EmployeePicker } from "./TaskFields";
import DateInput from "./DateInput";
import {
  api,
  controlClass,
  Dialog,
  Field,
  Notice,
  useConfirm,
  useUnsavedChanges,
} from "./shared";

export default function WeeklyPlan({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState(weeklyRows);
  const [employees, setEmployees] = useState(["", ""]);
  const [start, setStart] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false),
    retry = useRef({ serialized: "", key: "" });
  const { confirm, confirmation } = useConfirm();
  const unsaved = useUnsavedChanges(true);
  return (
    <>
      {confirmation}
      {unsaved}
      <Dialog
        title="إسناد خطة أسبوعية"
        open
        onClose={async () => {
          if (!busy && (await confirm("إغلاق الخطة دون إسنادها؟"))) onClose();
        }}
      >
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError("");
            try {
              if (employees.some((id) => !id) || employees[0] === employees[1])
                throw new Error("اختاري موظفتين مختلفتين");
              if (new Date(`${weekDate(start, 0)}T00:00:00Z`).getUTCDay() !== 0)
                throw new Error("اختاري يوم الأحد لبداية الأسبوع");
              const tasks = rows.map((row) => ({
                id: row.id,
                title: row.title,
                client_name: row.client_name,
                completion_criteria: row.completion_criteria,
                assignee_id: employees[row.employee],
                starts_at: `${weekDate(start, row.day)}T09:00:00+03:00`,
                due_at: `${weekDate(start, row.day)}T16:00:00+03:00`,
                requires_approval: true,
              }));
              const serialized = JSON.stringify(tasks);
              if (retry.current.serialized !== serialized)
                retry.current = { serialized, key: crypto.randomUUID() };
              await api("/api/workforce/weekly-plan", {
                method: "POST",
                body: JSON.stringify({ tasks, request_key: retry.current.key }),
              });
              onSaved();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          <p className="text-sm leading-7 text-muted">
            قالب قابل للتعديل قبل الإسناد: مهمة يومية لكل موظفة من الأحد إلى
            الخميس، من 9 صباحًا إلى 4 مساءً بتوقيت الرياض. غيّري العملاء
            والعناوين والتسليمات لتناسب الاتفاقات الفعلية. يمكنك تعديل المواعيد
            من تفاصيل المهمة بعد الإسناد.
          </p>
          <DateInput
            label="بداية الأسبوع — الأحد"
            id="week-start"
            required
            value={start}
            onChange={setStart}
          />
          {employees.map((id, index) => (
            <EmployeePicker
              key={index}
              value={id}
              title={`الموظفة ${index === 0 ? "الأولى" : "الثانية"}`}
              onChange={(id) =>
                setEmployees((previous) =>
                  previous.map((value, i) => (i === index ? id : value)),
                )
              }
            />
          ))}
          {rows.map((row, index) => (
            <fieldset
              key={row.id}
              className="space-y-3 rounded-xl border border-border p-4"
            >
              <legend className="font-bold">
                {WEEK_DAYS[row.day]} · الموظفة{" "}
                {row.employee === 0 ? "الأولى" : "الثانية"}
              </legend>
              {(
                [
                  ["client_name", "العميل أو مجال العمل"],
                  ["title", "المهمة"],
                  ["completion_criteria", "المطلوب تسليمه"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label} id={`weekly-${index}-${key}`}>
                  <input
                    id={`weekly-${index}-${key}`}
                    required
                    minLength={key === "client_name" ? 1 : 3}
                    maxLength={
                      key === "client_name"
                        ? 150
                        : key === "title"
                          ? 250
                          : 10000
                    }
                    className={controlClass}
                    value={row[key]}
                    onChange={(e) =>
                      setRows((previous) =>
                        previous.map((item) =>
                          item.id === row.id
                            ? { ...item, [key]: e.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </Field>
              ))}
            </fieldset>
          ))}
          <Notice message={error} error />
          <Button type="submit" loading={busy}>
            إسناد المهام العشر وإشعار الموظفتين
          </Button>
        </form>
      </Dialog>
    </>
  );
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import {
  fromCents,
  itemAmount,
  moneyCents,
  payrollAction,
  payrollStatus,
  type PayrollData,
  type PayrollInput,
  type PayrollItem,
} from "@/lib/workforce/payroll";
import { workDate } from "@/lib/workforce/task-types";
import CompensationPanel from "./CompensationPanel";
import {
  api,
  controlClass,
  Field,
  hasUnsavedWorkforceChanges,
  Notice,
  Panel,
  useConfirm,
  useUnsavedChanges,
} from "./shared";

const currentMonth = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
const money = (value: string | null) =>
  value === null
    ? "—"
    : `${Number(value).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const emptyItem = (): PayrollItem => ({
  title: "",
  mode: "fixed",
  value: "",
  basis_amount: "",
  task_id: "",
  reference: "",
});
function TaskPicker({
  employeeId,
  value,
  onChange,
}: {
  employeeId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [rows, setRows] = useState<{ id: string; title: string }[]>([]),
    [count, setCount] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    api<{ tasks: typeof rows; count: number }>(
      `/api/workforce/tasks?assignee_id=${employeeId}&q=${encodeURIComponent(search)}&page=${page}`,
      { signal: abort.signal },
    )
      .then((result) => {
        setRows(result.tasks);
        setCount(result.count);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [employeeId, search, page]);
  return (
    <div className="space-y-2">
      <input
        aria-label="بحث عن مهمة لربط الحافز"
        className={controlClass}
        placeholder="بحث عن مهمة — اختياري"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      <select
        aria-label="المهمة المرتبطة بالحافز"
        className={controlClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">دون مهمة — أدخلي مرجع الصفقة أدناه</option>
        {value && !rows.some((row) => row.id === value) && (
          <option value={value}>المهمة المحددة</option>
        )}
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {row.title}
          </option>
        ))}
      </select>
      <Notice message={error} error />
      {count > 20 && (
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((n) => n - 1)}
          >
            السابق
          </Button>
          <span>{page}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page * 20 >= count}
            onClick={() => setPage((n) => n + 1)}
          >
            التالي
          </Button>
        </div>
      )}
    </div>
  );
}

export default function MonthlyPayroll({
  employeeId,
  admin = false,
  compact = false,
  initialMonth,
  onClose,
}: {
  employeeId: string;
  admin?: boolean;
  compact?: boolean;
  initialMonth?: string;
  onClose?: () => void;
}) {
  const [month, setMonth] = useState(initialMonth || currentMonth),
    [data, setData] = useState<PayrollData | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0),
    [loaded, setLoaded] = useState("");
  const [editing, setEditing] = useState(false),
    [form, setForm] = useState<PayrollInput | null>(null),
    [original, setOriginal] = useState("");
  const [reason, setReason] = useState(""),
    [payment, setPayment] = useState(""),
    [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false),
    [configDirty, setConfigDirty] = useState(false);
  const id = useRef(""),
    lock = useRef(false),
    retry = useRef({ serialized: "", key: "" });
  const key = `${employeeId}:${month}:${revision}`,
    loading = loaded !== key;
  const { confirm, confirmation } = useConfirm();
  const dirty =
    (editing && JSON.stringify(form) !== original) ||
    configDirty ||
    !!reason ||
    !!payment ||
    !!reference;
  const unsaved = useUnsavedChanges(dirty);
  const setDirty = useCallback((value: boolean) => setConfigDirty(value), []);
  useEffect(() => {
    const refresh = () => {
      if (!busy && !dirty) setRevision((n) => n + 1);
    };
    window.addEventListener("workforce-data-changed", refresh);
    return () => window.removeEventListener("workforce-data-changed", refresh);
  }, [busy, dirty]);
  useEffect(() => {
    const abort = new AbortController();
    api<PayrollData>(
      `/api/workforce/employees/${employeeId}/payroll?month=${month}`,
      { signal: abort.signal },
    )
      .then((result) => {
        setData(result);
        setLoaded(key);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setData(null);
          setLoaded(key);
          setError(e.message);
        }
      });
    return () => abort.abort();
  }, [employeeId, month, key]);
  async function send(command: string, payload: unknown) {
    if (lock.current || !data) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const serialized = JSON.stringify({
        id: id.current || data.statement?.id,
        month,
        command,
        payload,
        version: data.statement?.version ?? 0,
      });
      if (retry.current.serialized !== serialized)
        retry.current = { serialized, key: crypto.randomUUID() };
      await api(`/api/workforce/employees/${employeeId}/payroll`, {
        method: "POST",
        body: JSON.stringify({
          id: id.current || data.statement?.id,
          month,
          version: data.statement?.version ?? 0,
          command,
          payload,
          request_key: retry.current.key,
        }),
      });
      setEditing(false);
      setReason("");
      setPayment("");
      setReference("");
      setRevision((n) => n + 1);
      setMessage(
        command === "pay"
          ? "تم توثيق الصرف المسجل وإشعار الموظفة؛ لا ينفذ الموقع تحويلًا بنكيًا."
          : "تم حفظ الإجراء وإشعار الموظفة.",
      );
      window.dispatchEvent(new Event("workforce-notifications"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function edit() {
    if (!data) return;
    id.current = data.statement?.id || crypto.randomUUID();
    const value: PayrollInput = {
      basic_amount:
        data.statement?.basic_amount ?? data.defaults?.basic_amount ?? "",
      allowances_amount:
        data.statement?.allowances_amount ??
        data.defaults?.allowances_amount ??
        "0",
      items: (data.statement?.items ?? []).map((item) => ({
        title: item.title,
        mode: item.mode,
        value: item.value,
        basis_amount: item.basis_amount ?? "",
        task_id: item.task_id ?? "",
        reference: item.reference,
      })),
      deductions: data.statement?.deductions ?? [],
      notes: data.statement?.notes ?? "",
      reason: "",
    };
    setForm(value);
    setOriginal(JSON.stringify(value));
    setEditing(true);
  }
  function changeItem(index: number, patch: Partial<PayrollItem>) {
    setForm((value) =>
      value
        ? {
            ...value,
            items: value.items.map((item, i) =>
              i === index ? { ...item, ...patch } : item,
            ),
          }
        : value,
    );
  }
  const statement = data?.statement;
  const expected =
    statement?.total_amount ??
    (data?.defaults
      ? fromCents(
          moneyCents(data.defaults.basic_amount) +
            moneyCents(data.defaults.allowances_amount),
        )
      : null);
  const approved =
      statement && statement.status !== "draft" ? statement.total_amount : "0",
    paid = statement?.paid_amount ?? "0";
  const remaining = fromCents(moneyCents(approved) - moneyCents(paid));
  let preview: string | null = null;
  if (form) {
    try {
      const gross = form.items.reduce(
        (sum, item) => sum + moneyCents(itemAmount(item)),
        moneyCents(form.basic_amount) + moneyCents(form.allowances_amount),
      );
      const deducted = form.deductions.reduce(
        (sum, item) => sum + moneyCents(item.amount),
        BigInt(0),
      );
      const attendance=moneyCents(data?.statement?.attendance_amount??"0");
      preview = deducted <= gross ? fromCents(gross-deducted-(attendance>gross-deducted?gross-deducted:attendance)) : null;
    } catch {
      preview = null;
    }
  }
  const year = Number(month.slice(0, 4));
  return (
    <Panel
      title={
        compact
          ? "مستحقاتي هذا الشهر"
          : admin
            ? `الراتب والحوافز — ${data?.employee.full_name ?? "الموظفة"}`
            : "تفاصيل مستحقاتي الشهرية"
      }
    >
      {confirmation}
      {unsaved}
      {onClose && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            if (
              !hasUnsavedWorkforceChanges() ||
              (await confirm("تجاهل التغييرات غير المحفوظة والعودة للداشبورد؟"))
            )
              onClose();
          }}
        >
          ← العودة للداشبورد
        </Button>
      )}
      <div className="my-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-bold">
          الشهر{" "}
          <select
            aria-label="شهر المستحقات"
            className="mr-2 rounded-xl border p-2"
            value={month.slice(5)}
            disabled={dirty || busy}
            onChange={(e) => setMonth(`${month.slice(0, 4)}-${e.target.value}`)}
          >
            {Array.from({ length: 12 }, (_, i) =>
              String(i + 1).padStart(2, "0"),
            ).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <select
          aria-label="سنة المستحقات"
          className="rounded-xl border p-2"
          value={month.slice(0, 4)}
          disabled={dirty || busy}
          onChange={(e) => setMonth(`${e.target.value}-${month.slice(5)}`)}
        >
          {Array.from({ length: 11 }, (_, i) => year - 5 + i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setRevision((n) => n + 1)}
        >
          تحديث المستحقات
        </Button>
      </div>
      <Notice message={error} error />
      <Notice message={message} />
      {loading ? (
        <p role="status">جارٍ تحميل كشف الشهر…</p>
      ) : (
        data && (
          <>
            <p className="mb-4 text-sm font-bold">
              {statement ? payrollStatus[statement.status] : "قيد الإعداد"}
            </p>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                ["الراتب المستحق", expected],
                ["المعتمد", approved],
                ["المصروف المسجل", paid],
                ["المتبقي من المعتمد", remaining],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-border bg-slate-50 p-4"
                >
                  <p className="text-xs text-muted">{label}</p>
                  <p className="mt-2 break-words font-black text-green">
                    {money(value)}
                  </p>
                </div>
              ))}
            </div>

            {compact ? (
              <Link
                className="inline-block py-3 text-sm font-bold text-green"
                href="/employee/finance/overview"
              >
                تفاصيل الراتب والحوافز والعمولات ←
              </Link>
            ) : (
              <>
                {admin && (
                  <details className="my-5 rounded-xl border p-4">
                    <summary className="cursor-pointer font-bold">
                      إعداد الراتب والبدلات ونسب العمولة المستمرة
                    </summary>
                    <CompensationPanel
                      employeeId={employeeId}
                      startDate={data.employee.start_date}
                      admin
                      onDirtyChange={setDirty}
                      onSaved={() => setRevision((n) => n + 1)}
                    />
                  </details>
                )}
                {!editing && (statement || data.defaults) && (
                  <div className="my-4 space-y-3 text-sm">
                    <p>
                      الراتب الأساسي:{" "}
                      <strong>
                        {money(
                          statement?.basic_amount ??
                            data.defaults?.basic_amount ??
                            null,
                        )}
                      </strong>{" "}
                      · البدلات:{" "}
                      <strong>
                        {money(
                          statement?.allowances_amount ??
                            data.defaults?.allowances_amount ??
                            null,
                        )}
                      </strong>
                    </p>
                    {statement?.items.map((item, index) => (
                      <div key={index} className="rounded-xl border p-3">
                        <p className="font-bold">
                          {item.title} — {money(item.amount ?? "0")}
                        </p>
                        {item.mode === "percent" && (
                          <p>
                            {item.value}٪ من {money(item.basis_amount)}
                          </p>
                        )}
                        <p className="break-words text-muted">
                          {item.reference}
                        </p>
                        {item.task_id && (
                          <Link
                            className="font-bold text-green"
                            href={`${admin ? "/admin/workforce/tasks" : "/employee/work/tasks"}/${item.task_id}`}
                          >
                            المهمة المرتبطة ←
                          </Link>
                        )}
                      </div>
                    ))}
                    {(!!statement?.deductions.length||Number(statement?.attendance_amount??0)>0) && statement && (
                      <section className="rounded-xl border p-3">
                        <p className="font-bold">الحسومات</p>
                        <p>
                          الإجمالي قبل الحسومات: {money(statement.gross_amount)}
                        </p>
                        {statement.deductions.map((item, index) => (
                          <div
                            key={index}
                            className="mt-2 flex flex-wrap justify-between gap-2"
                          >
                            <span>
                              {item.kind === "insurance"
                                ? "التأمينات الاجتماعية"
                                : item.title}{" "}
                              · {item.reference}
                            </span>
                            <strong className="text-red-700">
                              − {money(item.amount)}
                            </strong>
                          </div>
                        ))}
                        {Number(statement.attendance_amount??0)>0&&<div className="mt-2 flex flex-wrap justify-between gap-2"><span>تسوية ساعات الحضور · {Math.floor((statement.attendance_details?.missing_seconds??0)/3600)} س {Math.floor((statement.attendance_details?.missing_seconds??0)%3600/60)} د</span><strong>− {money(statement.attendance_amount??"0")}</strong></div>}
                        <p className="mt-2 font-bold">
                          مجموع الحسومات: {money(statement.deductions_amount)}
                        </p>
                      </section>
                    )}
                    {statement?.notes && (
                      <p className="whitespace-pre-wrap">{statement.notes}</p>
                    )}
                  </div>
                )}
                {admin &&
                  !editing &&
                  (!statement || statement.status === "draft") && (
                    <Button onClick={edit}>إعداد أو تعديل تقدير الشهر</Button>
                  )}
                {admin && editing && form && (
                  <form
                    className="my-5 space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send("save", form);
                    }}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          ["basic_amount", "الراتب الأساسي لهذا الشهر"],
                          ["allowances_amount", "بدلات هذا الشهر"],
                        ] as const
                      ).map(([field, label]) => (
                        <Field
                          key={field}
                          label={label}
                          id={`payroll-${field}`}
                        >
                          <input
                            id={`payroll-${field}`}
                            required
                            inputMode="decimal"
                            className={controlClass}
                            value={form[field]}
                            onChange={(e) =>
                              setForm({ ...form, [field]: e.target.value })
                            }
                          />
                        </Field>
                      ))}
                    </div>
                    {form.items.map((item, index) => (
                      <fieldset
                        key={index}
                        className="space-y-3 rounded-xl border p-4"
                      >
                        <legend className="font-bold">
                          حافز / عمولة {index + 1}
                        </legend>
                        <Field
                          label="اسم الحافز أو العمولة"
                          id={`award-title-${index}`}
                        >
                          <input
                            id={`award-title-${index}`}
                            required
                            minLength={3}
                            maxLength={150}
                            className={controlClass}
                            value={item.title}
                            onChange={(e) =>
                              changeItem(index, { title: e.target.value })
                            }
                          />
                        </Field>
                        <select
                          aria-label={`طريقة الحافز ${index + 1}`}
                          className={controlClass}
                          value={item.mode}
                          onChange={(e) =>
                            changeItem(index, {
                              mode: e.target.value as PayrollItem["mode"],
                            })
                          }
                        >
                          <option value="fixed">مبلغ ثابت</option>
                          <option value="percent">
                            نسبة من مبلغ يحدده الأدمن
                          </option>
                        </select>
                        <Field
                          label={
                            item.mode === "percent"
                              ? "النسبة المئوية"
                              : "مبلغ الحافز"
                          }
                          id={`award-value-${index}`}
                        >
                          <input
                            id={`award-value-${index}`}
                            required
                            inputMode="decimal"
                            className={controlClass}
                            value={item.value}
                            onChange={(e) =>
                              changeItem(index, { value: e.target.value })
                            }
                          />
                        </Field>
                        {item.mode === "percent" && (
                          <Field
                            label="مبلغ أساس النسبة"
                            id={`award-base-${index}`}
                          >
                            <input
                              id={`award-base-${index}`}
                              required
                              inputMode="decimal"
                              className={controlClass}
                              value={item.basis_amount}
                              onChange={(e) =>
                                changeItem(index, {
                                  basis_amount: e.target.value,
                                })
                              }
                            />
                          </Field>
                        )}
                        <TaskPicker
                          employeeId={employeeId}
                          value={item.task_id}
                          onChange={(task_id) => changeItem(index, { task_id })}
                        />
                        <Field
                          label="مرجع الصفقة أو سبب الحافز"
                          id={`award-ref-${index}`}
                        >
                          <input
                            id={`award-ref-${index}`}
                            required={!item.task_id}
                            minLength={item.task_id ? 0 : 3}
                            maxLength={500}
                            className={controlClass}
                            value={item.reference}
                            onChange={(e) =>
                              changeItem(index, { reference: e.target.value })
                            }
                          />
                        </Field>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setForm({
                              ...form,
                              items: form.items.filter((_, i) => i !== index),
                            })
                          }
                        >
                          إزالة الحافز {index + 1}
                        </Button>
                      </fieldset>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={form.items.length >= 100}
                      onClick={() =>
                        setForm({
                          ...form,
                          items: [...form.items, emptyItem()],
                        })
                      }
                    >
                      إضافة حافز أو عمولة
                    </Button>
                    <section className="space-y-3 rounded-xl border p-4">
                      <h3 className="font-bold">الحسومات</h3>
                      {form.deductions.map((item, index) => (
                        <fieldset
                          key={index}
                          className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2"
                        >
                          <legend>حسم {index + 1}</legend>
                          <Field
                            label="نوع الحسم"
                            id={`deduction-kind-${index}`}
                          >
                            <select
                              id={`deduction-kind-${index}`}
                              className={controlClass}
                              value={item.kind}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  deductions: form.deductions.map((row, i) =>
                                    i === index
                                      ? {
                                          ...row,
                                          kind: e.target.value as
                                            | "insurance"
                                            | "other",
                                          title:
                                            e.target.value === "insurance"
                                              ? "التأمينات الاجتماعية"
                                              : "حسم آخر",
                                        }
                                      : row,
                                  ),
                                })
                              }
                            >
                              <option value="insurance">
                                التأمينات الاجتماعية
                              </option>
                              <option value="other">حسم آخر</option>
                            </select>
                          </Field>
                          <Field
                            label="اسم الحسم"
                            id={`deduction-title-${index}`}
                          >
                            <input
                              id={`deduction-title-${index}`}
                              required
                              minLength={3}
                              maxLength={150}
                              className={controlClass}
                              value={item.title}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  deductions: form.deductions.map((row, i) =>
                                    i === index
                                      ? { ...row, title: e.target.value }
                                      : row,
                                  ),
                                })
                              }
                            />
                          </Field>
                          <Field
                            label="مبلغ الحسم"
                            id={`deduction-amount-${index}`}
                          >
                            <input
                              id={`deduction-amount-${index}`}
                              required
                              inputMode="decimal"
                              className={controlClass}
                              value={item.amount}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  deductions: form.deductions.map((row, i) =>
                                    i === index
                                      ? { ...row, amount: e.target.value }
                                      : row,
                                  ),
                                })
                              }
                            />
                          </Field>
                          <Field
                            label="مرجع الحسم"
                            id={`deduction-reference-${index}`}
                          >
                            <input
                              id={`deduction-reference-${index}`}
                              required
                              minLength={3}
                              maxLength={500}
                              className={controlClass}
                              value={item.reference}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  deductions: form.deductions.map((row, i) =>
                                    i === index
                                      ? { ...row, reference: e.target.value }
                                      : row,
                                  ),
                                })
                              }
                            />
                          </Field>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setForm({
                                ...form,
                                deductions: form.deductions.filter(
                                  (_, i) => i !== index,
                                ),
                              })
                            }
                          >
                            حذف الحسم
                          </Button>
                        </fieldset>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        disabled={form.deductions.length >= 100}
                        onClick={() =>
                          setForm({
                            ...form,
                            deductions: [
                              ...form.deductions,
                              {
                                title: "التأمينات الاجتماعية",
                                kind: "insurance",
                                amount: "",
                                reference: "",
                              },
                            ],
                          })
                        }
                      >
                        إضافة حسم
                      </Button>
                    </section>
                    <Field label="ملاحظات كشف الشهر" id="payroll-notes">
                      <textarea
                        id="payroll-notes"
                        className={controlClass}
                        value={form.notes}
                        maxLength={2000}
                        onChange={(e) =>
                          setForm({ ...form, notes: e.target.value })
                        }
                      />
                    </Field>
                    <Field
                      label="سبب إعداد أو تعديل الكشف"
                      id="payroll-save-reason"
                    >
                      <input
                        id="payroll-save-reason"
                        required
                        minLength={3}
                        maxLength={2000}
                        className={controlClass}
                        value={form.reason}
                        onChange={(e) =>
                          setForm({ ...form, reason: e.target.value })
                        }
                      />
                    </Field>
                    <p className="font-bold">
                      معاينة الصافي:{" "}
                      {preview === null
                        ? "تحقق من مبالغ البنود"
                        : money(preview)}
                    </p>
                    <Notice message={error} error />
                    <div className="flex gap-3">
                      <Button type="submit" loading={busy}>
                        حفظ المتوقع وإظهاره للموظفة
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            JSON.stringify(form) === original ||
                            (await confirm("تجاهل تعديل كشف الشهر؟"))
                          )
                            setEditing(false);
                        }}
                      >
                        إلغاء التعديل
                      </Button>
                    </div>
                  </form>
                )}
                {admin &&
                  statement &&
                  !editing &&
                  statement.status !== "paid" && (
                    <div className="my-5 space-y-3 rounded-xl border p-4">
                      <Field
                        label="سبب الاعتماد أو إعادة الفتح أو توثيق الصرف"
                        id="payroll-action-reason"
                      >
                        <input
                          id="payroll-action-reason"
                          className={controlClass}
                          value={reason}
                          maxLength={2000}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </Field>
                      {statement.status === "draft" ? (
                        <Button
                          loading={busy}
                          disabled={reason.trim().length < 3}
                          onClick={() => {
                            id.current = statement.id;
                            void send("approve", { reason });
                          }}
                        >
                          اعتماد مستحقات الشهر
                        </Button>
                      ) : (
                        <>
                          {Number(statement.paid_amount) === 0 && (
                            <Button
                              variant="outline"
                              disabled={busy || reason.trim().length < 3}
                              onClick={() => {
                                id.current = statement.id;
                                void send("reopen", { reason });
                              }}
                            >
                              إعادة فتح الكشف للتعديل
                            </Button>
                          )}
                          <Field label="مبلغ صُرف فعليًا" id="payroll-payment">
                            <input
                              id="payroll-payment"
                              className={controlClass}
                              inputMode="decimal"
                              value={payment}
                              onChange={(e) => setPayment(e.target.value)}
                            />
                          </Field>
                          <Field
                            label="مرجع الصرف الفعلي"
                            id="payroll-payment-reference"
                          >
                            <input
                              id="payroll-payment-reference"
                              className={controlClass}
                              maxLength={500}
                              value={reference}
                              onChange={(e) => setReference(e.target.value)}
                            />
                          </Field>

                          <Button
                            loading={busy}
                            disabled={
                              !payment ||
                              reference.trim().length < 3 ||
                              reason.trim().length < 3
                            }
                            onClick={() => {
                              id.current = statement.id;
                              void send("pay", {
                                reason,
                                amount: payment,
                                reference,
                              });
                            }}
                          >
                            توثيق الصرف الفعلي
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                {data.payments.length > 0 && (
                  <section className="my-5 space-y-3">
                    <h3 className="font-bold">
                      دفعات موثقة — آخر20 من {data.payments_count}
                    </h3>
                    {data.payments.map((row) => (
                      <p key={row.id} className="rounded-xl border p-3 text-sm">
                        {money(row.amount)} · {row.reference} ·{" "}
                        {workDate(row.created_at)}
                      </p>
                    ))}
                  </section>
                )}
                {data.events.length > 0 && (
                  <details className="my-5 rounded-xl border p-4">
                    <summary className="cursor-pointer font-bold">
                      سجل الكشف — آخر20 من {data.events_count}
                    </summary>
                    {data.events.map((row) => (
                      <p key={row.id} className="my-2 text-sm leading-7">
                        {payrollAction[
                          row.action as keyof typeof payrollAction
                        ] ?? row.action}{" "}
                        · {row.reason} · {workDate(row.created_at)}
                      </p>
                    ))}
                  </details>
                )}
              </>
            )}
          </>
        )
      )}
    </Panel>
  );
}

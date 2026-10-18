"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import {
  COMMISSION_BASES,
  compensationInput,
  fixedCompensation,
  type CompensationData,
  type CompensationInput,
  type CompensationVersion,
} from "@/lib/workforce/compensation";
import {
  api,
  controlClass,
  Field,
  formatDate,
  Notice,
  Panel,
  useConfirm,
} from "./shared";
import DateInput from "./DateInput";

const money = (value: string) =>
  `${Number(value).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
function Terms({ value }: { value: CompensationVersion }) {
  return (
    <div className="space-y-4 text-sm">
      <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
        <div>
          <dt className="text-muted">الراتب الأساسي الشهري</dt>
          <dd className="mt-1 text-lg font-bold">
            {money(value.basic_salary)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">الإجمالي الثابت الشهري</dt>
          <dd className="mt-1 text-lg font-bold">
            {money(fixedCompensation(value))}
          </dd>
          <p className="mt-1 text-xs text-muted">
            الأساسي والبدلات، قبل الخصومات والمتغيرات.
          </p>
        </div>
      </dl>
      <div>
        <h4 className="font-bold">البدلات الشهرية</h4>
        {value.allowances.length ? (
          <ul className="mt-2 space-y-2">
            {value.allowances.map((item, index) => (
              <li
                key={index}
                className="flex flex-wrap justify-between gap-2 rounded-lg border border-border p-3"
              >
                <span className="break-words">{item.name}</span>
                <span className="font-bold">{money(item.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-muted">لا توجد بدلات مسجلة.</p>
        )}
      </div>
      <div>
        <h4 className="font-bold">بنود العمولة</h4>
        {value.commissions.length ? (
          <ul className="mt-2 space-y-2">
            {value.commissions.map((item, index) => (
              <li
                key={index}
                className="space-y-1 rounded-lg border border-border p-3"
              >
                <p className="break-words font-bold">
                  {item.name} ·{" "}
                  {item.mode === "percent"
                    ? `${item.value}٪`
                    : money(item.value)}
                </p>
                <p>أساس الحساب: {COMMISSION_BASES[item.basis]}</p>
                <p className="whitespace-pre-wrap break-words text-muted">
                  {item.conditions || "لم تسجل شروط إضافية."}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-muted">لا توجد بنود عمولة مسجلة.</p>
        )}
      </div>
      <p className="text-xs leading-6 text-muted">
        هذه إعدادات الاستحقاق الوظيفي. العمولة المسجلة هنا لا تعني مبلغًا
        مكتسبًا أو مصروفًا؛ تظهر العمليات الفعلية بعد احتسابها واعتمادها في
        موديول العمولات والرواتب.
      </p>
    </div>
  );
}

export default function CompensationPanel({
  employeeId,
  startDate,
  admin,
  onDirtyChange,
  onSaved,
}: {
  employeeId: string;
  startDate: string;
  admin: boolean;
  onDirtyChange: (value: boolean) => void;
  onSaved?: () => void;
}) {
  const [data, setData] = useState<CompensationData | null>(null);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CompensationInput | null>(null);
  const [original, setOriginal] = useState("");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const savingRef = useRef(false);
  const retry = useRef({ serialized: "", key: "" });
  const { confirm, confirmation } = useConfirm();
  const dirty = editing && !!form && JSON.stringify(form) !== original;
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await api<CompensationData>(
        `/api/workforce/employees/${employeeId}/compensation?page=${page}`,
        { signal },
      );
      return result;
    },
    [employeeId, page],
  );
  useEffect(() => {
    const abort = new AbortController();
    load(abort.signal)
      .then((result) => {
        setData(result);
        setError("");
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => abort.abort();
  }, [load, reload]);
  const begin = () => {
    if (!data) return;
    const latest = data.latest;
    const initial: CompensationInput = {
      basic_salary: latest?.basic_salary ?? "",
      effective_from: [
        data.companyDate,
        startDate,
        latest?.effective_from ?? "",
      ]
        .sort()
        .at(-1)!,
      allowances: latest?.allowances ?? [],
      commissions: latest?.commissions ?? [],
      reason: latest ? "" : "إعداد المستحقات الأولية",
    };
    setForm(initial);
    setOriginal(JSON.stringify(initial));
    setRevision(latest?.revision ?? 0);
    setEditing(true);
    setError("");
    setMessage("");
    retry.current = { serialized: "", key: "" };
  };
  const cancel = async () => {
    if (
      dirty &&
      !(await confirm(
        "تجاهل التعديلات غير المحفوظة على الراتب والبدلات والعمولات؟",
      ))
    )
      return;
    setEditing(false);
    onDirtyChange(false);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || savingRef.current) return;
    setError("");
    setMessage("");
    let payload: CompensationInput;
    try {
      payload = compensationInput(form);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const serialized = JSON.stringify({ revision, payload });
      if (retry.current.serialized !== serialized)
        retry.current = { serialized, key: crypto.randomUUID() };
      await api(`/api/workforce/employees/${employeeId}/compensation`, {
        method: "POST",
        body: JSON.stringify({
          revision,
          payload,
          request_key: retry.current.key,
        }),
      });
      setEditing(false);
      onDirtyChange(false);
      setMessage(
        "تم حفظ إعدادات المستحقات وإظهارها في ملف الموظف، مع الاحتفاظ بالنسخ السابقة.",
      );
      setData(await load());
      onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const update = (patch: Partial<CompensationInput>) =>
    setForm((value) => (value ? { ...value, ...patch } : value));
  return (
    <Panel
      title="الراتب والبدلات والعمولات"
      description={
        admin
          ? "حدد البنود المتفق عليها وتاريخ سريانها. كل تعديل ينشئ نسخة جديدة ولا يغير كشوفًا أو عمليات مالية سابقة."
          : "إعدادات مستحقاتك الوظيفية كما سجلها مدير النظام، مع تفاصيل البدلات وبنود العمولة."
      }
    >
      {confirmation}
      <div className="space-y-5">
        <Notice message={error} error />
        <Notice message={message} />
        {error && (
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => {
              setLoading(true);
              setReload((n) => n + 1);
            }}
          >
            تحديث إعدادات المستحقات
          </Button>
        )}
        {loading && <p role="status">جارٍ تحميل إعدادات المستحقات…</p>}
        {data && (
          <>
            {data.current ? (
              <div>
                <p className="mb-3 text-sm font-bold">
                  الإعداد الساري من {formatDate(data.current.effective_from)}
                </p>
                <Terms value={data.current} />
              </div>
            ) : (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted">
                لم تسجل إعدادات راتب سارية بعد. لا يعني ذلك أن الراتب صفر.
              </p>
            )}
            {data.latest && data.latest.effective_from > data.companyDate && (
              <details className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <summary className="cursor-pointer font-bold">
                  إعداد مجدول يبدأ {formatDate(data.latest.effective_from)}
                </summary>
                <div className="mt-4">
                  <Terms value={data.latest} />
                </div>
              </details>
            )}
            {admin && !editing && (
              <Button type="button" onClick={begin}>
                {data.latest
                  ? "تعديل الراتب والبدلات والعمولات"
                  : "إعداد الراتب والبدلات والعمولات"}
              </Button>
            )}
          </>
        )}
        {admin && editing && form && (
          <form
            onSubmit={save}
            className="space-y-5 rounded-xl border border-border p-4"
            aria-label="إعداد المستحقات الوظيفية"
          >
            <fieldset disabled={saving} className="space-y-5">
              <legend className="mb-4 font-bold">
                إعداد المستحقات الوظيفية
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="الراتب الأساسي الشهري — ر.س" id="comp-basic">
                  <input
                    id="comp-basic"
                    required
                    inputMode="decimal"
                    dir="ltr"
                    className={controlClass}
                    value={form.basic_salary}
                    onChange={(e) => update({ basic_salary: e.target.value })}
                    placeholder="مثال: 8000.00"
                  />
                </Field>
                <DateInput
                  id="comp-effective"
                  label="تاريخ سريان الإعداد"
                  required
                  value={form.effective_from}
                  onChange={(value) => update({ effective_from: value })}
                />
              </div>
              <p className="text-xs text-muted">
                لا يمكن أن يسبق تاريخ السريان تاريخ الانضمام أو آخر إعداد محفوظ.
                للتصحيح في التاريخ نفسه احفظ نسخة جديدة مع السبب.
              </p>
              <div className="space-y-3">
                <h4 className="font-bold">البدلات الشهرية</h4>
                {form.allowances.map((item, index) => (
                  <fieldset
                    key={index}
                    className="space-y-3 rounded-xl bg-slate-50 p-3"
                  >
                    <legend className="font-bold">بدل {index + 1}</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field
                        label={`اسم البدل ${index + 1}`}
                        id={`allowance-name-${index}`}
                      >
                        <input
                          id={`allowance-name-${index}`}
                          required
                          maxLength={150}
                          className={controlClass}
                          value={item.name}
                          onChange={(e) =>
                            update({
                              allowances: form.allowances.map((row, i) =>
                                i === index
                                  ? { ...row, name: e.target.value }
                                  : row,
                              ),
                            })
                          }
                          placeholder="سكن، نقل، اتصال…"
                        />
                      </Field>
                      <Field
                        label={`مبلغ البدل ${index + 1} — ر.س`}
                        id={`allowance-amount-${index}`}
                      >
                        <input
                          id={`allowance-amount-${index}`}
                          required
                          inputMode="decimal"
                          dir="ltr"
                          className={controlClass}
                          value={item.amount}
                          onChange={(e) =>
                            update({
                              allowances: form.allowances.map((row, i) =>
                                i === index
                                  ? { ...row, amount: e.target.value }
                                  : row,
                              ),
                            })
                          }
                        />
                      </Field>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        update({
                          allowances: form.allowances.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      إزالة البدل {index + 1}
                    </Button>
                  </fieldset>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  disabled={form.allowances.length >= 30}
                  onClick={() =>
                    update({
                      allowances: [
                        ...form.allowances,
                        { name: "", amount: "" },
                      ],
                    })
                  }
                >
                  إضافة بدل
                </Button>
              </div>
              <div className="space-y-3">
                <h4 className="font-bold">بنود العمولة</h4>
                {form.commissions.map((item, index) => {
                  const change = (patch: Partial<typeof item>) =>
                    update({
                      commissions: form.commissions.map((row, i) =>
                        i === index ? { ...row, ...patch } : row,
                      ),
                    });
                  return (
                    <fieldset
                      key={index}
                      className="space-y-3 rounded-xl bg-slate-50 p-3"
                    >
                      <legend className="font-bold">عمولة {index + 1}</legend>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label={`اسم العمولة ${index + 1}`}
                          id={`commission-name-${index}`}
                        >
                          <input
                            id={`commission-name-${index}`}
                            required
                            maxLength={150}
                            className={controlClass}
                            value={item.name}
                            onChange={(e) => change({ name: e.target.value })}
                          />
                        </Field>
                        <Field
                          label={`طريقة العمولة ${index + 1}`}
                          id={`commission-mode-${index}`}
                        >
                          <select
                            id={`commission-mode-${index}`}
                            className={controlClass}
                            value={item.mode}
                            onChange={(e) =>
                              change({
                                mode: e.target.value as typeof item.mode,
                              })
                            }
                          >
                            <option value="percent">نسبة مئوية</option>
                            <option value="fixed">مبلغ ثابت</option>
                          </select>
                        </Field>
                        <Field
                          label={`قيمة العمولة ${index + 1}${item.mode === "percent" ? " — %" : " — ر.س"}`}
                          id={`commission-value-${index}`}
                        >
                          <input
                            id={`commission-value-${index}`}
                            required
                            inputMode="decimal"
                            dir="ltr"
                            className={controlClass}
                            value={item.value}
                            onChange={(e) => change({ value: e.target.value })}
                          />
                        </Field>
                        <Field
                          label={`أساس العمولة ${index + 1}`}
                          id={`commission-basis-${index}`}
                        >
                          <select
                            id={`commission-basis-${index}`}
                            className={controlClass}
                            value={item.basis}
                            onChange={(e) =>
                              change({
                                basis: e.target.value as typeof item.basis,
                              })
                            }
                          >
                            {Object.entries(COMMISSION_BASES).map(
                              ([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </Field>
                      </div>
                      <Field
                        label={`شروط استحقاق العمولة ${index + 1}`}
                        id={`commission-conditions-${index}`}
                      >
                        <textarea
                          id={`commission-conditions-${index}`}
                          required={item.basis === "custom"}
                          maxLength={2000}
                          rows={2}
                          className={controlClass}
                          value={item.conditions}
                          onChange={(e) =>
                            change({ conditions: e.target.value })
                          }
                          placeholder="مثل: بعد تحصيل كامل الفاتورة واعتماد المدير، مع توضيح التعامل مع الإلغاء."
                        />
                      </Field>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          update({
                            commissions: form.commissions.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                      >
                        إزالة العمولة {index + 1}
                      </Button>
                    </fieldset>
                  );
                })}
                <Button
                  type="button"
                  variant="outline"
                  disabled={form.commissions.length >= 30}
                  onClick={() =>
                    update({
                      commissions: [
                        ...form.commissions,
                        {
                          name: "",
                          mode: "percent",
                          value: "",
                          basis: "custom",
                          conditions: "",
                        },
                      ],
                    })
                  }
                >
                  إضافة بند عمولة
                </Button>
              </div>
              <Field label="سبب الإعداد أو التعديل" id="comp-reason">
                <textarea
                  id="comp-reason"
                  required
                  minLength={3}
                  maxLength={2000}
                  className={controlClass}
                  value={form.reason}
                  onChange={(e) => update({ reason: e.target.value })}
                  rows={2}
                />
              </Field>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" loading={saving}>
                  حفظ إعدادات المستحقات
                </Button>
                <Button type="button" variant="outline" onClick={cancel}>
                  إلغاء التعديل
                </Button>
              </div>
            </fieldset>
          </form>
        )}
        {data && data.history.length > 0 && (
          <details className="border-t border-border pt-4">
            <summary className="cursor-pointer text-sm font-bold">
              سجل إعدادات المستحقات ({data.count})
            </summary>
            <div className="mt-4 space-y-3">
              {data.history.map((version) => (
                <details
                  key={version.id}
                  className="rounded-xl border border-border p-3"
                >
                  <summary className="cursor-pointer text-sm">
                    نسخة {version.revision} · تسري من{" "}
                    {formatDate(version.effective_from)}
                    {version.id === data.current?.id ? " · السارية الآن" : ""}
                  </summary>
                  <div className="mt-4 space-y-3">
                    <p className="whitespace-pre-wrap break-words text-sm">
                      السبب: {version.reason}
                    </p>
                    <Terms value={version} />
                  </div>
                </details>
              ))}
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={page === 1 || loading}
                  onClick={() => {
                    setLoading(true);
                    setPage((p) => p - 1);
                  }}
                >
                  السابق
                </Button>
                <span className="text-sm">صفحة {page}</span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={page * 20 >= data.count || loading}
                  onClick={() => {
                    setLoading(true);
                    setPage((p) => p + 1);
                  }}
                >
                  التالي
                </Button>
              </div>
            </div>
          </details>
        )}
      </div>
    </Panel>
  );
}

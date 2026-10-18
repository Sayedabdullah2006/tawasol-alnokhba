"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import {
  CONTRACT_LABELS,
  FIELD_LABELS,
  STATUS_LABELS,
  type EmployeeDetail,
  type InternalRole,
} from "@/lib/workforce/types";
import EmployeeFields, {
  emptyEmployeeForm,
  type EmployeeForm,
} from "./EmployeeFields";
import DateInput from "./DateInput";
import CompensationPanel from "./CompensationPanel";
import {
  api,
  controlClass,
  Field,
  formatDate,
  Notice,
  Panel,
  useConfirm,
  useUnsavedChanges,
} from "./shared";

const changeStatus = {
  pending: "بانتظار القرار",
  approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغى",
};
export default function EmployeeProfile({
  id,
  role,
  section = "profile",
}: {
  id: string;
  role: InternalRole;
  section?:
    | "profile"
    | "documents"
    | "requests"
    | "payment-details"
    | "compensation"
    | "job-description"
    | "contract";
}) {
  const [data, setData] = useState<EmployeeDetail | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyEmployeeForm);
  const [original, setOriginal] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [reload, setReload] = useState(0);
  const [changeField, setChangeField] = useState("full_name");
  const [changeValue, setChangeValue] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const [status, setStatus] = useState("suspended");
  const [statusReason, setStatusReason] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [fileSelected, setFileSelected] = useState(false);
  const [compensationDirty, setCompensationDirty] = useState(false);
  const [documentExpiry, setDocumentExpiry] = useState("");
  const documentKey = useRef("");
  const admin = role === "admin";
  const sectionLabel = {
    profile: "ملفي الوظيفي",
    documents: "مستنداتي",
    requests: "طلبات تعديل البيانات",
    "payment-details": "بيانات الصرف",
    compensation: "الراتب والبدلات المتفق عليها",
    "job-description": "الوصف الوظيفي",
    contract: "بيانات العقد",
  }[section];
  const dirty =
    !!data &&
    (JSON.stringify(form) !== original ||
      (admin && notes !== (data.notes ?? "")) ||
      !!changeValue ||
      !!changeReason ||
      !!documentTitle ||
      !!documentExpiry ||
      fileSelected ||
      compensationDirty);
  const unsavedPrompt = useUnsavedChanges(dirty);
  const { confirm, confirmation } = useConfirm();
  const applyData = useCallback((result: EmployeeDetail) => {
    setData(result);
    const next = {
      ...emptyEmployeeForm,
      ...result.employee,
      department_id: result.employee.department_id ?? "",
      contract_end: result.employee.contract_end ?? "",
      birth_date: result.employee.birth_date ?? "",
    };
    setForm(next);
    setOriginal(JSON.stringify(next));
    setNotes(result.notes ?? "");
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    api<EmployeeDetail>(`/api/workforce/employees/${id}`, {
      signal: abort.signal,
    })
      .then(applyData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [id, reload, applyData]);
  const execute = async (
    key: string,
    action: () => Promise<unknown>,
    success: string,
    after?: () => void,
  ) => {
    if (busy) return;
    const otherDraft =
      (key !== "profile" && JSON.stringify(form) !== original) ||
      (admin && key !== "notes" && notes !== (data?.notes ?? ""));
    if (
      otherDraft &&
      !(await confirm(
        "يوجد تعديل غير محفوظ في قسم آخر. المتابعة ستعيد تحميل الملف وتتجاهله. هل تريد المتابعة؟",
      ))
    )
      return;
    setBusy(key);
    setError("");
    setMessage("");
    try {
      await action();
      after?.();
      applyData(await api<EmployeeDetail>(`/api/workforce/employees/${id}`));
      setMessage(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const patch = (body: Record<string, unknown>) =>
    api(`/api/workforce/employees/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...body, version: data?.employee.version }),
    });
  const moreRecords = async (kind: "documents" | "changes" | "events") => {
    const cursorKey = `${kind}Cursor` as const;
    const cursor = data?.[cursorKey];
    if (busy || !cursor) return;
    setBusy(`${kind}-more`);
    setError("");
    try {
      const result = await api<{
        rows:
          | EmployeeDetail["documents"]
          | EmployeeDetail["changes"]
          | NonNullable<EmployeeDetail["events"]>;
        nextCursor: string | null;
      }>(
        `/api/workforce/employees/${id}/records?kind=${kind}&cursor=${encodeURIComponent(cursor)}`,
      );
      setData((current) => {
        if (!current) return current;
        const records = [...(current[kind] ?? []), ...result.rows];
        const unique = [
          ...new Map(records.map((row) => [row.id, row])).values(),
        ];
        return { ...current, [kind]: unique, [cursorKey]: result.nextCursor };
      });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy("");
    }
  };
  const olderRecordsButton = (
    kind: "documents" | "changes" | "events",
    label: string,
  ) =>
    data?.[`${kind}Cursor`] ? (
      <Button
        className="mt-4"
        variant="outline"
        disabled={!!busy}
        loading={busy === `${kind}-more`}
        onClick={() => moreRecords(kind)}
      >
        {label}
      </Button>
    ) : null;
  if (!data)
    return (
      <div className="p-6">
        <Notice message={error} error />
        {error ? (
          <Button onClick={() => setReload((v) => v + 1)}>
            إعادة المحاولة
          </Button>
        ) : (
          <p role="status">جارٍ تحميل الملف الوظيفي…</p>
        )}
      </div>
    );
  const employee = data.employee;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      {unsavedPrompt}
      {confirmation}
      {admin && (
        <Link
          className="text-sm font-bold text-green"
          href="/admin/workforce/employees"
        >
          → جميع الموظفين
        </Link>
      )}
      <div className="rounded-2xl bg-dark p-6 text-white md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="break-words text-3xl font-black">
              {admin || section === "profile"
                ? employee.full_name
                : sectionLabel}
            </h1>
            <p className="mt-3 text-sm leading-7 text-white/80">
              {employee.job_title || "—"} ·{" "}
              {data.departments.find((d) => d.id === employee.department_id)
                ?.name || "دون قسم"}
            </p>
          </div>
          <span className="rounded-full border border-white/30 px-3 py-1 text-sm">
            {STATUS_LABELS[employee.status]}
          </span>
        </div>
        {admin && (
          <dl className="mt-6 grid gap-4 border-t border-white/20 pt-5 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-white/60">نوع التعاقد</dt>
              <dd className="mt-1">
                {CONTRACT_LABELS[employee.contract_type]}
              </dd>
            </div>
            <div>
              <dt className="text-white/60">تاريخ الانضمام</dt>
              <dd className="mt-1">{formatDate(employee.start_date)}</dd>
            </div>
            <div>
              <dt className="text-white/60">بريد تسجيل الدخول</dt>
              <dd dir="ltr" className="mt-1 break-all text-right">
                {employee.email}
              </dd>
            </div>
          </dl>
        )}
      </div>
      <div aria-live="polite" className="space-y-3">
        <Notice message={error} error />
        <Notice message={message} />
      </div>
      <div
        className={
          admin
            ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
            : "space-y-6"
        }
      >
        <div className="space-y-6">
          {!admin && section === "job-description" && (
            <Panel title="الوصف الوظيفي">
              <p className="whitespace-pre-wrap break-words text-sm leading-7">
                {employee.responsibilities || "—"}
              </p>
            </Panel>
          )}
          {!admin && section === "contract" && (
            <Panel title="بيانات العقد">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                {[
                  ["نوع التعاقد", CONTRACT_LABELS[employee.contract_type]],
                  ["تاريخ المباشرة", formatDate(employee.start_date)],
                  [
                    "انتهاء العقد",
                    employee.contract_end
                      ? formatDate(employee.contract_end)
                      : "—",
                  ],
                  ["المسمى الوظيفي", employee.job_title],
                  [
                    "القسم",
                    data.departments.find(
                      (d) => d.id === employee.department_id,
                    )?.name || "—",
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted">{label}</dt>
                    <dd className="mt-1 font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          )}
          {!admin && section === "profile" && (
            <Panel title="البيانات الشخصية">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                {[
                  ["الاسم", employee.full_name],
                  ["بريد تسجيل الدخول", employee.email],
                  ["الهوية أو الإقامة", employee.national_id || "—"],
                  [
                    "تاريخ الميلاد",
                    employee.birth_date ? formatDate(employee.birth_date) : "—",
                  ],
                  ["المؤهل والتخصص", employee.qualification || "—"],
                  ["العنوان الوطني", employee.national_address || "—"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted">{label}</dt>
                    <dd className="mt-1 break-words font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          )}
          {(admin || section === "profile") && (
            <Panel
              title={admin ? "البيانات الوظيفية والتواصل" : "بيانات التواصل"}
            >
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  execute(
                    "profile",
                    () =>
                      patch(
                        admin
                          ? { action: "profile", ...form }
                          : {
                              action: "profile",
                              phone: form.phone,
                              city: form.city,
                            },
                      ),
                    "تم حفظ بيانات الملف",
                  );
                }}
              >
                <EmployeeFields
                  value={form}
                  onChange={setForm}
                  departments={data.departments}
                  employee={!admin}
                />
                <Button
                  type="submit"
                  loading={busy === "profile"}
                  disabled={!!busy || JSON.stringify(form) === original}
                >
                  حفظ البيانات
                </Button>
              </form>
            </Panel>
          )}
          {(admin || section === "compensation") && (
            <CompensationPanel
              employeeId={id}
              startDate={employee.start_date}
              admin={admin}
              onDirtyChange={setCompensationDirty}
            />
          )}
          {(admin || section === "documents") && (
            <Panel title="المستندات">
              <div className="space-y-3">
                {data.documents.length ? (
                  data.documents.map((document) => (
                    <div
                      key={document.id}
                      className="rounded-xl border border-slate-200 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <a
                          href={`/api/workforce/documents/${document.id}`}
                          className="break-words font-bold text-green underline"
                          download
                        >
                          {document.title}
                        </a>
                        {admin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!!busy}
                            onClick={() =>
                              execute(
                                "document-status",
                                () =>
                                  api(
                                    `/api/workforce/documents/${document.id}`,
                                    {
                                      method: "PATCH",
                                      body: JSON.stringify({
                                        archived: !document.archived_at,
                                      }),
                                    },
                                  ),
                                document.archived_at
                                  ? "تمت استعادة المستند"
                                  : "تمت أرشفة المستند",
                              )
                            }
                          >
                            {document.archived_at ? "استعادة" : "أرشفة"}
                          </Button>
                        )}
                      </div>
                      <p className="mt-2 text-xs leading-6 text-muted">
                        {Math.ceil(document.size_bytes / 1024)} كيلوبايت ·{" "}
                        {document.employee_visible
                          ? "مشترك مع الموظف"
                          : "خاص بالإدارة"}
                        {document.archived_at ? " · مؤرشف" : ""}
                        {document.expires_on
                          ? ` · ينتهي ${formatDate(document.expires_on)}`
                          : ""}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted">لم تُضف مستندات بعد.</p>
                )}
                {olderRecordsButton("documents", "عرض مستندات أقدم")}
              </div>
              <details className="mt-5 border-t border-border pt-4">
                <summary className="cursor-pointer text-sm font-bold">
                  إضافة مستند
                </summary>
                <form
                  className="mt-4 space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const node = event.currentTarget;
                    const formData = new FormData(node);
                    formData.set("employee_id", id);
                    if (!documentKey.current)
                      documentKey.current = crypto.randomUUID();
                    formData.set("request_key", documentKey.current);
                    execute(
                      "upload",
                      () =>
                        api("/api/workforce/documents", {
                          method: "POST",
                          body: formData,
                        }),
                      "تم حفظ المستند",
                      () => {
                        node.reset();
                        setDocumentTitle("");
                        setFileSelected(false);
                        setDocumentExpiry("");
                        documentKey.current = "";
                      },
                    );
                  }}
                >
                  <Field label="عنوان المستند" id="document-title">
                    <input
                      id="document-title"
                      name="title"
                      className={controlClass}
                      required
                      maxLength={150}
                      value={documentTitle}
                      onChange={(e) => setDocumentTitle(e.target.value)}
                    />
                  </Field>
                  <Field
                    label="الملف — PDF أو PNG أو JPEG، حتى 10 ميجابايت"
                    id="document-file"
                  >
                    <input
                      id="document-file"
                      name="file"
                      type="file"
                      required
                      accept="application/pdf,image/png,image/jpeg"
                      className={controlClass}
                      onChange={(e) =>
                        setFileSelected(!!e.target.files?.length)
                      }
                    />
                  </Field>
                  <DateInput
                    label="تاريخ الانتهاء — اختياري"
                    id="document-expiry"
                    name="expires_on"
                    value={documentExpiry}
                    onChange={setDocumentExpiry}
                  />
                  {admin && (
                    <Field label="من يمكنه الاطلاع؟" id="document-visibility">
                      <select
                        id="document-visibility"
                        name="employee_visible"
                        className={controlClass}
                      >
                        <option value="true">المدير والموظف</option>
                        <option value="false">مدير النظام فقط</option>
                      </select>
                    </Field>
                  )}
                  <Button
                    type="submit"
                    loading={busy === "upload"}
                    disabled={!!busy}
                  >
                    رفع المستند
                  </Button>
                </form>
              </details>
            </Panel>
          )}
        </div>
        <div className="space-y-6">
          {(admin || section === "payment-details") && (
            <Panel title="بيانات الصرف">
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-muted">البنك</dt>
                  <dd className="mt-1">{data.bank?.bank_name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted">الآيبان</dt>
                  <dd className="mt-1 break-all" dir="ltr">
                    {data.bank?.iban || "—"}
                  </dd>
                </div>
              </dl>
              {!admin && (
                <Link
                  href="/employee/requests/profile-change"
                  className="mt-5 inline-block text-sm font-bold text-green"
                >
                  طلب تعديل بيانات الصرف ←
                </Link>
              )}
            </Panel>
          )}
          {!admin && section === "requests" && (
            <Panel title="طلب تغيير بيانات حساسة">
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const key = requestKey || crypto.randomUUID();
                  setRequestKey(key);
                  execute(
                    "change",
                    () =>
                      api("/api/workforce/profile-changes", {
                        method: "POST",
                        body: JSON.stringify({
                          field: changeField,
                          proposed_value: changeValue,
                          reason: changeReason,
                          request_key: key,
                        }),
                      }),
                    "تم إرسال الطلب إلى مدير النظام",
                    () => {
                      setChangeValue("");
                      setChangeReason("");
                      setRequestKey("");
                    },
                  );
                }}
              >
                <Field label="البيان المطلوب تغييره" id="change-field">
                  <select
                    id="change-field"
                    className={controlClass}
                    value={changeField}
                    onChange={(event) => {
                      setChangeField(event.target.value);
                      setChangeValue("");
                      setRequestKey("");
                    }}
                  >
                    {Object.entries(FIELD_LABELS).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="القيمة الجديدة" id="change-value">
                  <input
                    id="change-value"
                    className={controlClass}
                    required
                    minLength={2}
                    maxLength={150}
                    value={changeValue}
                    onChange={(event) => setChangeValue(event.target.value)}
                    dir={changeField === "iban" ? "ltr" : undefined}
                  />
                </Field>
                <Field label="سبب التغيير" id="change-reason">
                  <textarea
                    id="change-reason"
                    className={controlClass}
                    required
                    minLength={3}
                    maxLength={2000}
                    value={changeReason}
                    onChange={(event) => setChangeReason(event.target.value)}
                  />
                </Field>
                <Button
                  type="submit"
                  disabled={!!busy}
                  loading={busy === "change"}
                >
                  إرسال طلب التغيير
                </Button>
              </form>
            </Panel>
          )}
          {(admin || section === "requests") && (
            <Panel title="سجل طلبات التغيير">
              <div className="space-y-3">
                {data.changes.length ? (
                  data.changes.map((change) => (
                    <div
                      className="rounded-xl border border-border p-3 text-sm"
                      key={change.id}
                    >
                      <div className="flex justify-between gap-2">
                        <strong>{FIELD_LABELS[change.field]}</strong>
                        <span>{changeStatus[change.status]}</span>
                      </div>
                      <p className="mt-2 break-all">{change.proposed_value}</p>
                      <p className="mt-2 text-muted">{change.reason}</p>
                      {change.decision_reason && (
                        <p className="mt-2">
                          قرار الإدارة: {change.decision_reason}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-muted">
                        {formatDate(change.created_at)}
                      </p>
                      {admin && change.status === "pending" && (
                        <Link
                          href="/admin/workforce/approvals"
                          className="mt-2 inline-block font-bold text-green"
                        >
                          مراجعة الطلب ←
                        </Link>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted">لا توجد طلبات تغيير.</p>
                )}
                {olderRecordsButton("changes", "عرض طلبات أقدم")}
              </div>
            </Panel>
          )}
        </div>
      </div>
      {admin && (
        <>
          <Panel title="ملاحظات إدارية خاصة">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                execute(
                  "notes",
                  () => patch({ action: "notes", notes }),
                  "تم حفظ الملاحظات الخاصة",
                );
              }}
              className="space-y-4"
            >
              <Field label="الملاحظات" id="admin-notes">
                <textarea
                  id="admin-notes"
                  className={controlClass}
                  rows={4}
                  maxLength={10000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>
              <Button
                type="submit"
                variant="outline"
                disabled={!!busy || notes === (data.notes ?? "")}
                loading={busy === "notes"}
              >
                حفظ الملاحظات
              </Button>
            </form>
          </Panel>
          <details className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
            <summary className="cursor-pointer font-bold text-amber-950">
              حالة الحساب وسجل التغييرات
            </summary>
            <p className="mt-3 text-sm leading-7">
              الحالة الحالية: {STATUS_LABELS[employee.status]}. التعليق أو إنهاء
              العلاقة يمنع الوصول إلى بوابة الموظف ويحافظ على سجلاته.
            </p>
            {employee.status_reason && (
              <p className="mt-2 text-sm">
                السبب المسجل: {employee.status_reason}
              </p>
            )}
            <form
              className="mt-4 grid items-end gap-3 md:grid-cols-[1fr_2fr_auto]"
              onSubmit={async (event) => {
                event.preventDefault();
                if (
                  !(await confirm(
                    `تأكيد تغيير حالة ${employee.full_name} إلى «${STATUS_LABELS[status as keyof typeof STATUS_LABELS]}»؟`,
                  ))
                )
                  return;
                execute(
                  "status",
                  () =>
                    patch({ action: "status", status, reason: statusReason }),
                  "تم تحديث حالة الحساب",
                  () => setStatusReason(""),
                );
              }}
            >
              <Field label="الحالة الجديدة" id="account-status">
                <select
                  id="account-status"
                  className={controlClass}
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  {Object.entries(STATUS_LABELS).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="سبب تغيير الحالة" id="account-reason">
                <input
                  id="account-reason"
                  className={controlClass}
                  required
                  minLength={3}
                  maxLength={2000}
                  value={statusReason}
                  onChange={(event) => setStatusReason(event.target.value)}
                />
              </Field>
              <Button
                type="submit"
                variant="outline"
                disabled={!!busy || employee.status === status}
                loading={busy === "status"}
              >
                تحديث الحالة
              </Button>
            </form>
            <ol className="mt-5 space-y-2 text-xs text-muted">
              {data.events?.map((event) => (
                <li key={event.id}>
                  {formatDate(event.created_at)} ·{" "}
                  {event.action === "INSERT" ? "إنشاء الملف" : "تحديث الملف"} ·{" "}
                  {event.changed_fields.join("، ")}
                </li>
              ))}
            </ol>
            {olderRecordsButton("events", "عرض نشاط أقدم")}
          </details>
        </>
      )}
    </div>
  );
}

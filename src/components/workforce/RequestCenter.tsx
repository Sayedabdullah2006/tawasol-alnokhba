"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Button from "@/components/ui/Button";
import {
  REQUEST_KINDS,
  REQUEST_STATUS,
  datedRequest,
  moneyRequest,
  type EmployeeRequest,
  type RequestFile,
} from "@/lib/workforce/requests";
import type { AttendanceData } from "@/lib/workforce/attendance";
import { ATTACHMENT_ACCEPT } from "@/lib/workforce/attachments";
import {
  api,
  controlClass,
  Field,
  Dialog,
  Notice,
  useConfirm,
  useUnsavedChanges,
} from "./shared";
import ProfileApprovals from "./ProfileApprovals";
import PdfAttachmentPreview from "./PdfAttachmentPreview";
const initialForm = (kind = "general") => ({
  kind,
  title: "",
  body: "",
  starts_at: "",
  ends_at: "",
  amount: "",
  leave_type: "paid",
  attendance_session_id: "",
});
export default function RequestCenter({
  admin = false,
  initialKind = "general",
  startNew = false,
}: {
  admin?: boolean;
  initialKind?: string;
  startNew?: boolean;
}) {
  const [rows, setRows] = useState<EmployeeRequest[]>([]),
    [count, setCount] = useState(0),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(admin ? "pending" : ""),
    [revision, setRevision] = useState(0),
    [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(startNew),
    [tab, setTab] = useState("requests");
  const [form, setForm] = useState(initialForm(initialKind)),
    [files, setFiles] = useState<File[]>([]),
    [reasons, setReasons] = useState<Record<string, string>>({}),
    [preview, setPreview] = useState<{
      request: string;
      file: RequestFile;
    } | null>(null);
  const [focused] = useState(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("request") || "",
  );
  const [focusOnly, setFocusOnly] = useState(!!focused);
  const requestKey = `${page}:${status}:${revision}:${focusOnly}:${focused}`;
  const loading = loadedKey !== requestKey;
  const [attendance, setAttendance] = useState<AttendanceData | null>(null);
  useEffect(() => {
    const refresh = () => {
      setRevision((n) => n + 1);
    };
    window.addEventListener("workforce-data-changed", refresh);
    return () => window.removeEventListener("workforce-data-changed", refresh);
  }, []);
  useEffect(() => {
    if (form.kind !== "attendance-correction" || admin) return;
    const abort = new AbortController();
    api<AttendanceData>("/api/workforce/attendance", { signal: abort.signal })
      .then(setAttendance)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [form.kind, admin]);
  const key = useRef(crypto.randomUUID()),
    lock = useRef(false);
  const { confirm, confirmation } = useConfirm();
  const warning = useUnsavedChanges(
    (open && (!!form.title || !!form.body || files.length > 0)) ||
      Object.values(reasons).some((value) => value.trim().length > 0),
  );
  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams({ page: String(page) });
    if (status && !focusOnly) params.set("status", status);
    if (focusOnly) params.set("request", focused);
    api<{ requests: EmployeeRequest[]; count: number }>(
      `/api/workforce/requests?${params}`,
      { signal: abort.signal },
    )
      .then((data) => {
        setRows(data.requests);
        setCount(data.count);
        setError("");
        setLoadedKey(requestKey);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setLoadedKey(requestKey);
          if ([401, 403].includes(e.status)) setRows([]);
        }
      });
    return () => abort.abort();
  }, [page, status, revision, focusOnly, focused, requestKey]);
  async function decide(row: EmployeeRequest, decision: string) {
    if (lock.current) return;
    if (decision === "cancelled" && !(await confirm("إلغاء هذا الطلب؟")))
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/api/workforce/requests", {
        method: "PATCH",
        body: JSON.stringify({
          id: row.id,
          version: row.version,
          decision,
          reason: reasons[row.id],
        }),
      });
      setReasons((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      setMessage("تم حفظ القرار");
      setRevision((n) => n + 1);
      window.dispatchEvent(new Event("workforce-notifications"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function close() {
    if (busy) return;
    if (
      (form.title || form.body || files.length) &&
      !(await confirm("تجاهل الطلب غير المحفوظ؟"))
    )
      return;
    setOpen(false);
  }
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      {confirmation}
      {warning}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">
          {admin ? "طلبات الموظفات" : "طلباتي"}
        </h1>
        {!admin && (
          <Button
            onClick={() => {
              key.current = crypto.randomUUID();
              setForm(initialForm(initialKind));
              setFiles([]);
              setOpen(true);
            }}
          >
            طلب جديد
          </Button>
        )}
      </header>
      <nav aria-label="نوع الطلبات" className="flex flex-wrap gap-2">
        {admin ? (
          <>
            <Button
              variant={tab === "requests" ? "primary" : "outline"}
              onClick={() => setTab("requests")}
            >
              الطلبات الإدارية
            </Button>
            <Button
              variant={tab === "profile" ? "primary" : "outline"}
              onClick={() => setTab("profile")}
            >
              تعديل البيانات
            </Button>
          </>
        ) : (
          <Link
            className="rounded-xl border px-4 py-2 text-sm font-bold"
            href="/employee/requests/profile-change"
          >
            تعديل بياناتي
          </Link>
        )}
      </nav>
      <Notice message={error} error />
      <Notice message={message} />
      {tab === "profile" ? (
        <ProfileApprovals />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <select
              aria-label="حالة الطلبات"
              className="rounded-xl border bg-white p-3 text-sm"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">كل الحالات</option>
              {Object.entries(REQUEST_STATUS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFocusOnly(false);
                setRevision((n) => n + 1);
              }}
            >
              تحديث{focusOnly ? " · كل الطلبات" : ""}
            </Button>
          </div>
          {loading && !rows.length ? (
            <p role="status">جارٍ التحميل…</p>
          ) : !rows.length ? (
            <div className="rounded-2xl border bg-white p-8 text-center text-sm text-muted">
              لا توجد طلبات
            </div>
          ) : (
            rows.map((row) => (
              <article
                key={row.id}
                className="space-y-4 rounded-2xl border border-border bg-white p-5"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-xs text-muted">
                    {REQUEST_KINDS[row.kind]}
                    {row.kind === "leave"
                      ? row.leave_type === "unpaid"
                        ? " · بدون راتب"
                        : " · سنوية"
                      : ""}
                    {admin ? ` · ${row.employeeName || ""}` : ""}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${row.status === "pending" ? "bg-amber-50 text-amber-800" : row.status === "approved" ? "bg-green-50 text-green-800" : "bg-slate-100 text-slate-600"}`}
                  >
                    {REQUEST_STATUS[row.status]}
                  </span>
                </div>
                <h2 className="font-black">{row.title}</h2>
                <p className="whitespace-pre-wrap break-words text-sm leading-7">
                  {row.body}
                </p>
                <div className="flex flex-wrap gap-4 text-xs text-muted">
                  <time>
                    {new Date(row.created_at).toLocaleDateString("ar-SA", {
                      calendar: "gregory",
                    })}
                  </time>
                  {row.starts_at && (
                    <span>
                      {new Date(row.starts_at).toLocaleString("ar-SA", {
                        calendar: "gregory",
                        timeZone: "Asia/Riyadh",
                      })}{" "}
                      ←{" "}
                      {row.ends_at &&
                        new Date(row.ends_at).toLocaleString("ar-SA", {
                          calendar: "gregory",
                          timeZone: "Asia/Riyadh",
                        })}
                    </span>
                  )}
                  {row.amount && (
                    <strong className="text-dark">
                      {Number(row.amount).toLocaleString("ar-SA")} ر.س
                    </strong>
                  )}
                </div>
                {!!row.attachments.length && (
                  <ul className="space-y-2">
                    {row.attachments.map((file) => (
                      <li
                        key={file.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"
                      >
                        <span className="break-all">{file.filename}</span>
                        <div className="flex gap-3">
                          {(file.mime_type === "application/pdf" ||
                            file.mime_type.startsWith("image/")) && (
                            <button
                              className="font-bold text-green"
                              onClick={() =>
                                setPreview({ request: row.id, file })
                              }
                            >
                              معاينة
                            </button>
                          )}
                          <a
                            className="font-bold"
                            href={`/api/workforce/requests/${row.id}/attachments/${file.id}`}
                            download
                          >
                            تنزيل
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {row.decision_reason && (
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <strong>قرار الإدارة</strong>
                    <p className="mt-2 whitespace-pre-wrap break-words">
                      {row.decision_reason}
                    </p>
                  </div>
                )}
                {row.status === "pending" &&
                  (admin ? (
                    <form
                      className="space-y-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const value = (
                          (e.nativeEvent as SubmitEvent)
                            .submitter as HTMLButtonElement
                        )?.value;
                        if (["approved", "rejected"].includes(value))
                          void decide(row, value);
                      }}
                    >
                      <Field id={`decision-${row.id}`} label="سبب القرار">
                        <textarea
                          id={`decision-${row.id}`}
                          className={controlClass}
                          required
                          minLength={3}
                          maxLength={2000}
                          value={reasons[row.id] || ""}
                          onChange={(e) =>
                            setReasons((current) => ({
                              ...current,
                              [row.id]: e.target.value,
                            }))
                          }
                        />
                      </Field>
                      <div className="flex gap-3">
                        <Button type="submit" value="approved" disabled={busy}>
                          موافقة
                        </Button>
                        <Button
                          type="submit"
                          value="rejected"
                          variant="outline"
                          disabled={busy}
                        >
                          رفض
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void decide(row, "cancelled")}
                    >
                      إلغاء الطلب
                    </Button>
                  ))}
              </article>
            ))
          )}
          <nav
            aria-label="صفحات الطلبات"
            className="flex items-center justify-between gap-3"
          >
            <Button
              size="sm"
              variant="outline"
              disabled={page === 1 || loading || busy}
              onClick={() => setPage((n) => n - 1)}
            >
              السابق
            </Button>
            <span className="text-xs">
              {page} / {Math.max(1, Math.ceil(count / 20))}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page * 20 >= count || loading || busy}
              onClick={() => setPage((n) => n + 1)}
            >
              التالي
            </Button>
          </nav>
        </>
      )}
      <Dialog title="طلب جديد" open={open} onClose={() => void close()}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError("");
            try {
              const data = new FormData();
              for (const [name, value] of Object.entries(form)) {
                if (["starts_at", "ends_at"].includes(name))
                  data.set(name, value ? `${value}:00+03:00` : "");
                else data.set(name, value);
              }
              data.set("request_key", key.current);
              files.forEach((file) => data.append("files", file));
              await api("/api/workforce/requests", {
                method: "POST",
                body: data,
              });
              setOpen(false);
              setForm(initialForm(initialKind));
              setFiles([]);
              setPage(1);
              setStatus("");
              setFocusOnly(false);
              setMessage("تم إرسال الطلب");
              setRevision((n) => n + 1);
              window.dispatchEvent(new Event("workforce-notifications"));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          <Field id="request-kind" label="نوع الطلب">
            <select
              id="request-kind"
              className={controlClass}
              value={form.kind}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  kind: e.target.value,
                  starts_at: "",
                  ends_at: "",
                  amount: "",
                  attendance_session_id: "",
                  leave_type: "paid",
                }))
              }
            >
              {Object.entries(REQUEST_KINDS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="request-title" label="العنوان">
            <input
              id="request-title"
              className={controlClass}
              required
              minLength={3}
              maxLength={150}
              value={form.title}
              onChange={(e) =>
                setForm((current) => ({ ...current, title: e.target.value }))
              }
            />
          </Field>
          {form.kind === "leave" && (
            <Field id="request-leave-type" label="نوع الإجازة">
              <select
                id="request-leave-type"
                className={controlClass}
                value={form.leave_type}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    leave_type: e.target.value,
                  }))
                }
              >
                <option value="paid">من الرصيد السنوي</option>
                <option value="unpaid">بدون راتب</option>
              </select>
            </Field>
          )}
          {form.kind === "attendance-correction" && (
            <Field id="request-session" label="السجل المطلوب تصحيحه">
              <select
                id="request-session"
                className={controlClass}
                value={form.attendance_session_id}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    attendance_session_id: e.target.value,
                  }))
                }
              >
                <option value="">إضافة حضور غير مسجل</option>
                {[
                  ...(attendance?.open &&
                  !attendance.sessions.some(
                    (row) => row.id === attendance.open?.id,
                  )
                    ? [attendance.open]
                    : []),
                  ...(attendance?.sessions || []),
                ].map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.business_date} ·{" "}
                    {new Date(row.checked_in).toLocaleTimeString("ar-SA", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Riyadh",
                    })}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {datedRequest(form.kind) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["starts_at", "من — الرياض"],
                ["ends_at", "إلى — الرياض"],
              ].map(([key, label]) => (
                <Field key={key} id={`request-${key}`} label={label}>
                  <input
                    id={`request-${key}`}
                    type="datetime-local"
                    required
                    className={controlClass}
                    value={form[key as "starts_at" | "ends_at"]}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        [key]: e.target.value,
                      }))
                    }
                  />
                </Field>
              ))}
            </div>
          )}
          {moneyRequest(form.kind) && (
            <Field id="request-amount" label="المبلغ — ر.س">
              <input
                id="request-amount"
                type="number"
                min="0.01"
                max="100000000"
                step="0.01"
                required
                className={controlClass}
                value={form.amount}
                onChange={(e) =>
                  setForm((current) => ({ ...current, amount: e.target.value }))
                }
              />
            </Field>
          )}
          <Field id="request-body" label="التفاصيل">
            <textarea
              id="request-body"
              className={controlClass}
              rows={4}
              required
              minLength={3}
              maxLength={10000}
              value={form.body}
              onChange={(e) =>
                setForm((current) => ({ ...current, body: e.target.value }))
              }
            />
          </Field>
          <Field
            id="request-files"
            label="المرفقات — حتى 5 ملفات، 4 م.ب لكل ملف"
          >
            <input
              id="request-files"
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className={controlClass}
              onChange={(e) => {
                const next = Array.from(e.target.files || []);
                if (
                  next.length > 5 ||
                  next.some((file) => file.size > 4 * 1024 * 1024)
                ) {
                  setError("حتى خمسة ملفات، 4 ميجابايت لكل ملف");
                  e.target.value = "";
                  setFiles([]);
                } else {
                  setError("");
                  setFiles(next);
                }
              }}
            />
          </Field>
          <Notice message={error} error />
          <Button type="submit" loading={busy}>
            إرسال الطلب
          </Button>
        </form>
      </Dialog>
      <Dialog
        title={preview?.file.filename || "معاينة المرفق"}
        open={!!preview}
        onClose={() => setPreview(null)}
      >
        {preview &&
          (preview.file.mime_type === "application/pdf" ? (
            <PdfAttachmentPreview
              url={`/api/workforce/requests/${preview.request}/attachments/${preview.file.id}?preview=true`}
            />
          ) : (
            <Image
              unoptimized
              width={1200}
              height={900}
              alt={preview.file.filename}
              className="max-h-[70vh] w-full object-contain"
              src={`/api/workforce/requests/${preview.request}/attachments/${preview.file.id}?preview=true`}
            />
          ))}
      </Dialog>
    </div>
  );
}

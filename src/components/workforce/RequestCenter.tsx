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
  requestAttachmentHref,
  type EmployeeRequest,
  type RequestFile,
} from "@/lib/workforce/requests";
import { leaveTypeLabel, MEDICAL_REPORT_ACCEPT, MEDICAL_REPORT_MIMES } from "@/lib/workforce/sick-leave";
import {UNPAID_LEAVE_NOTICE,type UnpaidLeaveEstimate} from '@/lib/workforce/unpaid-leave';
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
import OvertimePeriod,{localRequestTime} from "./OvertimePeriod";
const initialForm = (kind = "general") => ({
  kind,
  title: "",
  body: "",
  starts_at: "",
  ends_at: "",
  amount: "",
  leave_type: "paid",
  attendance_session_id: "",
  work_day: "",
  hours: "",
});
function UnpaidLeaveSummary({estimate,error,loading=false}:{estimate?:UnpaidLeaveEstimate;error?:string;loading?:boolean}){
 if(!estimate)return <p role={error?'alert':'status'} className="text-sm">{error||(loading?'جارٍ احتساب الخصم…':'حددي بداية الإجازة ونهايتها لعرض التقدير')}</p>;
 return <dl aria-label="تقدير الإجازة غير المدفوعة" className="grid grid-cols-2 gap-3 rounded-xl border border-current/20 p-3 text-sm"><div><dt className="text-xs opacity-75">أيام التقويم</dt><dd className="mt-1 font-black tabular-nums">{estimate.calendar_days.toLocaleString('ar-SA')} يوم</dd></div><div><dt className="text-xs opacity-75">الخصم المتوقع</dt><dd className="mt-1 whitespace-nowrap font-black tabular-nums">{Number(estimate.amount).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})} ر.س</dd></div></dl>;
}
export default function RequestCenter({
  admin = false,
  initialKind = "general",
  initialTitle = "",
  startNew = false,
  initialTab = "requests",
  initialRequest = "",
  embedded = false,
  onChanged,
  transport = api,
  attachmentHref = requestAttachmentHref,
}: {
  admin?: boolean;
  initialKind?: string;
  initialTitle?: string;
  startNew?: boolean;
  initialTab?: string;
  initialRequest?: string;
  embedded?: boolean;
  onChanged?: () => void;
  transport?:typeof api;
  attachmentHref?:typeof requestAttachmentHref;
}) {
  const focused = initialTab === "profile" ? "" : initialRequest;
  const Heading = embedded ? "h2" : "h1";
  const [dismissedFocus, setDismissedFocus] = useState("");
  const focusOnly = !!focused && dismissedFocus !== focused;
  const [rows, setRows] = useState<EmployeeRequest[]>([]),
    [count, setCount] = useState(0),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(admin && !focused ? "pending" : ""),
    [revision, setRevision] = useState(0),
    [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(startNew),
    [tab, setTab] = useState(initialTab);
  const [profileVisited, setProfileVisited] = useState(
    initialTab === "profile",
  );
  const [form, setForm] = useState({...initialForm(initialKind),...(initialTitle?{title:initialTitle.slice(0,150)}:{})}),
    [files, setFiles] = useState<File[]>([]),
    [reasons, setReasons] = useState<Record<string, string>>({}),
    [preview, setPreview] = useState<{
      request: string;
      file: RequestFile;
    } | null>(null);
  const requestKey = `${page}:${status}:${revision}:${focusOnly}:${focused}`;
  const loading = loadedKey !== requestKey;
  const [attendance, setAttendance] = useState<AttendanceData | null>(null);
  const [unpaidAck,setUnpaidAck]=useState('');
  const unpaidLeave=form.kind==='leave'&&form.leave_type==='unpaid';
  const unpaidPeriod=[form.kind,form.leave_type,form.starts_at,form.ends_at].join(':');
  const [unpaidQuote,setUnpaidQuote]=useState<{key:string;estimate?:UnpaidLeaveEstimate;error?:string}|null>(null);
  const unpaidEstimate=unpaidQuote?.key===unpaidPeriod?unpaidQuote.estimate:undefined;
  const unpaidError=unpaidQuote?.key===unpaidPeriod?unpaidQuote.error:undefined;
  const unpaidAgreement=`${unpaidPeriod}:${unpaidEstimate?.amount??''}`;
  useEffect(()=>{
    if(!unpaidLeave||!open||!form.starts_at||!form.ends_at)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{void transport<{estimate:UnpaidLeaveEstimate}>('/api/workforce/requests/unpaid-estimate',{method:'POST',signal:controller.signal,body:JSON.stringify({starts_on:form.starts_at.slice(0,10),ends_on:form.ends_at.slice(0,10)})})
      .then(result=>{if(!controller.signal.aborted)setUnpaidQuote({key:unpaidPeriod,estimate:result.estimate});})
      .catch(e=>{if(!controller.signal.aborted)setUnpaidQuote({key:unpaidPeriod,error:e.message||'تعذر احتساب الخصم'});});},250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[unpaidLeave,unpaidPeriod,open,form.starts_at,form.ends_at,transport]);
  const [overtimePeriods,setOvertimePeriods]=useState<Record<string,{starts_at:string;ends_at:string}>>({});
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
    transport<AttendanceData>("/api/workforce/attendance", { signal: abort.signal })
      .then(setAttendance)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [form.kind, admin,transport]);
  const requestFiles = useRef<HTMLInputElement>(null);
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
    transport<{ requests: EmployeeRequest[]; count: number }>(
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
  }, [page, status, revision, focusOnly, focused, requestKey,transport]);
  async function decide(row: EmployeeRequest, decision: string) {
    if (lock.current) return;
    if (decision === "cancelled" && !(await confirm("إلغاء هذا الطلب؟")))
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await transport("/api/workforce/requests", {
        method: "PATCH",
        body: JSON.stringify({
          id: row.id,
          version: row.version,
          decision,
          reason: reasons[row.id],
          ...(row.kind==='overtime'&&decision==='approved'?{starts_at:`${overtimePeriods[row.id]?.starts_at??localRequestTime(row.starts_at)}:00+03:00`,ends_at:`${overtimePeriods[row.id]?.ends_at??localRequestTime(row.ends_at)}:00+03:00`}:{}),
        }),
      });
      setReasons((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      setMessage("تم حفظ القرار");
      setRevision((n) => n + 1);
      onChanged?.();
      window.dispatchEvent(new Event("workforce-data-changed"));
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
    setOpen(false);setUnpaidAck('');
  }
  return (
    <div
      className={
        embedded
          ? "min-w-0 space-y-5"
          : "mx-auto w-full min-w-0 max-w-6xl space-y-5 p-4 md:p-6"
      }
    >
      {confirmation}
      {warning}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Heading className="text-2xl font-black">
          {admin ? "طلبات الموظفات" : "طلباتي"}
        </Heading>
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
              onClick={() => {
                setProfileVisited(true);
                setTab("profile");
              }}
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
      {profileVisited && (
        <section hidden={tab !== "profile"}>
          <ProfileApprovals
            onChanged={onChanged}
            embedded={embedded}
            requestId={initialTab === "profile" ? initialRequest : undefined}
          />
        </section>
      )}
      <section hidden={tab !== "requests"} className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <select
            aria-label="حالة الطلبات"
            className="rounded-xl border bg-white p-3 text-sm"
            value={focusOnly ? "" : status}
            onChange={(e) => {
              setDismissedFocus(focused);
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
              setDismissedFocus(focused);
              if (focusOnly) setStatus("");
              setRevision((n) => n + 1);
            }}
          >
            {focusOnly ? "كل الطلبات" : "تحديث"}
          </Button>
        </div>
        {loading && !rows.length ? (
          <p role="status">جارٍ التحميل…</p>
        ) : !rows.length ? (
          <div className="rounded-2xl border bg-white p-8 text-center text-sm text-muted">
            لا توجد طلبات
          </div>
        ) : (
          <div
            className={`grid items-start gap-4 ${focusOnly || rows.length===1 ? "" : "md:grid-cols-2"}`}
          >
            {rows.map((row) => (
              <article
                key={row.id}
                className={`min-w-0 space-y-4 rounded-3xl border p-5 shadow-sm ${row.status === "pending" ? "border-amber-200 bg-amber-50/70" : row.status === "approved" ? "border-emerald-200 bg-emerald-50/70" : "border-slate-200 bg-slate-50"}`}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-xs text-muted">
                    {REQUEST_KINDS[row.kind]}
                    {row.kind === "leave"
                      ? ` · ${leaveTypeLabel(row.leave_type)}`
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
                {row.kind==='leave'&&row.leave_type==='unpaid'&&<UnpaidLeaveSummary estimate={row.unpaid_estimate} error={row.unpaid_estimate_error}/>}
                {row.kind==='missing-hours'&&<p className="text-sm font-bold">{row.work_day} · {Number((row.missing_minutes??0)/60).toLocaleString('ar-SA')} ساعة</p>}
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
                  {row.amount && !(admin&&row.status==="pending"&&row.kind==="overtime") && (
                    <strong className="text-dark">
                      {Number(row.amount).toLocaleString("ar-SA")} ر.س
                    </strong>
                  )}
                  {row.overtime_details&&!(admin&&row.status==="pending")&&<span>{Number(row.overtime_details.hours).toLocaleString('ar-SA')} ساعة · {Number(row.overtime_details.hourly_rate).toLocaleString('ar-SA',{maximumFractionDigits:4})} ر.س/ساعة</span>}
                  {row.expense_details&&<span className="font-bold text-emerald-600">أُضيف إلى مستحقات {new Date(`${row.expense_details.payroll_month}T12:00:00+03:00`).toLocaleDateString('ar-SA',{calendar:'gregory',month:'long',year:'numeric'})}</span>}
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
                            href={attachmentHref(row.id,file.id)}
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
                      className="space-y-3 rounded-2xl border border-white bg-white/80 p-4"
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
                      {row.kind==='overtime'&&<OvertimePeriod quote={row.overtime_details} id={`overtime-${row.id}`} startsAt={overtimePeriods[row.id]?.starts_at??localRequestTime(row.starts_at)} endsAt={overtimePeriods[row.id]?.ends_at??localRequestTime(row.ends_at)} onChange={v=>setOvertimePeriods(p=>({...p,[row.id]:v}))}/>}
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
                        <Button type="submit" value="approved" disabled={busy||(row.kind==='leave'&&row.leave_type==='unpaid'&&!row.unpaid_estimate)}>
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
            ))}
          </div>
        )}
        {(count > 20 || page > 1) && (
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
        )}
      </section>
      <Dialog title="طلب جديد" open={open} onClose={() => void close()}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if(unpaidLeave&&!unpaidEstimate){setError(unpaidError||'انتظري احتساب الخصم قبل إرسال الطلب');return;}
            if(unpaidLeave&&unpaidAck!==unpaidAgreement){setError('أكّدي اطلاعك على خصم فترة الإجازة غير المدفوعة');return;}
            if(form.kind==='leave'&&form.leave_type==='sick'&&!files.some(file=>MEDICAL_REPORT_MIMES.includes(file.type))){setError('أرفقي التقرير الطبي بصيغة PDF أو صورة');return;}
            if(form.kind==='expenses'&&!files.length){setError('أرفق فاتورة المصروف');return;}
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
              if(unpaidLeave)data.set('unpaid_leave_ack','true');
              files.forEach((file) => data.append("files", file));
              await transport("/api/workforce/requests", {
                method: "POST",
                body: data,
              });
              setOpen(false);setUnpaidAck('');
              setForm(initialForm(initialKind));
              setFiles([]);
              setPage(1);
              setStatus("");
              setDismissedFocus(focused);
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
                <option value="unpaid">استثنائية غير مدفوعة</option>
                <option value="sick">مرضية · بتقرير طبي</option>
              </select>
            </Field>
          )}
          {unpaidLeave&&<div className="rounded-xl border border-amber-300/50 bg-amber-200/10 p-4 text-sm"><div className="mb-3"><UnpaidLeaveSummary estimate={unpaidEstimate} error={unpaidError} loading={!!form.starts_at&&!!form.ends_at&&!unpaidEstimate&&!unpaidError}/></div><p id="unpaid-leave-notice" role="alert" className="font-bold text-amber-100">{UNPAID_LEAVE_NOTICE}</p><label className="mt-3 flex cursor-pointer items-start gap-2"><input type="checkbox" required aria-describedby="unpaid-leave-notice" className="mt-1" disabled={!unpaidEstimate} checked={!!unpaidEstimate&&unpaidAck===unpaidAgreement} onChange={e=>setUnpaidAck(e.target.checked?unpaidAgreement:'')}/><span>اطّلعت على هذه الشروط وأوافق عليها.</span></label></div>}
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
                  ...(attendance?.sessions || []).filter(row=>!row.credit_request_id),
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
          {form.kind==='overtime'&&<OvertimePeriod startsAt={form.starts_at} endsAt={form.ends_at} onChange={v=>setForm(p=>({...p,...v}))}/>}
          {form.kind==='missing-hours'&&<div className="grid gap-3 sm:grid-cols-2">
            <Field id="request-work-day" label="اليوم"><input id="request-work-day" type="date" required className={controlClass} value={form.work_day} onChange={e=>setForm(p=>({...p,work_day:e.target.value}))}/></Field>
            <Field id="request-hours" label="عدد الساعات"><input id="request-hours" type="number" required min="0.25" max="8" step="0.25" className={controlClass} value={form.hours} onChange={e=>setForm(p=>({...p,hours:e.target.value}))}/></Field>
          </div>}
          {datedRequest(form.kind) && form.kind!=='overtime' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["starts_at", "من — الرياض"],
                ["ends_at", "إلى — الرياض"],
              ].map(([key, label]) => (
                <Field key={key} id={`request-${key}`} label={form.kind==='leave'?(key==='starts_at'?'تاريخ البداية':'تاريخ النهاية'):label}>
                  <input
                    id={`request-${key}`}
                    type={form.kind==='leave'?'date':'datetime-local'}
                    required
                    className={controlClass}
                    value={form.kind==='leave'?form[key as "starts_at" | "ends_at"].slice(0,10):form[key as "starts_at" | "ends_at"]}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        [key]: form.kind==='leave'&&e.target.value?`${e.target.value}T${key==='starts_at'?'00:00':'23:59'}`:e.target.value,
                      }))
                    }
                  />
                </Field>
              ))}
            </div>
          )}
          {moneyRequest(form.kind) && (
            <Field id="request-amount" label={form.kind==='expenses'?"قيمة المصروف — ر.س":"المبلغ — ر.س"}>
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
          <Field id="request-files" label={form.kind==='leave'&&form.leave_type==='sick'?"التقرير الطبي · مطلوب":form.kind==='expenses'?"الفاتورة والمرفقات · الفاتورة مطلوبة":"المرفقات · 5 ملفات × 4 م.ب"}>
            <input
              ref={requestFiles}
              id="request-files"
              type="file"
              multiple
              accept={form.kind==='leave'&&form.leave_type==='sick'?MEDICAL_REPORT_ACCEPT:ATTACHMENT_ACCEPT}
              className="sr-only"
              disabled={busy}
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
                  e.target.value = "";
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => requestFiles.current?.click()}
            >
              اختيار ملفات أو صور
            </Button>
          </Field>
          {!!files.length && (
            <ul className="space-y-2">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-sky-50 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 break-all">{file.name}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`إزالة ${file.name}`}
                    onClick={() =>
                      setFiles((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    إزالة
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Notice message={error} error />
          <Button type="submit" loading={busy} disabled={unpaidLeave&&!unpaidEstimate}>
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
              url={attachmentHref(preview.request,preview.file.id,true)}
            />
          ) : (
            <Image
              unoptimized
              width={1200}
              height={900}
              alt={preview.file.filename}
              className="max-h-[70vh] w-full object-contain"
              src={attachmentHref(preview.request,preview.file.id,true)}
            />
          ))}
      </Dialog>
    </div>
  );
}

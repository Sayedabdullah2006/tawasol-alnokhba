"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { WORKDAYS, type AttendanceData } from "@/lib/workforce/attendance";
import { attendanceDuration, liveAttendance, workedSeconds, attendanceEnd } from "@/lib/workforce/attendance-summary";
import {CLOSE_REASONS} from "@/lib/workforce/work-session";
import { REQUEST_KINDS } from "@/lib/workforce/requests";
import { api, controlClass, Field, Notice, useUnsavedChanges } from "./shared";
const clock = (date: string | null) =>
  date
    ? new Date(date).toLocaleTimeString("ar-SA", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Riyadh",
      })
    : "—";
export default function AttendanceHub({
  admin = false,
  section = "overview",
}: {
  admin?: boolean;
  section?: string;
}) {
  const [tab, setTab] = useState(section),
    [employees, setEmployees] = useState<{ id: string; full_name: string }[]>(
      [],
    ),
    [employee, setEmployee] = useState(""),
    [year, setYear] = useState(new Date().getFullYear()),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [data, setData] = useState<AttendanceData | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false),
    [settings, setSettings] = useState({
      workdays: [0, 1, 2, 3, 4],
      starts_at: "09:00",
      ends_at: "17:00",
      schedule_mode: "fixed",
      daily_minutes: 480,
      days: "0",
      reason: "",
    });
  const [tick, setTick] = useState(0);
  useEffect(() => { const timer = setInterval(() => setTick(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const attendance = data?.summary ? liveAttendance(data.summary, data.open, tick) : null;
  const [loadedKey, setLoadedKey] = useState("");
  const queryKey = `${employee}:${year}:${page}:${revision}`,
    loading = loadedKey !== queryKey;

  const warning = useUnsavedChanges(editing);
  const lock = useRef(false);
  useEffect(() => {
    const refresh = () => {
      if (!editing && !busy) setRevision((n) => n + 1);
    };
    window.addEventListener("workforce-data-changed", refresh);
    return () => window.removeEventListener("workforce-data-changed", refresh);
  }, [editing, busy]);
  useEffect(() => {
    if (!admin) return;
    const abort = new AbortController();
    api<{ employees: { id: string; full_name: string }[] }>(
      "/api/workforce/team",
      { signal: abort.signal },
    )
      .then((result) => {
        setEmployees(result.employees);
        setEmployee(result.employees[0]?.id || "");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [admin]);
  useEffect(() => {
    if (admin && !employee) return;
    const abort = new AbortController(),
      params = new URLSearchParams({ year: String(year), page: String(page) });
    if (admin) params.set("employee_id", employee);
    api<AttendanceData>(`/api/workforce/attendance?${params}`, {
      signal: abort.signal,
    })
      .then((result) => {
        setData(result);
        setError("");
        setLoadedKey(queryKey);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setLoadedKey(queryKey);
          if ([401, 403, 404].includes(e.status)) setData(null);
        }
      });
    return () => abort.abort();
  }, [admin, employee, year, page, revision, queryKey]);
  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-5 p-4 md:p-6">
      {warning}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">
          {admin
            ? "الحضور والإجازات"
            : tab === "schedule"
              ? "جدول دوامي"
              : tab === "leave-balances"
                ? "رصيد إجازاتي"
                : "الحضور والانصراف"}
        </h1>
        <div className="flex flex-wrap gap-2">
          {admin && (
            <select
              aria-label="الموظفة"
              className="rounded-xl border bg-white p-3 text-sm"
              value={employee}
              disabled={busy || editing}
              onChange={(e) => {
                setEmployee(e.target.value);
                setPage(1);
                setData(null);
              }}
            >
              <option value="">اختاري الموظفة</option>
              {employees.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.full_name}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="السنة"
            className="rounded-xl border bg-white p-3 text-sm"
            value={year}
            disabled={busy || editing}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setPage(1);
            }}
          >
            {Array.from(
              { length: 7 },
              (_, i) => new Date().getFullYear() - 3 + i,
            ).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || editing}
            onClick={() => setRevision((n) => n + 1)}
          >
            تحديث
          </Button>
        </div>
      </header>
      {admin && (
        <nav aria-label="الحضور والإجازات" className="flex flex-wrap gap-2">
          {[
            ["overview", "سجل الحضور"],
            ["schedule", "جدول الدوام"],
            ["leave-balances", "الإجازات"],
          ].map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              disabled={editing}
              variant={tab === key ? "primary" : "outline"}
              onClick={() => setTab(key)}
            >
              {label}
            </Button>
          ))}
        </nav>
      )}
      <Notice message={error} error />
      <Notice message={message} />
      {loading && !data ? (
        <p role="status">جارٍ التحميل…</p>
      ) : (
        data && (
          <>
            {tab === "overview" && (
              <>
                <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-white p-5">
                  <div>
                    <h2 className="font-black">
                      {attendance?.isPresent ? data.open?.break_started_at?"في استراحة":"الحضور مسجل" : "غير مسجلة حاليًا"}
                    </h2>
                    {data.open && (
                      <p className="mt-2 text-sm text-muted">
                        {data.open.business_date} ·{" "}
                        {clock(data.open.checked_in)}
                      </p>
                    )}
                    {attendance && <p className="mt-3 text-sm"><strong className="text-lg tabular-nums">{attendanceDuration(attendance.todayMinutes)}</strong><span className="mx-2 text-muted">اليوم · {attendance.todayPeriods} فترات حضور</span></p>}
                  </div>
                  {!admin && (
                    <div className="flex flex-wrap gap-3">
                      <Link
                        className="rounded-xl border px-4 py-3 text-sm font-bold"
                        href="/employee/requests/attendance-correction"
                      >
                        تصحيح حضور
                      </Link>
                    </div>
                  )}
                </section>
                <div className="overflow-x-auto rounded-2xl border bg-white">
                  <table className="w-full min-w-[620px] text-right text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        {["اليوم", "الحضور", "الانصراف", "المدة", "الحالة"].map(
                          (label) => (
                            <th key={label} className="p-4">
                              {label}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {data.sessions.map((row) => (
                        <tr key={row.id} className="border-t">
                          <td className="p-4">{row.business_date}</td>
                          <td className="p-4">{clock(row.checked_in)}</td>
                          <td className="p-4">{clock(row.checked_out || (row.policy_version===1 && attendanceEnd(row,tick||Date.parse(data.summary.asOf))<(tick||Date.parse(data.summary.asOf))?new Date(attendanceEnd(row,tick||Date.parse(data.summary.asOf))).toISOString():null))}</td>
                          <td className="p-4">
                            {attendanceDuration(workedSeconds([row],0,Infinity,tick||Date.parse(data.summary.asOf))/60)}
                          </td>
                          <td className="p-4">
                            {row.close_reason ? CLOSE_REASONS[row.close_reason] : !row.checked_out
                              ? row.policy_version===1 && attendanceEnd(row,tick||Date.parse(data.summary.asOf))<(tick||Date.parse(data.summary.asOf)) ? "انصراف تلقائي" : "حضور مفتوح"
                              : row.source === "correction"
                                ? "تم التصحيح"
                                : "مكتمل"}
                          </td>
                        </tr>
                      ))}
                      {!data.sessions.length && (
                        <tr>
                          <td
                            colSpan={5}
                            className="p-8 text-center text-muted"
                          >
                            لا توجد سجلات
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {(data.count > 20 || page > 1) && (
                  <nav
                    aria-label="صفحات الحضور"
                    className="flex justify-between gap-3"
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page === 1 || loading}
                      onClick={() => setPage((n) => n - 1)}
                    >
                      السابق
                    </Button>
                    <span className="text-xs">
                      {page} / {Math.max(1, Math.ceil(data.count / 20))}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page * 20 >= data.count || loading}
                      onClick={() => setPage((n) => n + 1)}
                    >
                      التالي
                    </Button>
                  </nav>
                )}
              </>
            )}
            {tab === "schedule" && (
              <section className="space-y-5 rounded-2xl border bg-white p-5">
                <div className="flex flex-wrap gap-2">
                  {WORKDAYS.map((day, index) => (
                    <span
                      key={day}
                      className={`rounded-xl px-4 py-3 text-sm ${data.settings.workdays.includes(index) ? "bg-green-50 font-bold text-green-800" : "bg-slate-50 text-slate-400"}`}
                    >
                      {day}
                    </span>
                  ))}
                </div>
                {data.settings.schedule_mode === "flexible" ? <p className="text-lg font-black">دوام مرن · {data.settings.daily_minutes / 60} ساعات يوميًا</p> : <p className="text-lg font-black" dir="ltr">
                  {data.settings.starts_at.slice(0, 5)} —{" "}
                  {data.settings.ends_at.slice(0, 5)}
                </p>}
                {!admin && (
                  <Link
                    href="/employee/requests/remote-work"
                    className="inline-block rounded-xl border px-4 py-3 text-sm font-bold"
                  >
                    طلب عمل عن بُعد
                  </Link>
                )}
              </section>
            )}
            {tab === "leave-balances" && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    ["المستحق", data.leave.granted],
                    ["المستخدم", data.leave.used],
                    ["المتاح", data.leave.available],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl border bg-white p-4"
                    >
                      <p className="text-sm text-muted">{label}</p>
                      <strong className="mt-3 block text-2xl text-green">
                        {value} <span className="text-xs">يوم</span>
                      </strong>
                    </div>
                  ))}
                </div>
                {!admin && (
                  <Link
                    className="inline-block rounded-xl bg-dark px-5 py-3 text-sm font-bold text-white"
                    href="/employee/requests/leave"
                  >
                    طلب إجازة
                  </Link>
                )}
              </>
            )}
            {admin && tab !== "overview" && (
              <section className="rounded-2xl border bg-white p-5">
                {!editing ? (
                  <Button
                    variant="outline"
                    disabled={loading}
                    onClick={() => {
                      setSettings({
                        workdays: data.settings.workdays,
                        starts_at: data.settings.starts_at.slice(0, 5),
                        ends_at: data.settings.ends_at.slice(0, 5),
                        schedule_mode: data.settings.schedule_mode,
                        daily_minutes: data.settings.daily_minutes,
                        days: String(data.leave.granted),
                        reason: "",
                      });
                      setEditing(true);
                    }}
                  >
                    تعديل الدوام واستحقاق الإجازة
                  </Button>
                ) : (
                  <form
                    className="space-y-4"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (lock.current) return;
                      lock.current = true;
                      setBusy(true);
                      setError("");
                      try {
                        await api("/api/workforce/attendance", {
                          method: "PATCH",
                          body: JSON.stringify({
                            ...settings,
                            employee_id: employee,
                            year,
                            days: Number(settings.days),
                          }),
                        });
                        setEditing(false);
                        setMessage("تم حفظ الإعدادات");
                        setRevision((n) => n + 1);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        lock.current = false;
                        setBusy(false);
                      }
                    }}
                  >
                    <fieldset>
                      <legend className="mb-3 text-sm font-bold">
                        أيام الدوام
                      </legend>
                      <div className="flex flex-wrap gap-4">
                        {WORKDAYS.map((day, index) => (
                          <label key={day} className="flex gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={settings.workdays.includes(index)}
                              onChange={(e) =>
                                setSettings((current) => ({
                                  ...current,
                                  workdays: e.target.checked
                                    ? [...current.workdays, index]
                                    : current.workdays.filter(
                                        (value) => value !== index,
                                      ),
                                }))
                              }
                            />
                            {day}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field id="schedule-mode" label="نوع الدوام">
                        <select id="schedule-mode" className={controlClass} value={settings.schedule_mode} onChange={(e) => setSettings((current) => ({...current, schedule_mode:e.target.value}))}>
                          <option value="fixed">مواعيد ثابتة</option><option value="flexible">دوام مرن</option>
                        </select>
                      </Field>
                      {settings.schedule_mode === "flexible" ? <Field id="daily-hours" label="الساعات اليومية"><input id="daily-hours" type="number" min="1" max="16" step="0.5" required className={controlClass} value={settings.daily_minutes / 60} onChange={(e) => setSettings((current) => ({...current,daily_minutes:Number(e.target.value)*60}))} /></Field> : [
                        ["starts_at", "بداية الدوام"],
                        ["ends_at", "نهاية الدوام"],
                      ].map(([key, label]) => (
                        <Field key={key} id={key} label={label}>
                          <input
                            type="time"
                            id={key}
                            required
                            className={controlClass}
                            value={settings[key as "starts_at" | "ends_at"]}
                            onChange={(e) =>
                              setSettings((current) => ({
                                ...current,
                                [key]: e.target.value,
                              }))
                            }
                          />
                        </Field>
                      ))}
                      <Field
                        id="leave-days"
                        label={`استحقاق الإجازة ${year} — يوم`}
                      >
                        <input
                          id="leave-days"
                          className={controlClass}
                          type="number"
                          min="0"
                          max="366"
                          step="0.5"
                          required
                          value={settings.days}
                          onChange={(e) =>
                            setSettings((current) => ({
                              ...current,
                              days: e.target.value,
                            }))
                          }
                        />
                      </Field>
                    </div>
                    <Field id="attendance-reason" label="سبب التعديل">
                      <input
                        id="attendance-reason"
                        required
                        minLength={3}
                        maxLength={2000}
                        className={controlClass}
                        value={settings.reason}
                        onChange={(e) =>
                          setSettings((current) => ({
                            ...current,
                            reason: e.target.value,
                          }))
                        }
                      />
                    </Field>
                    <div className="flex gap-3">
                      <Button type="submit" loading={busy}>
                        حفظ
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setEditing(false)}
                      >
                        إلغاء
                      </Button>
                    </div>
                  </form>
                )}
              </section>
            )}
            {tab !== "overview" && (
              <section className="rounded-2xl border bg-white p-5">
                <h2 className="mb-4 font-bold">
                  {tab === "schedule"
                    ? "الاستثناءات المعتمدة"
                    : "الإجازات المعتمدة"}
                </h2>
                <div className="space-y-3">
                  {data.approved
                    .filter(
                      (row) => tab !== "leave-balances" || row.kind === "leave",
                    )
                    .map((row) => (
                      <div
                        key={row.id}
                        className="rounded-xl border p-3 text-sm"
                      >
                        <strong>
                          {
                            REQUEST_KINDS[
                              row.kind as keyof typeof REQUEST_KINDS
                            ]
                          }{" "}
                          · {row.title}
                        </strong>
                        <p className="mt-2 text-xs text-muted">
                          {new Date(row.starts_at).toLocaleDateString("ar-SA", {
                            calendar: "gregory",
                            timeZone: "Asia/Riyadh",
                          })}{" "}
                          —{" "}
                          {new Date(row.ends_at).toLocaleDateString("ar-SA", {
                            calendar: "gregory",
                            timeZone: "Asia/Riyadh",
                          })}
                        </p>
                      </div>
                    ))}
                  {!data.approved.some(
                    (row) => tab !== "leave-balances" || row.kind === "leave",
                  ) && (
                    <p className="text-sm text-muted">لا توجد طلبات معتمدة</p>
                  )}
                </div>
              </section>
            )}
          </>
        )
      )}
    </div>
  );
}

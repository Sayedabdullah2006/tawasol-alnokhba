"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import {
  api,
  controlClass,
  Dialog,
  Field,
  Notice,
  useConfirm,
  useUnsavedChanges,
} from "./shared";
import {
  defaultPreferences,
  journeySections,
  journeyStatus,
  notificationGroups,
  type JourneyData,
  type JourneyItem,
  type JourneyKind,
  type Preferences,
} from "@/lib/workforce/journeys";
const colors = {
  goal: "border-sky-200 bg-sky-50",
  review: "border-violet-200 bg-violet-50",
  appeal: "border-amber-200 bg-amber-50",
  advance: "border-emerald-200 bg-emerald-50",
  asset: "border-blue-200 bg-blue-50",
  onboarding: "border-teal-200 bg-teal-50",
  policy: "border-indigo-200 bg-indigo-50",
  preferences: "border-slate-200 bg-white",
};
const actions: Record<string, string> = {
  create: "إضافة",
  progress: "تحديث الإنجاز",
  self_review: "التقييم الذاتي",
  submit: "إرسال للاعتماد",
  approve: "اعتماد",
  return: "إعادة للتعديل",
  reject: "رفض المراجعة",
  repay: "تسجيل سداد",
  request_return: "طلب إرجاع",
  receive: "تأكيد الاستلام",
  publish: "نشر السياسة",
  acknowledge: "إقرار",
  check: "تحديث خطوة",
  appeal_accepted: "قبول مراجعة التقييم",
};
const date = (s: string) =>
  new Date(s.length === 10 ? s + "T12:00:00+03:00" : s).toLocaleDateString(
    "ar-SA",
    { calendar: "gregory", timeZone: "Asia/Riyadh" },
  );
const money = (v: number) =>
  Number(v).toLocaleString("ar-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export default function EmployeeJourneys({
  section,
  admin = false,
}: {
  section: JourneyKind;
  admin?: boolean;
}) {
  const [data, setData] = useState<JourneyData | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1),
    [filter, setFilter] = useState(""),
    [status, setStatus] = useState(""),
    [revision, setRevision] = useState(0),
    [loaded, setLoaded] = useState("");
  const [editor, setEditor] = useState<{
      command: string;
      id: string;
      row?: JourneyItem;
    } | null>(null),
    [fields, setFields] = useState<Record<string, string>>({}),
    [prefs, setPrefs] = useState<Preferences>(defaultPreferences),
    [prefDirty, setPrefDirty] = useState(false),
    [formDirty, setFormDirty] = useState(false);
  const lock = useRef(false),
    retry = useRef<{ signature: string; key: string } | null>(null),
    { confirm, confirmation } = useConfirm(),
    key = `${section}:${page}:${filter}:${status}:${revision}`,
    loading = key !== loaded;
  useUnsavedChanges(formDirty || prefDirty);
  useEffect(() => {
    const abort = new AbortController();
    api<JourneyData>(
      `/api/workforce/journeys?${new URLSearchParams({ kind: section, page: String(page), ...(filter ? { employee: filter } : {}), ...(status ? { status } : {}) })}`,
      { signal: abort.signal },
    )
      .then((r) => {
        setData(r);
        setPrefs(r.preferences.settings);
        setError("");
        setLoaded(key);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setLoaded(key);
        }
      });
    return () => abort.abort();
  }, [key, section, page, filter, status]);
  const update = (name: string, value: string) => {
    setFields((f) => ({ ...f, [name]: value }));
    setFormDirty(true);
  };
  function open(command: string, row?: JourneyItem) {
    setFields({
      employee_id: filter || data?.employees[0]?.id || "",
      title: "",
      details: "",
      due_on: "",
      target: "100",
      principal: "",
      installment: "0",
      checklist: "",
      response: row?.response || "",
      progress: String(row?.progress || 0),
      score: String(row?.score || 3),
      self_score: String(row?.self_score || 3),
      note: "",
      amount: "",
      parent_id: data?.reviews[0]?.id || "",
      source_request: "",
    });
    setEditor({ command, row, id: row?.id || crypto.randomUUID() });
    retry.current = null;
    setFormDirty(false);
    setError("");
    setMessage("");
  }
  async function close() {
    if (busy) return;
    if (formDirty && !(await confirm("تجاهل التعديلات غير المحفوظة؟"))) return;
    setEditor(null);
    setFormDirty(false);
  }
  async function send(
    command: string,
    row: JourneyItem | undefined,
    payload: Record<string, unknown>,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const id = row?.id || editor?.id || crypto.randomUUID();
      const signature = JSON.stringify({
        id,
        version: row?.version || 0,
        command,
        payload,
      });
      if (retry.current?.signature !== signature)
        retry.current = { signature, key: crypto.randomUUID() };
      await api("/api/workforce/journeys", {
        method: "POST",
        body: JSON.stringify({
          id,
          version: row?.version || 0,
          command,
          payload,
          request_key: retry.current.key,
        }),
      });
      setEditor(null);
      retry.current = null;
      setFormDirty(false);
      setMessage("تم الحفظ");
      setRevision((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const { command, row } = editor;
    let payload: Record<string, unknown> = {};
    if (command === "create") {
      payload = { kind: section, title: fields.title, details: fields.details };
      if (section === "appeal") {
        payload.parent_id = fields.parent_id;
        payload.title = (
          "مراجعة: " +
          (data?.reviews.find((r) => r.id === fields.parent_id)?.title ||
            "التقييم")
        ).slice(0, 150);
      } else {
        if (section !== "policy") payload.employee_id = fields.employee_id;
        if (fields.due_on) payload.due_on = fields.due_on;
        if (section === "goal") payload.target = fields.target;
        if (section === "onboarding")
          payload.checklist = fields.checklist
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        if (section === "advance") {
          payload.principal = fields.principal;
          payload.installment = fields.installment;
          if (fields.source_request)
            payload.source_request = fields.source_request;
        }
      }
    } else if (command === "progress")
      payload = { progress: fields.progress, response: fields.response };
    else if (command === "self_review")
      payload = {
        self_score: Number(fields.self_score),
        response: fields.response,
      };
    else if (command === "submit" || command === "request_return")
      payload = { response: fields.response };
    else if (command === "repay")
      payload = { amount: fields.amount, note: fields.note };
    else {
      payload = { note: fields.note };
      if (command === "approve" && section === "review")
        payload.score = Number(fields.score);
    }
    await send(command, row, payload);
  }
  const field = (
    name: string,
    label: string,
    opts: {
      type?: string;
      required?: boolean;
      min?: number;
      max?: number;
      step?: string;
      textarea?: boolean;
    } = {},
  ) => (
    <Field id={`journey-${name}`} label={label}>
      {opts.textarea ? (
        <textarea
          id={`journey-${name}`}
          className={controlClass + " min-h-28"}
          value={fields[name] || ""}
          onChange={(e) => update(name, e.target.value)}
          required={opts.required}
          maxLength={10000}
        />
      ) : (
        <input
          id={`journey-${name}`}
          className={controlClass}
          type={opts.type || "text"}
          value={fields[name] || ""}
          onChange={(e) => update(name, e.target.value)}
          required={opts.required}
          min={opts.min}
          max={opts.max}
          step={opts.step}
          maxLength={name === "title" ? 150 : undefined}
        />
      )}
    </Field>
  );
  const scoreField = (name: string, label: string) => (
    <Field id={`journey-${name}`} label={label}>
      <select
        id={`journey-${name}`}
        className={controlClass}
        value={fields[name]}
        onChange={(e) => update(name, e.target.value)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n} / 5
          </option>
        ))}
      </select>
    </Field>
  );
  const active = (row: JourneyItem) =>
    ["active", "changes"].includes(row.status);
  const button = (command: string, row: JourneyItem, label?: string) => (
    <Button
      size="sm"
      disabled={busy || loading}
      onClick={() => open(command, row)}
    >
      {label || actions[command]}
    </Button>
  );
  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-5 p-4 md:p-8">
      {confirmation}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-dark">
          {journeySections[section].title}
        </h1>
        <div className="flex flex-wrap gap-2">
          {section !== "preferences" &&
            ((admin && section !== "appeal") ||
              (!admin && section === "appeal")) && (
              <Button
                disabled={
                  loading ||
                  busy ||
                  (section === "appeal" && !data?.reviews.length)
                }
                onClick={() => open("create")}
              >
                {section === "appeal" ? "طلب مراجعة" : "إضافة"}
              </Button>
            )}
          {section === "advance" && !admin && (
            <Link
              className="rounded-xl bg-dark px-4 py-3 text-sm font-bold text-white"
              href="/employee/requests/advance"
            >
              طلب سلفة
            </Link>
          )}
          <Button
            variant="outline"
            disabled={busy || loading || prefDirty}
            onClick={() => setRevision((n) => n + 1)}
          >
            تحديث
          </Button>
        </div>
      </header>
      {admin && (
        <nav aria-label="شؤون الفريق" className="flex flex-wrap gap-2">
          {Object.entries(journeySections).map(([k, v]) => (
            <Link
              key={k}
              className={`rounded-xl border px-3 py-2 text-sm font-bold ${section === k ? "bg-dark text-white" : "bg-white text-dark"}`}
              href={`/admin/workforce/people?section=${k}`}
            >
              {v.title}
            </Link>
          ))}
        </nav>
      )}
      <Notice message={error} error />
      <Notice message={message} />
      {section === "preferences" ? (
        <section
          className="rounded-2xl border bg-white p-4 sm:p-6"
          aria-label="قنوات التنبيه"
        >
          <div className="grid grid-cols-[1fr_5rem_5rem] gap-2 border-b pb-3 text-sm font-bold">
            <span>التنبيه</span>
            <span>داخل اللوحة</span>
            <span>البريد</span>
          </div>
          {Object.entries(notificationGroups).map(([group, label]) => (
            <div
              key={group}
              className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 border-b py-4"
            >
              <strong className="text-sm">{label}</strong>
              {(["inbox", "email"] as const).map((channel) => (
                <input
                  key={channel}
                  aria-label={`${label} — ${channel === "inbox" ? "داخل اللوحة" : "البريد"}`}
                  type="checkbox"
                  className="h-5 w-5 accent-[#102b57]"
                  disabled={busy || loading}
                  checked={prefs[group as keyof Preferences][channel]}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setPrefs((p) => ({
                      ...p,
                      [group]: {
                        ...p[group as keyof Preferences],
                        [channel]: checked,
                      },
                    }));
                    setPrefDirty(true);
                  }}
                />
              ))}
            </div>
          ))}
          <Button
            className="mt-5"
            disabled={!prefDirty || busy || loading}
            onClick={async () => {
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              setError("");
              try {
                await api("/api/workforce/journeys", {
                  method: "POST",
                  body: JSON.stringify({
                    command: "preferences",
                    version: data?.preferences.version || 0,
                    settings: prefs,
                  }),
                });
                setPrefDirty(false);
                setMessage("تم حفظ التفضيلات");
                setRevision((n) => n + 1);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            حفظ التفضيلات
          </Button>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            {admin && section !== "policy" && (
              <select
                aria-label="الموظفة"
                className={controlClass + " sm:max-w-64"}
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">كل الموظفات</option>
                {data?.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </select>
            )}
            <select
              aria-label="حالة السجلات"
              className={controlClass + " sm:max-w-56"}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">كل الحالات</option>
              {Object.entries(journeyStatus).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {loading ? (
            <p role="status">جارٍ التحميل…</p>
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {data?.items.map((row) => (
                <article
                  key={row.id}
                  className={`min-w-0 rounded-2xl border p-5 shadow-sm ${colors[section]}`}
                >
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-black text-dark">{row.title}</h2>
                      {admin && row.employee_id && (
                        <p className="mt-1 text-sm text-muted">
                          {
                            data.employees.find((e) => e.id === row.employee_id)
                              ?.full_name
                          }
                        </p>
                      )}
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold">
                      {journeyStatus[row.status]}
                    </span>
                  </header>
                  {row.due_on && (
                    <time className="mt-3 block text-xs text-muted">
                      {date(row.due_on)}
                    </time>
                  )}
                  {row.details && (
                    <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">
                      {row.details}
                    </p>
                  )}
                  {section === "goal" && (
                    <div className="mt-4">
                      <div className="mb-2 flex justify-between text-sm">
                        <strong>
                          {Number(row.progress)} / {Number(row.target)}
                        </strong>
                        <span>
                          {Math.round(
                            (Number(row.progress) / Number(row.target)) * 100,
                          )}
                          %
                        </span>
                      </div>
                      <progress
                        className="h-2 w-full accent-sky-700"
                        max={Number(row.target)}
                        value={Number(row.progress)}
                        aria-label={`إنجاز ${row.title}`}
                      />
                    </div>
                  )}
                  {section === "review" && (
                    <div className="mt-4 flex flex-wrap gap-3 text-sm">
                      {row.self_score && (
                        <span className="rounded-lg bg-white p-3">
                          التقييم الذاتي <b>{row.self_score} / 5</b>
                        </span>
                      )}
                      {row.score && (
                        <span className="rounded-lg bg-white p-3">
                          تقييم المدير <b>{row.score} / 5</b>
                        </span>
                      )}
                    </div>
                  )}
                  {section === "advance" && (
                    <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      {[
                        ["مبلغ السلفة", row.principal],
                        ["المسدد", row.repaid],
                        ["المتبقي", Number(row.principal) - Number(row.repaid)],
                        ["القسط", row.installment],
                      ].map(([label, n]) => (
                        <div
                          key={String(label)}
                          className="rounded-xl bg-white/80 p-3"
                        >
                          <dt className="text-xs text-muted">{label}</dt>
                          <dd className="mt-2 font-black">
                            {money(Number(n))} ر.س
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {section === "onboarding" && (
                    <ul className="mt-4 space-y-2">
                      {row.checklist.map((item) => (
                        <li key={item.id}>
                          <label className="flex items-start gap-3 rounded-xl bg-white/70 p-3 text-sm">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 accent-teal-700"
                              checked={item.done}
                              disabled={busy || loading || !active(row)}
                              onChange={(e) =>
                                void send("check", row, {
                                  item_id: item.id,
                                  done: e.target.checked,
                                })
                              }
                            />
                            <span>{item.title}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  {row.response && (
                    <div className="mt-4 rounded-xl bg-white/80 p-3">
                      <h3 className="mb-1 text-xs font-bold">
                        {section === "review"
                          ? "التقييم الذاتي"
                          : "تحديث الموظفة"}
                      </h3>
                      <p className="whitespace-pre-wrap break-words text-sm leading-7">
                        {row.response}
                      </p>
                    </div>
                  )}
                  {row.admin_note && (
                    <div className="mt-3 rounded-xl border border-white bg-white/60 p-3">
                      <h3 className="mb-1 text-xs font-bold">
                        {section === "review"
                          ? "تقييم المدير وخطة التطوير"
                          : "قرار المدير"}
                      </h3>
                      <p className="whitespace-pre-wrap break-words text-sm leading-7">
                        {row.admin_note}
                      </p>
                    </div>
                  )}
                  {section === "policy" && (
                    <p className="mt-4 text-xs font-bold">
                      {admin
                        ? `${data.receipts.filter((r) => r.item_id === row.id).length} إقرار اطلاع`
                        : data.receipts.some(
                              (r) =>
                                r.item_id === row.id &&
                                r.user_id === data.userId,
                            )
                          ? "تم إقرار الاطلاع"
                          : "بانتظار إقرارك"}
                    </p>
                  )}
                  <div className="mt-5 flex flex-wrap gap-2">
                    {!admin && section === "goal" && active(row) && (
                      <>
                        {button("progress", row)}
                        {button("submit", row)}
                      </>
                    )}
                    {!admin &&
                      section === "review" &&
                      active(row) &&
                      button("self_review", row)}
                    {!admin &&
                      section === "review" &&
                      row.status === "published" && (
                        <Link
                          className="rounded-lg border bg-white px-4 py-2 text-sm font-bold"
                          href="/employee/requests/performance-review"
                        >
                          طلب مراجعة
                        </Link>
                      )}
                    {!admin &&
                      section === "onboarding" &&
                      active(row) &&
                      row.checklist.every((c) => c.done) &&
                      button("submit", row)}
                    {admin &&
                      ["goal", "review", "onboarding", "appeal"].includes(
                        section,
                      ) &&
                      ["submitted", "pending"].includes(row.status) && (
                        <>
                          {button(
                            "approve",
                            row,
                            section === "appeal" ? "قبول المراجعة" : "اعتماد",
                          )}
                          {button(
                            section === "appeal" ? "reject" : "return",
                            row,
                          )}
                        </>
                      )}
                    {admin &&
                      section === "advance" &&
                      row.status === "active" &&
                      button("repay", row)}
                    {!admin &&
                      section === "asset" &&
                      row.status === "active" && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void send("acknowledge", row, {})}
                        >
                          استلام العهدة
                        </Button>
                      )}
                    {!admin &&
                      section === "asset" &&
                      row.status === "approved" &&
                      button("request_return", row)}
                    {admin &&
                      section === "asset" &&
                      row.status === "return_requested" &&
                      button("receive", row)}
                    {admin &&
                      section === "policy" &&
                      row.status === "active" && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void send("publish", row, {})}
                        >
                          نشر السياسة
                        </Button>
                      )}
                    {!admin &&
                      section === "policy" &&
                      row.status === "published" &&
                      !data.receipts.some(
                        (r) =>
                          r.item_id === row.id && r.user_id === data.userId,
                      ) && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void send("acknowledge", row, {})}
                        >
                          إقرار الاطلاع
                        </Button>
                      )}
                  </div>
                  <details className="mt-4 border-t border-current/10 pt-3">
                    <summary className="cursor-pointer text-xs font-bold">
                      السجل
                    </summary>
                    <ul className="mt-3 space-y-2">
                      {data.events
                        .filter((e) => e.item_id === row.id)
                        .map((e) => (
                          <li
                            key={e.id}
                            className="rounded-lg bg-white/60 p-3 text-xs"
                          >
                            <div className="flex justify-between gap-3">
                              <strong>
                                {actions[e.action] || e.action}
                                {e.amount ? ` · ${money(e.amount)} ر.س` : ""}
                              </strong>
                              <time>{date(e.created_at)}</time>
                            </div>
                            {e.note && (
                              <p className="mt-2 whitespace-pre-wrap leading-6">
                                {e.note}
                              </p>
                            )}
                          </li>
                        ))}
                    </ul>
                  </details>
                </article>
              ))}
            </div>
          )}
          {!loading && !data?.items.length && (
            <p className="rounded-2xl border bg-white p-6 text-sm text-muted">
              لا توجد سجلات
            </p>
          )}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page <= 1}
              onClick={() => setPage((n) => n - 1)}
            >
              السابق
            </Button>
            <span className="text-sm">
              {page} / {Math.max(1, Math.ceil((data?.count || 0) / 20))}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={
                loading ||
                page >= Math.max(1, Math.ceil((data?.count || 0) / 20))
              }
              onClick={() => setPage((n) => n + 1)}
            >
              التالي
            </Button>
          </div>
        </>
      )}
      <Dialog
        title={
          editor
            ? editor.command === "create"
              ? section === "appeal"
                ? "طلب مراجعة"
                : "إضافة — " + journeySections[section].title
              : actions[editor.command]
            : ""
        }
        open={!!editor}
        onClose={() => void close()}
      >
        <form onSubmit={save} className="space-y-4">
          <Notice message={error} error />
          {editor?.command === "create" ? (
            <>
              {section === "appeal" ? (
                <>
                  <Field id="journey-parent_id" label="التقييم">
                    <select
                      id="journey-parent_id"
                      className={controlClass}
                      value={fields.parent_id}
                      onChange={(e) => update("parent_id", e.target.value)}
                      required
                    >
                      {data?.reviews.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {field("details", "سبب المراجعة والدليل", {
                    textarea: true,
                    required: true,
                  })}
                </>
              ) : (
                <>
                  {admin && section !== "policy" && (
                    <Field id="journey-employee_id" label="الموظفة">
                      <select
                        id="journey-employee_id"
                        className={controlClass}
                        value={fields.employee_id}
                        onChange={(e) => update("employee_id", e.target.value)}
                        required
                      >
                        {data?.employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.full_name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {section === "advance" && !!data?.advanceRequests.length && (
                    <Field id="journey-source_request" label="طلب معتمد">
                      <select
                        id="journey-source_request"
                        className={controlClass}
                        value={fields.source_request}
                        onChange={(e) => {
                          const r = data.advanceRequests.find(
                            (r) => r.id === e.target.value,
                          );
                          update("source_request", e.target.value);
                          if (r)
                            setFields((f) => ({
                              ...f,
                              employee_id: r.employee_id,
                              principal: String(r.amount),
                              title: r.title,
                            }));
                        }}
                      >
                        <option value="">سلفة مباشرة</option>
                        {data.advanceRequests.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title} · {money(r.amount)} ر.س
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {field(
                    "title",
                    section === "asset" ? "اسم العهدة ورقمها" : "العنوان",
                    { required: true },
                  )}
                  {field(
                    "details",
                    section === "policy"
                      ? "نص السياسة"
                      : section === "review"
                        ? "معايير التقييم"
                        : "التفاصيل",
                    { textarea: true, required: section === "policy" },
                  )}
                  {["goal", "review", "onboarding", "asset"].includes(
                    section,
                  ) &&
                    field(
                      "due_on",
                      section === "asset" ? "موعد الإعادة" : "الموعد",
                      { type: "date" },
                    )}
                  {section === "goal" &&
                    field("target", "المستهدف", {
                      type: "number",
                      min: 0.01,
                      step: "0.01",
                      required: true,
                    })}
                  {section === "advance" && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {field("principal", "مبلغ السلفة", {
                        type: "number",
                        min: 0.01,
                        step: "0.01",
                        required: true,
                      })}
                      {field("installment", "القسط", {
                        type: "number",
                        min: 0,
                        step: "0.01",
                        required: true,
                      })}
                    </div>
                  )}
                  {section === "onboarding" &&
                    field("checklist", "الخطوات — كل خطوة في سطر", {
                      textarea: true,
                      required: true,
                    })}
                </>
              )}
            </>
          ) : editor?.command === "progress" ? (
            <>
              {field("progress", "المنجز", {
                type: "number",
                min: 0,
                max: Number(editor.row?.target),
                step: "0.01",
                required: true,
              })}
              {field("response", "النتيجة والدليل", { textarea: true })}
            </>
          ) : editor?.command === "self_review" ? (
            <>
              {scoreField("self_score", "التقييم الذاتي")}
              {field("response", "النتائج وخطة التطوير", {
                textarea: true,
                required: true,
              })}
            </>
          ) : editor?.command === "submit" ||
            editor?.command === "request_return" ? (
            field(
              "response",
              editor.command === "submit"
                ? "ملخص الإنجاز"
                : "سبب الإرجاع وحالة العهدة",
              { textarea: true, required: true },
            )
          ) : editor?.command === "repay" ? (
            <>
              {field("amount", "مبلغ السداد", {
                type: "number",
                min: 0.01,
                max: Number(editor.row?.principal) - Number(editor.row?.repaid),
                step: "0.01",
                required: true,
              })}
              {field("note", "مرجع السداد", { required: true })}
            </>
          ) : (
            <>
              {editor?.command === "approve" &&
                section === "review" &&
                scoreField("score", "تقييم المدير")}
              {field(
                "note",
                section === "review" ? "القرار وخطة التطوير" : "القرار",
                { textarea: true, required: true },
              )}
            </>
          )}
          <div className="flex gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
            <Button
              variant="outline"
              type="button"
              disabled={busy}
              onClick={() => void close()}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

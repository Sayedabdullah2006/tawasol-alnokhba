"use client";
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import DateInput from "./DateInput";
import { dateField } from "@/lib/workforce/validation";
import { workDate } from "@/lib/workforce/task-types";
import {
  api,
  controlClass,
  Dialog,
  Field,
  Notice,
  Panel,
  useConfirm,
  useUnsavedChanges,
} from "./shared";

type Entry = {
  id: string;
  version: number;
  starts_at: string;
  ends_at: string | null;
  note: string;
  archived_at: string | null;
  employeeName: string;
  canEdit: boolean;
  canArchive: boolean;
};
type TimePage = {
  page: number;
  archived: boolean;
  entries: Entry[];
  summary: { seconds: number; entries: number; running: number };
  admin: boolean;
  canRecord: boolean;
  estimateMinutes: number | null;
  count: number;
};
type Revision = {
  version: number;
  starts_at: string;
  ends_at: string | null;
  note: string;
  action: string;
  reason: string;
  actorName: string;
  created_at: string;
};
const actions: Record<string, string> = {
  create: "تسجيل الوقت",
  edit: "تصحيح الوقت",
  archive: "أرشفة الوقت",
  restore: "استعادة الوقت",
};
const localDateTime = (value: string | null) =>
  value
    ? new Date(new Date(value).getTime() + 3 * 3600000)
        .toISOString()
        .slice(0, 16)
    : "";
const minutes = (seconds: number) =>
  new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(
    seconds / 60,
  );
const emptyForm = { date: "", clock: "", duration: "", note: "", reason: "" };

function History({ taskId, entryId }: { taskId: string; entryId: string }) {
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<{
    revisions: Revision[];
    count: number;
    page: number;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    api<{ revisions: Revision[]; count: number; page: number }>(
      `/api/workforce/tasks/${taskId}/time?entry_id=${entryId}&page=${page}`,
      { signal: abort.signal },
    )
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [taskId, entryId, page, reload]);
  return (
    <div className="space-y-4">
      <Notice message={error} error />
      <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
        تحديث تاريخ الوقت
      </Button>
      {!data || data.page !== page ? (
        <p role="status">جارٍ تحميل التاريخ…</p>
      ) : (
        <>
          <ol className="space-y-4">
            {data.revisions.map((row) => (
              <li
                key={row.version}
                className="rounded-xl border border-border p-3 break-words"
              >
                <p className="font-bold">
                  {actions[row.action]} · نسخة {row.version} · {row.actorName}
                </p>
                <p>
                  {workDate(row.starts_at)} ← {workDate(row.ends_at)}
                </p>
                <p className="whitespace-pre-wrap">{row.note}</p>
                <p>السبب: {row.reason}</p>
                <p className="text-xs text-muted">{workDate(row.created_at)}</p>
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((n) => n - 1)}
            >
              نسخ أحدث
            </Button>
            <span>صفحة {page}</span>
            <Button
              variant="outline"
              disabled={page * 20 >= data.count}
              onClick={() => setPage((n) => n + 1)}
            >
              نسخ أقدم
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default function TaskTime({
  taskId,
  taskVersion,
  onChanged,
}: {
  taskId: string;
  taskVersion: number;
  onChanged: () => void;
}) {
  const [data, setData] = useState<TimePage | null>(null);
  const [page, setPage] = useState(1);
  const [archived, setArchived] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{
    command: "create" | "edit" | "archive";
    entry: Entry | null;
    id: string;
  } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [original, setOriginal] = useState(JSON.stringify(emptyForm));
  const [history, setHistory] = useState<string | null>(null);
  const lock = useRef(false);
  const retry = useRef({ payload: "", key: "" });
  const dirty = !!editing && JSON.stringify(form) !== original;
  const unsaved = useUnsavedChanges(dirty);
  const { confirm, confirmation } = useConfirm();
  useEffect(() => {
    const abort = new AbortController();
    api<TimePage>(
      `/api/workforce/tasks/${taskId}/time?page=${page}&archived=${archived}`,
      { signal: abort.signal },
    )
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          if ([401, 403, 404].includes(e.status)) setData(null);
        }
      });
    return () => abort.abort();
  }, [taskId, taskVersion, page, archived, reload]);
  const open = (
    command: "create" | "edit" | "archive",
    entry: Entry | null = null,
  ) => {
    const next = entry
      ? {
          date: localDateTime(entry.starts_at).slice(0, 10),
          clock: localDateTime(entry.starts_at).slice(11),
          duration: entry.ends_at
            ? String(
                (Date.parse(entry.ends_at) - Date.parse(entry.starts_at)) /
                  60000,
              )
            : "",
          note: entry.note,
          reason: "",
        }
      : emptyForm;
    setForm(next);
    setOriginal(JSON.stringify(next));
    setError("");
    setEditing({ command, entry, id: entry?.id ?? crypto.randomUUID() });
  };
  const close = async () => {
    if (
      !busy &&
      (!dirty || (await confirm("تجاهل تغييرات الوقت غير المحفوظة؟")))
    )
      setEditing(null);
  };
  return (
    <Panel
      title="الوقت الفعلي"
      description="تسجيل اختياري لفترات العمل المنجزة بتوقيت الرياض. الوقت ليس حضورًا أو عملًا إضافيًا معتمدًا، ولا ينتج عنه راتب أو حسم تلقائي."
    >
      {unsaved}
      {confirmation}
      <Notice message={error} error />
      <Notice message={message} />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            تحديث سجل الوقت
          </Button>
          {data?.canRecord && (
            <Button onClick={() => open("create")}>تسجيل وقت عمل</Button>
          )}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => {
                setArchived(e.target.checked);
                setPage(1);
              }}
            />
            سجلات الوقت المؤرشفة
          </label>
        </div>
        {!data || data.page !== page || data.archived !== archived ? (
          <p role="status">جارٍ تحميل الوقت…</p>
        ) : (
          <>
            <p className="font-bold">
              {data.admin
                ? "إجمالي وقت الموظفين في المهمة"
                : "إجمالي وقتي في المهمة"}
              : {minutes(data.summary.seconds)} دقيقة · {data.summary.entries}{" "}
              سجل نشط
            </p>
            <p className="text-sm text-muted">
              الإجمالي يشمل كل الصفحات ويستبعد الأرشيف.{" "}
              {data.admin
                ? `التقدير للمهمة كاملة: ${data.estimateMinutes ?? "غير محدد"}${data.estimateMinutes === null ? "" : " دقيقة"}.`
                : "ترى فتراتك فقط؛ المدير يرى سجلات المنفذين. التقدير في تفاصيل التكليف يخص المهمة كاملة."}
            </p>
            {data.summary.running > 0 && (
              <p>يوجد مؤقت سابق مفتوح؛ لا يدخل في الإجمالي حتى توثيق نهايته.</p>
            )}
            <p className="text-sm">{data.count} سجل يطابق العرض</p>
            {!data.entries.length && <p>لا توجد فترات وقت في هذا العرض.</p>}
            <ul className="space-y-3">
              {data.entries.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-border p-4 space-y-2 break-words"
                >
                  <p className="font-bold">
                    {row.employeeName} ·{" "}
                    {row.ends_at
                      ? `${minutes((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 1000)} دقيقة`
                      : "فترة مفتوحة"}
                  </p>
                  <p className="text-sm">
                    {workDate(row.starts_at)} ← {workDate(row.ends_at)}
                  </p>
                  <p className="whitespace-pre-wrap">{row.note}</p>
                  <div className="flex flex-wrap gap-2">
                    {row.canEdit && (
                      <Button
                        variant="outline"
                        onClick={() => open("edit", row)}
                      >
                        تصحيح الوقت
                      </Button>
                    )}
                    {row.canArchive && (
                      <Button
                        variant="outline"
                        onClick={() => open("archive", row)}
                      >
                        {row.archived_at ? "استعادة الوقت" : "أرشفة الوقت"}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setHistory(row.id)}
                    >
                      تاريخ الوقت
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((n) => n - 1)}
              >
                وقت أحدث
              </Button>
              <span>صفحة {page}</span>
              <Button
                variant="outline"
                disabled={page * 20 >= data.count}
                onClick={() => setPage((n) => n + 1)}
              >
                وقت أقدم
              </Button>
            </div>
          </>
        )}
      </div>
      <Dialog
        title={
          editing?.command === "archive"
            ? editing.entry?.archived_at
              ? "استعادة سجل الوقت"
              : "أرشفة سجل الوقت"
            : editing?.command === "edit"
              ? "تصحيح فترة العمل"
              : "تسجيل فترة عمل"
        }
        open={!!editing}
        onClose={close}
      >
        {editing && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              setError("");
              try {
                if (editing.command !== "archive") dateField(form.date);
                const starts = new Date(`${form.date}T${form.clock}:00+03:00`);
                const payload =
                  editing.command === "archive"
                    ? {
                        entry_id: editing.id,
                        archived: !editing.entry?.archived_at,
                        reason: form.reason,
                      }
                    : {
                        entry_id: editing.id,
                        starts_at: starts.toISOString(),
                        ends_at: new Date(
                          starts.getTime() + Number(form.duration) * 60000,
                        ).toISOString(),
                        note: form.note,
                        ...(editing.command === "edit"
                          ? { reason: form.reason }
                          : {}),
                      };
                const envelope = {
                  id: taskId,
                  command: editing.command,
                  version: editing.entry?.version ?? null,
                  payload,
                };
                const serialized = JSON.stringify(envelope);
                if (retry.current.payload !== serialized)
                  retry.current = {
                    payload: serialized,
                    key: crypto.randomUUID(),
                  };
                await api("/api/workforce/time", {
                  method: "POST",
                  body: JSON.stringify({
                    ...envelope,
                    request_key: retry.current.key,
                  }),
                });
                setEditing(null);
                setMessage("تم حفظ سجل الوقت وتحديث الإجمالي");
                setReload((n) => n + 1);
                onChanged();
              } catch (e) {
                setError(
                  e instanceof RangeError
                    ? "أدخل فترة عمل صحيحة"
                    : (e as Error).message,
                );
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            <Notice message={error} error />
            {editing.command !== "archive" && (
              <>
                <DateInput
                  id="work-time-date"
                  label="تاريخ بداية العمل"
                  required
                  value={form.date}
                  onChange={(date) => setForm({ ...form, date })}
                />
                <Field
                  label="وقت البداية — الرياض (24 ساعة)"
                  id="work-time-clock"
                >
                  <input
                    id="work-time-clock"
                    dir="ltr"
                    placeholder="09:30"
                    pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                    required
                    className={controlClass}
                    value={form.clock}
                    disabled={busy}
                    onChange={(e) =>
                      setForm({ ...form, clock: e.target.value })
                    }
                  />
                </Field>
                <Field label="مدة العمل بالدقائق" id="work-time-duration">
                  <input
                    id="work-time-duration"
                    type="number"
                    min="1"
                    max="1440"
                    step="any"
                    required
                    className={controlClass}
                    value={form.duration}
                    disabled={busy}
                    onChange={(e) =>
                      setForm({ ...form, duration: e.target.value })
                    }
                  />
                </Field>
                <Field label="وصف العمل المنجز" id="work-time-note">
                  <textarea
                    id="work-time-note"
                    required
                    minLength={3}
                    maxLength={2000}
                    className={controlClass}
                    value={form.note}
                    disabled={busy}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </Field>
              </>
            )}
            {editing.command !== "create" && (
              <Field label="سبب تعديل سجل الوقت" id="work-time-reason">
                <textarea
                  id="work-time-reason"
                  required
                  minLength={3}
                  maxLength={1000}
                  className={controlClass}
                  value={form.reason}
                  disabled={busy}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
              </Field>
            )}

            <Button type="submit" disabled={busy}>
              حفظ سجل الوقت
            </Button>
          </form>
        )}
      </Dialog>
      <Dialog
        title="تاريخ سجل الوقت"
        open={!!history}
        onClose={() => setHistory(null)}
      >
        {history && <History key={history} taskId={taskId} entryId={history} />}
      </Dialog>
    </Panel>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import PdfAttachmentPreview from "./PdfAttachmentPreview";
import {
  MAX_TASK_ATTACHMENT_BYTES,
  TASK_ATTACHMENT_INLINE_MIMES,
  type AttachmentList,
  type TaskAttachment,
} from "@/lib/workforce/attachments";
import { workDate } from "@/lib/workforce/task-types";
import {
  api,
  Dialog,
  Field,
  Notice,
  Panel,
  useConfirm,
  useUnsavedChanges,
} from "./shared";

function FileActions({ file }: { file: TaskAttachment }) {
  const [preview, setPreview] = useState(false);
  const endpoint = `/api/workforce/attachments/${file.id}`;
  const image = file.mime_type.startsWith("image/");
  const previewable = TASK_ATTACHMENT_INLINE_MIMES.includes(file.mime_type);
  return (
    <>
      <div className="flex flex-wrap gap-3 text-sm">
        {previewable && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`معاينة ${file.filename}`}
            onClick={() => setPreview(true)}
          >
            معاينة
          </Button>
        )}
        <a
          className="rounded-xl border border-border px-3 py-2 font-bold"
          href={endpoint}
          download={file.filename}
          aria-label={`تنزيل ${file.filename}`}
        >
          تنزيل
        </a>
      </div>
      <Dialog
        title={`معاينة — ${file.filename}`}
        open={preview}
        onClose={() => setPreview(false)}
      >
        {preview && (
          <div className="space-y-3">
            {image /* Authenticated images are intentionally served through our private route. */ ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${endpoint}?preview=true`}
                alt={file.title}
                className="mx-auto max-h-[65dvh] max-w-full object-contain"
              />
            ) : (
              <PdfAttachmentPreview url={`${endpoint}?preview=true`} />
            )}
            {image && (
              <a
                href={`${endpoint}?preview=true`}
                target="_blank"
                rel="noopener noreferrer"
                className="block font-bold underline"
              >
                فتح المعاينة في نافذة جديدة
              </a>
            )}
            <a
              href={endpoint}
              download={file.filename}
              className="block font-bold underline"
            >
              تنزيل الملف الأصلي
            </a>
          </div>
        )}
      </Dialog>
    </>
  );
}

export default function TaskAttachments({
  taskId,
  submissionId,
  version,
  canWork = false,
  frozen = false,
  disabled = false,
  selected = [],
  onSelected,
  onBusy,
  onPendingChange,
  onChanged,
  reviewMode = false,
}: {
  taskId: string;
  submissionId?: string;
  version: number;
  canWork?: boolean;
  frozen?: boolean;
  disabled?: boolean;
  selected?: string[];
  onSelected?: (ids: string[]) => void;
  onBusy?: (busy: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  onChanged?: () => void;
  reviewMode?: boolean;
}) {
  const [data, setData] = useState<AttachmentList | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [page, setPage] = useState(1),
    [archived, setArchived] = useState(false),
    [revision, setRevision] = useState(0);
  const [pending, setPending] = useState<{ file: File; key: string }[]>([]),
    [purpose, setPurpose] = useState(reviewMode ? "task" : "delivery"),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState("");
  const input = useRef<HTMLInputElement>(null),
    lock = useRef(false);
  const { confirm, confirmation } = useConfirm();
  const unsaved = useUnsavedChanges(pending.length > 0 || busy);
  useEffect(() => {
    onPendingChange?.(pending.length > 0);
    return () => onPendingChange?.(false);
  }, [pending.length, onPendingChange]);
  const canUpload = !submissionId && canWork && !frozen && data?.canUpload;
  useEffect(() => {
    const abort = new AbortController();
    api<AttachmentList>(
      `/api/workforce/tasks/${taskId}/attachments?page=${page}&archived=${archived}${submissionId ? `&submission_id=${submissionId}` : ""}`,
      { signal: abort.signal },
    )
      .then((result) => {
        setData(result);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setData(null);
          setError(e.message);
        }
      });
    return () => abort.abort();
  }, [taskId, submissionId, page, archived, revision, version]);
  const change = () => {
    setRevision((n) => n + 1);
    onChanged?.();
  };
  async function upload() {
    if (lock.current || !pending.length) return;
    lock.current = true;
    setBusy(true);
    onBusy?.(true);
    setError("");
    setMessage("");
    try {
      let chosen = [...selected];
      for (let i = 0; i < pending.length; i++) {
        const item = pending[i];
        setProgress(
          `رفع الملف ${i + 1} من ${pending.length}: ${item.file.name}`,
        );
        const form = new FormData();
        form.set("file", item.file);
        form.set("request_key", item.key);
        form.set("purpose", purpose);
        form.set("title", item.file.name.slice(0, 150));
        const result = await api<{ id: string }>(
          `/api/workforce/tasks/${taskId}/attachments`,
          { method: "POST", body: form },
        );
        setPending((current) => current.filter((p) => p.key !== item.key));
        if (
          purpose === "delivery" &&
          onSelected &&
          !chosen.includes(result.id) &&
          chosen.length < 20
        ) {
          chosen = [...chosen, result.id];
          onSelected(chosen);
        }
        change();
      }
      setMessage("تم رفع المرفقات");
      if (input.current) input.current.value = "";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy?.(false);
      lock.current = false;
      setProgress("");
    }
  }
  async function archive(file: TaskAttachment) {
    if (
      lock.current ||
      !(await confirm(
        file.archived_at
          ? "استعادة المرفق؟"
          : "أرشفة المرفق؟ يبقى محفوظًا في سجل المهمة.",
      ))
    )
      return;
    lock.current = true;
    setBusy(true);
    onBusy?.(true);
    setError("");
    try {
      await api(`/api/workforce/attachments/${file.id}`, {
        method: "PATCH",
        body: JSON.stringify({ archived: !file.archived_at }),
      });
      onSelected?.(selected.filter((id) => id !== file.id));
      change();
      setMessage(file.archived_at ? "تمت استعادة المرفق" : "تمت أرشفة المرفق");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy?.(false);
    }
  }
  const content = (
    <div className="space-y-4">
      {confirmation}
      {unsaved}
      <Notice message={error} error />
      <Notice message={message} />
      {!submissionId && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || disabled}
            onClick={() => change()}
          >
            تحديث المرفقات
          </Button>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={archived}
              disabled={busy || disabled}
              onChange={(e) => {
                setArchived(e.target.checked);
                setPage(1);
                setData(null);
              }}
            />
            إظهار المؤرشفة أيضًا
          </label>
        </div>
      )}
      {canUpload && (
        <form
          className="space-y-3 rounded-2xl border border-sky-200 bg-white/80 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void upload();
          }}
        >
          <Field id={`attachment-files-${taskId}`} label="جميع الصيغ — حتى 50 ميجابايت للملف">
            <input
              ref={input}
              id={`attachment-files-${taskId}`}
              type="file"
              multiple
              disabled={busy || disabled}
              className="block w-full min-w-0 rounded-xl border border-dashed border-sky-300 bg-white p-3 text-sm file:me-3 file:rounded-lg file:border-0 file:bg-sky-100 file:px-3 file:py-2 file:font-bold file:text-sky-900"
              onChange={(e) => {
                const files = [...(e.target.files || [])];
                setError("");
                if (
                  files.length > 20 ||
                  files.some(
                    (file) =>
                      file.size > MAX_TASK_ATTACHMENT_BYTES || file.size === 0,
                  )
                ) {
                  setError(
                    "اختر حتى 20 ملفًا، كل ملف غير فارغ وبحجم لا يتجاوز 50 ميجابايت",
                  );
                  e.target.value = "";
                  setPending([]);
                  return;
                }
                setPending(
                  files.map((file) => ({ file, key: crypto.randomUUID() })),
                );
              }}
            />
          </Field>
          {!reviewMode && <Field label="استخدام المرفقات" id={`attachment-purpose-${taskId}`}>
            <select
              id={`attachment-purpose-${taskId}`}
              className="w-full rounded-xl border p-2"
              value={purpose}
              disabled={busy || disabled}
              onChange={(e) => setPurpose(e.target.value)}
            >
              <option value="delivery">مرفقات التسليم</option>
              <option value="task">ملفات مرجعية للمهمة</option>
            </select>
          </Field>}
          {pending.length > 0 && (
            <ul className="space-y-1 text-sm">
              {pending.map((item) => (
                <li className="break-all" key={item.key}>
                  {item.file.name} — {(item.file.size / 1024).toFixed(1)}{" "}
                  كيلوبايت
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              loading={busy}
              disabled={disabled || !pending.length}
            >
              رفع المرفقات
            </Button>
            {!!pending.length && (
              <Button
                type="button"
                variant="outline"
                disabled={busy || disabled}
                onClick={() => {
                  setPending([]);
                  if (input.current) input.current.value = "";
                }}
              >
                مسح الاختيار
              </Button>
            )}
          </div>
          {progress && (
            <p role="status" className="break-all text-sm">
              {progress}
            </p>
          )}
        </form>
      )}
      {onSelected && canUpload && (
        <div className="space-y-2">
          <p className="text-sm font-bold">
            مرفقات التسليم: {selected.length} / 20
          </p>
          {selected.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || disabled}
              onClick={() => onSelected([])}
            >
              إلغاء التحديد
            </Button>
          )}
        </div>
      )}
      {!data && !error && <p role="status">جارٍ تحميل المرفقات…</p>}
      {data && (
        <>
          {!data.count && <p className="text-sm text-muted">لا توجد مرفقات</p>}
          <ul className="grid items-start gap-3 sm:grid-cols-2">
            {data.attachments.map((file) => (
              <li
                key={file.id}
                className="min-w-0 space-y-3 rounded-2xl border border-sky-100 bg-white p-4 text-sm"
              >
                <div className="min-w-0">
                  <p className="break-all font-bold">{file.title}</p>
                  <p className="break-all text-muted">
                    {file.title !== file.filename ? `${file.filename} · ` : ""}
                    {(file.size_bytes / 1024).toFixed(1)} كيلوبايت ·{" "}
                    {workDate(file.created_at)}
                  </p>
                  <p>
                    {file.purpose === "delivery" ? "نتيجة عمل" : "مرجع للمهمة"}
                    {file.sealed ? " · محفوظ مع تسليم" : ""}
                    {file.archived_at ? " · مؤرشف" : ""}
                  </p>
                </div>
                <FileActions file={file} />
                {!submissionId &&
                  canUpload &&
                  onSelected &&
                  !file.archived_at && (
                    <label className="flex gap-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(file.id)}
                        disabled={
                          busy ||
                          disabled ||
                          (!selected.includes(file.id) && selected.length >= 20)
                        }
                        onChange={(e) =>
                          onSelected(
                            e.target.checked
                              ? [...selected, file.id]
                              : selected.filter((id) => id !== file.id),
                          )
                        }
                      />
                      إرفاق بالتسليم
                    </label>
                  )}
                {file.canManage && !submissionId && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || disabled}
                    onClick={() => void archive(file)}
                  >
                    {file.archived_at ? "استعادة المرفق" : "أرشفة المرفق"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {data.count > 20 && (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={busy || disabled || page === 1}
                onClick={() => {
                  setPage((n) => n - 1);
                  setData(null);
                }}
              >
                مرفقات أحدث
              </Button>
              <span>صفحة {page}</span>
              <Button
                type="button"
                variant="outline"
                disabled={busy || disabled || page * 20 >= data.count}
                onClick={() => {
                  setPage((n) => n + 1);
                  setData(null);
                }}
              >
                مرفقات أقدم
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
  return submissionId ? (
    <div className="space-y-2">
      <h3 className="font-bold">مرفقات هذه المحاولة</h3>
      {content}
    </div>
  ) : (
    <Panel title="المرفقات" tone="sky">
      {content}
    </Panel>
  );
}

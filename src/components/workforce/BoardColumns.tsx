"use client";
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import {
  TASK_STATES,
  type BoardDetail,
  type TaskColumn,
} from "@/lib/workforce/task-types";
import {
  api,
  controlClass,
  Dialog,
  Field,
  Notice,
  useConfirm,
  useUnsavedChanges,
} from "./shared";

type ColumnDraft = {
  id: string;
  title: string;
  kind: TaskColumn["kind"];
  archived: boolean;
  saved: boolean;
};
const payloadOf = (columns: ColumnDraft[]) =>
  columns.map(({ id, title, kind, archived }) => ({
    id,
    title,
    kind,
    archived,
  }));
export default function BoardColumns({
  boardId,
  onClose,
  onSaved,
}: {
  boardId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [columns, setColumns] = useState<ColumnDraft[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [original, setOriginal] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const lock = useRef(false);
  const retry = useRef({ payload: "", key: "" });
  const { confirm, confirmation } = useConfirm();
  const dirty =
    version !== null && JSON.stringify(payloadOf(columns)) !== original;
  const unsaved = useUnsavedChanges(dirty);
  useEffect(() => {
    const abort = new AbortController();
    api<BoardDetail>(`/api/workforce/boards/${boardId}`, {
      signal: abort.signal,
    })
      .then((result) => {
        if (!result.canManage) throw new Error("تخصيص المراحل للمدير فقط");
        if (result.board.archived_at)
          throw new Error("استعد اللوحة قبل تعديل مراحلها");
        const next = result.columns.map((column) => ({
          id: column.id,
          title: column.title,
          kind: column.kind,
          archived: !!column.archived_at,
          saved: true,
        }));
        setColumns(next);
        setVersion(result.board.version);
        setOriginal(JSON.stringify(payloadOf(next)));
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
  }, [boardId, reload]);
  const close = async () => {
    if (
      !busy &&
      (!dirty || (await confirm("تجاهل تغييرات مراحل اللوحة غير المحفوظة؟")))
    )
      onClose();
  };
  const update = (id: string, patch: Partial<ColumnDraft>) =>
    setColumns((current) =>
      current.map((column) =>
        column.id === id ? { ...column, ...patch } : column,
      ),
    );
  const move = (index: number, offset: number) =>
    setColumns((current) => {
      const next = [...current];
      const target = index + offset;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const refresh = async () => {
    if (
      !dirty ||
      (await confirm("تحميل المراحل المحفوظة وتجاهل تعديلاتك الحالية؟"))
    ) {
      setLoading(true);
      setVersion(null);
      setReload((n) => n + 1);
    }
  };
  return (
    <>
      {confirmation}
      {unsaved}
      <Dialog title="مراحل لوحة العمل" open onClose={close}>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (lock.current || version === null) return;
            lock.current = true;
            setBusy(true);
            setError("");
            try {
              const payload = { columns: payloadOf(columns) };
              const serialized = JSON.stringify({ version, payload });
              if (retry.current.payload !== serialized)
                retry.current = {
                  payload: serialized,
                  key: crypto.randomUUID(),
                };
              await api("/api/workforce/columns", {
                method: "POST",
                body: JSON.stringify({
                  id: boardId,
                  version,
                  command: "save",
                  payload,
                  request_key: retry.current.key,
                }),
              });
              onSaved();
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          <Notice message={error} error />
          {loading ? (
            <p role="status">جارٍ تحميل المراحل…</p>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={refresh}
              >
                إعادة تحميل المراحل
              </Button>
              {version !== null && (
                <>
                  <ol className="space-y-4">
                    {columns.map((column, index) => (
                      <li
                        key={column.id}
                        className={`space-y-3 rounded-xl border border-border p-4 ${column.archived ? "bg-slate-100" : "bg-white"}`}
                      >
                        <p className="text-sm font-bold">
                          المرحلة {index + 1}
                          {column.archived ? " — مؤرشفة" : ""}
                          {!column.saved ? " — غير محفوظة" : ""}
                        </p>
                        <Field
                          label={`اسم المرحلة ${index + 1}`}
                          id={`column-title-${column.id}`}
                        >
                          <input
                            id={`column-title-${column.id}`}
                            className={controlClass}
                            required
                            maxLength={100}
                            disabled={busy}
                            value={column.title}
                            onChange={(e) =>
                              update(column.id, { title: e.target.value })
                            }
                          />
                        </Field>
                        <Field
                          label={`الحالة الأساسية للمرحلة ${index + 1}`}
                          id={`column-kind-${column.id}`}
                        >
                          <select
                            id={`column-kind-${column.id}`}
                            className={controlClass}
                            disabled={busy || column.saved}
                            value={column.kind}
                            onChange={(e) =>
                              update(column.id, {
                                kind: e.target.value as TaskColumn["kind"],
                              })
                            }
                          >
                            {Object.entries(TASK_STATES).map(
                              ([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </Field>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy || index === 0}
                            aria-label={`تقديم المرحلة ${index + 1}`}
                            onClick={() => move(index, -1)}
                          >
                            تقديم ↑
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy || index === columns.length - 1}
                            aria-label={`تأخير المرحلة ${index + 1}`}
                            onClick={() => move(index, 1)}
                          >
                            تأخير ↓
                          </Button>
                          {column.saved ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              aria-label={`${column.archived ? "استعادة" : "أرشفة"} المرحلة ${index + 1}`}
                              onClick={() =>
                                update(column.id, {
                                  archived: !column.archived,
                                })
                              }
                            >
                              {column.archived
                                ? "استعادة المرحلة"
                                : "أرشفة المرحلة"}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              aria-label={`إلغاء المرحلة ${index + 1}`}
                              onClick={() =>
                                setColumns((current) =>
                                  current.filter(
                                    (item) => item.id !== column.id,
                                  ),
                                )
                              }
                            >
                              إلغاء المرحلة الجديدة
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || columns.length >= 100}
                      onClick={() =>
                        setColumns((current) => [
                          ...current,
                          {
                            id: crypto.randomUUID(),
                            title: "",
                            kind: "in_progress",
                            archived: false,
                            saved: false,
                          },
                        ])
                      }
                    >
                      إضافة مرحلة
                    </Button>
                    <Button
                      type="submit"
                      loading={busy}
                      disabled={
                        !dirty || columns.some((column) => !column.title.trim())
                      }
                    >
                      حفظ المراحل
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </form>
      </Dialog>
    </>
  );
}

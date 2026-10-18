"use client";
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import {
  type TaskComment,
  type CommentRevision,
  workDate,
} from "@/lib/workforce/task-types";
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

type Page = {
  comments: TaskComment[];
  canComment: boolean;
  count: number;
  page: number;
};
const revisionActions = {
  create: "نشر التعليق",
  edit: "تعديل النص",
  archive: "أرشفة التعليق",
  restore: "استعادة التعليق",
};

function CommentHistory({
  taskId,
  commentId,
  onClose,
}: {
  taskId: string;
  commentId: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    revisions: CommentRevision[];
    count: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    api<{ revisions: CommentRevision[]; count: number }>(
      `/api/workforce/tasks/${taskId}/comments?comment_id=${commentId}&page=${page}`,
      { signal: abort.signal },
    )
      .then((result) => {
        setData(result);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [taskId, commentId, page, retry]);
  return (
    <Dialog title="تاريخ التعليق" open onClose={onClose}>
      <div className="space-y-4">
        <Notice message={error} error />
        {error && (
          <Button type="button" onClick={() => setRetry((n) => n + 1)}>
            إعادة تحميل تاريخ التعليق
          </Button>
        )}
        {!data && !error && <p role="status">جارٍ تحميل نسخ التعليق…</p>}
        {data && !error && (
          <>
            <ol className="space-y-3">
              {data.revisions.map((row) => (
                <li
                  key={row.version}
                  className="space-y-2 rounded-xl border border-border p-4 text-sm leading-7"
                >
                  <p className="font-bold">
                    نسخة {row.version} · {revisionActions[row.action]}
                  </p>
                  <p className="text-muted">
                    {row.actorName} · {workDate(row.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{row.body}</p>
                </li>
              ))}
            </ol>
            {!data.revisions.length && <p>لا توجد نسخ في هذه الصفحة.</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={page === 1}
                onClick={() => {
                  setData(null);
                  setPage((n) => n - 1);
                }}
              >
                نسخ أحدث
              </Button>
              <span>صفحة {page}</span>
              <Button
                type="button"
                variant="outline"
                disabled={page * 20 >= data.count}
                onClick={() => {
                  setData(null);
                  setPage((n) => n + 1);
                }}
              >
                نسخ أقدم
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

export default function TaskComments({
  taskId,
  taskVersion,
  frozen,
  onChanged,
}: {
  taskId: string;
  taskVersion: number;
  frozen: boolean;
  onChanged: () => void;
}) {
  const [data, setData] = useState<Page | null>(null);
  const [page, setPage] = useState(1);
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<{
    id: string;
    version: number;
    body: string;
    original: string;
  } | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const lock = useRef(false);
  const newId = useRef("");
  const retry = useRef({ payload: "", key: "" });
  const { confirm, confirmation } = useConfirm();
  const unsaved = useUnsavedChanges(
    !!body || (!!editing && editing.body !== editing.original),
  );
  useEffect(() => {
    const abort = new AbortController();
    api<Page>(
      `/api/workforce/tasks/${taskId}/comments?page=${page}&archived=${archived}&q=${encodeURIComponent(query)}`,
      { signal: abort.signal },
    )
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
  }, [taskId, taskVersion, page, archived, query, revision]);
  const reload = () => {
    setLoading(true);
    setRevision((n) => n + 1);
  };
  const closeEdit = async () => {
    if (
      !busy &&
      (!editing ||
        editing.body === editing.original ||
        (await confirm("تجاهل تعديل التعليق غير المحفوظ؟")))
    )
      setEditing(null);
  };
  const command = async (
    action: string,
    payload: Record<string, unknown>,
    version: number | null,
  ) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const serialized = JSON.stringify({ taskId, action, payload, version });
      if (retry.current.payload !== serialized)
        retry.current = { payload: serialized, key: crypto.randomUUID() };
      await api("/api/workforce/comments", {
        method: "POST",
        body: JSON.stringify({
          id: taskId,
          command: action,
          payload,
          version,
          request_key: retry.current.key,
        }),
      });
      if (action === "create") {
        setBody("");
        newId.current = "";
        setPage(1);
        setArchived(false);
        setSearch("");
        setQuery("");
      }
      if (action === "edit") setEditing(null);
      setMessage(
        action === "create"
          ? "تم نشر التعليق داخل المهمة"
          : action === "edit"
            ? "تم تعديل التعليق وحفظ نسخته السابقة"
            : payload.archived
              ? "تمت أرشفة التعليق؛ يمكن استعادته من الأرشيف"
              : "تمت استعادة التعليق",
      );
      reload();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Panel title="التعليقات والنقاش">
      {confirmation}
      {unsaved}
      <div className="space-y-5">
        <Notice message={error} error />
        <Notice message={message} />
        {data?.canComment && !frozen && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newId.current) newId.current = crypto.randomUUID();
              void command("create", { comment_id: newId.current, body }, null);
            }}
          >
            <Field label="تعليق جديد" id="new-task-comment">
              <textarea
                id="new-task-comment"
                className={controlClass}
                required
                maxLength={10000}
                rows={4}
                disabled={busy}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </Field>
            <Button type="submit" loading={busy} disabled={!body.trim()}>
              نشر التعليق
            </Button>
          </form>
        )}
        {data && (!data.canComment || frozen) && (
          <p className="text-sm text-muted">للقراءة فقط</p>
        )}
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(search);
            reload();
          }}
        >
          <Field label="بحث في التعليقات" id="comment-search">
            <input
              id="comment-search"
              className={controlClass}
              maxLength={100}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="outline">
            بحث التعليقات
          </Button>
          <Button type="button" variant="outline" onClick={reload}>
            تحديث التعليقات
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => {
                setLoading(true);
                setPage(1);
                setArchived(e.target.checked);
              }}
            />
            التعليقات المؤرشفة
          </label>
        </form>
        {loading ? (
          <p role="status">جارٍ تحميل التعليقات…</p>
        ) : !data || error ? (
          <Button type="button" onClick={reload}>
            إعادة تحميل التعليقات
          </Button>
        ) : (
          <>
            <p className="text-sm text-muted">
              {data.count} تعليق يطابق التصفية
            </p>
            {!data.comments.length && (
              <p className="text-sm">لا توجد تعليقات مطابقة.</p>
            )}
            <ol className="space-y-4">
              {data.comments.map((comment) => (
                <li
                  key={comment.id}
                  className="space-y-3 rounded-xl border border-border p-4"
                >
                  <div className="text-sm leading-7">
                    <p className="font-bold">
                      {comment.authorName}
                      {comment.archived_at ? " · مؤرشف" : ""}
                    </p>
                    <p className="text-muted">
                      {workDate(comment.created_at)}
                      {comment.edited_at
                        ? ` · معدل ${workDate(comment.edited_at)}`
                        : ""}
                    </p>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-7">
                    {comment.body}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {comment.canEdit && !frozen && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setError("");
                          setEditing({
                            id: comment.id,
                            version: comment.version,
                            body: comment.body,
                            original: comment.body,
                          });
                        }}
                      >
                        تعديل التعليق
                      </Button>
                    )}
                    {comment.canArchive && !frozen && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await confirm(
                              comment.archived_at
                                ? "استعادة هذا التعليق؟"
                                : "أرشفة التعليق مع الاحتفاظ بنصه وتاريخه؟",
                            )
                          )
                            await command(
                              "archive",
                              {
                                comment_id: comment.id,
                                archived: !comment.archived_at,
                              },
                              comment.version,
                            );
                        }}
                      >
                        {comment.archived_at
                          ? "استعادة التعليق"
                          : "أرشفة التعليق"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setHistory(comment.id)}
                    >
                      تاريخ التعليق
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={page === 1}
                onClick={() => {
                  setLoading(true);
                  setPage((n) => n - 1);
                }}
              >
                تعليقات أحدث
              </Button>
              <span>صفحة {page}</span>
              <Button
                type="button"
                variant="outline"
                disabled={page * 20 >= data.count}
                onClick={() => {
                  setLoading(true);
                  setPage((n) => n + 1);
                }}
              >
                تعليقات أقدم
              </Button>
            </div>
          </>
        )}
      </div>
      <Dialog title="تعديل التعليق" open={!!editing} onClose={closeEdit}>
        {editing && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void command(
                "edit",
                { comment_id: editing.id, body: editing.body },
                editing.version,
              );
            }}
          >
            <Field label="نص التعليق المعدل" id="edit-task-comment">
              <textarea
                id="edit-task-comment"
                className={controlClass}
                required
                maxLength={10000}
                rows={5}
                value={editing.body}
                disabled={busy}
                onChange={(e) =>
                  setEditing({ ...editing, body: e.target.value })
                }
              />
            </Field>

            <Notice message={error} error />
            <Button
              type="submit"
              loading={busy}
              disabled={
                !editing.body.trim() || editing.body === editing.original
              }
            >
              حفظ تعديل التعليق
            </Button>
          </form>
        )}
      </Dialog>
      {history && (
        <CommentHistory
          taskId={taskId}
          commentId={history}
          onClose={() => setHistory(null)}
        />
      )}
    </Panel>
  );
}

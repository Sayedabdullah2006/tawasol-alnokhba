"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
import PdfAttachmentPreview from "./PdfAttachmentPreview";
import { MAX_KNOWLEDGE_BYTES, KNOWLEDGE_INLINE_MIMES } from "@/lib/workforce/knowledge";
import type {
  KnowledgeData,
  KnowledgeFile,
  KnowledgeFolder,
} from "@/lib/workforce/knowledge";
import { workDate } from "@/lib/workforce/task-types";

function TextPreview({ id }: { id: string }) {
  const [text, setText] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/workforce/knowledge/${id}?preview=true`, {
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw Error("تعذر فتح المعاينة");
        setText(await response.text());
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [id]);
  return (
    <>
      <Notice message={error} error />
      <pre
        dir="auto"
        className="max-h-[65dvh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm"
      >
        {text}
      </pre>
    </>
  );
}
export default function KnowledgeCenter({ admin }: { admin: boolean }) {
  const params = useSearchParams(),
    pathname = usePathname(),
    query = params.toString(),
    folder = params.get("folder") || "",
    trash = params.get("trash") === "true";
  const [data, setData] = useState<KnowledgeData | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [revision, setRevision] = useState(0),
    [loadedKey, setLoadedKey] = useState(""),
    [busy, setBusy] = useState(false),
    [view, setView] = useState<"grid" | "list">("grid");
  const [preview, setPreview] = useState<KnowledgeFile | null>(null),
    [uploadOpen, setUploadOpen] = useState(false),
    [uploads, setUploads] = useState<{ file: File; id: string }[]>([]),
    [uploadFolder, setUploadFolder] = useState(""),
    [uploadTitle, setUploadTitle] = useState(""),
    [progress, setProgress] = useState("");
  const [editor, setEditor] = useState<{
      id: string;
      version: number | null;
      command: string;
      title: string;
      value: string;
    } | null>(null),
    [folderParent, setFolderParent] = useState("");
  const { confirm, confirmation } = useConfirm(),
    unsaved = useUnsavedChanges(uploads.length > 0);
  const requestKey = `${query}:${revision}`;
  const loading = loadedKey !== requestKey;
  useEffect(() => {
    const abort = new AbortController();
    api<KnowledgeData>(`/api/workforce/knowledge?${query}`, {
      signal: abort.signal,
    })
      .then((result) => {
        setData(result);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoadedKey(requestKey);
      });
    return () => abort.abort();
  }, [query, revision, requestKey]);
  const folders = data?.folders || [];
  const paths = useMemo(() => {
    const map = new Map((data?.folders || []).map((f) => [f.id, f]));
    return new Map(
      (data?.folders || []).map((f) => {
        const parts = [f.name],
          seen = new Set([f.id]);
        let p = f.parent_id;
        while (p && map.has(p) && !seen.has(p)) {
          seen.add(p);
          const parent = map.get(p)!;
          parts.unshift(parent.name);
          p = parent.parent_id;
        }
        return [f.id, parts.join(" / ")];
      }),
    );
  }, [data?.folders]);
  function navigate(patch: Record<string, string>) {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!Object.hasOwn(patch, "page")) next.delete("page");
    window.history.pushState(
      null,
      "",
      `${pathname}${next.size ? `?${next}` : ""}`,
    );
  }
  function openFolder(id: string) {
    navigate({
      folder: id,
      all: "",
      q: "",
      trash: "",
      uploader: "",
      from: "",
      to: "",
    });
  }
  async function mutate(
    id: string,
    version: number | null,
    command: string,
    payload: Record<string, unknown>,
  ) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await api("/api/workforce/knowledge", {
        method: "PATCH",
        body: JSON.stringify({ id, version, command, payload }),
      });
      setRevision((n) => n + 1);
      setMessage("تم الحفظ");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function addUploads(files: File[]) {
    if (files.length > 20) {
      setError("اختر حتى 20 ملفًا في المرة الواحدة");
      return;
    }
    if (files.some((f) => f.size === 0)) {
      setError("أحد الملفات فارغ؛ اختر ملفات تحتوي على بيانات");
      return;
    }
    if (files.some((f) => f.size > MAX_KNOWLEDGE_BYTES)) {
      setError("الحد الأقصى 50 ميجابايت لكل ملف");
      return;
    }
    setUploads(files.map((file) => ({ file, id: crypto.randomUUID() })));
    if (!uploadOpen)
      setUploadFolder(
        folder || folders.find((f) => f.system_key === "company")?.id || "",
      );
    setUploadTitle("");
    setUploadOpen(true);
    setError("");
  }
  const current = folders.find((f) => f.id === folder),
    breadcrumbs: KnowledgeFolder[] = [];
  {
    const seen = new Set<string>();
    let f = current;
    while (f && !seen.has(f.id)) {
      seen.add(f.id);
      breadcrumbs.unshift(f);
      f = folders.find((parent) => parent.id === f!.parent_id);
    }
  }
  const children =
    trash || params.get("all") === "true"
      ? []
      : params.get("q")
        ? folders.filter((f) => f.name.includes(params.get("q")!))
        : folders.filter((f) => f.parent_id === (folder || null));
  const canPreview = (file: KnowledgeFile) => KNOWLEDGE_INLINE_MIMES.includes(file.mime_type);
  return (
    <div
      className="space-y-5 p-4 md:p-8"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          addUploads(Array.from(e.dataTransfer.files));
        }
      }}
    >
      {confirmation}
      {unsaved}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">مركز المعرفة</h1>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy || loading} onClick={() => setRevision(n => n + 1)}>تحديث</Button>
          <Button
            disabled={busy || loading}
            onClick={() => {
              setUploadFolder(
                folder ||
                  folders.find((f) => f.system_key === "company")?.id ||
                  "",
              );
              setUploadOpen(true);
            }}
          >
            رفع ملفات
          </Button>
          <Button
            variant="outline"
            disabled={busy || loading}
            onClick={() => {
              setFolderParent(
                folder ||
                  folders.find((f) => f.system_key === "company")?.id ||
                  "",
              );
              setEditor({
                id: crypto.randomUUID(),
                version: null,
                command: "folder_create",
                title: "مجلد جديد",
                value: "",
              });
            }}
          >
            مجلد جديد
          </Button>
        </div>
      </header>
      <Notice message={error} error />
      <Notice message={message} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="مسار المجلد"
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          <button
            type="button"
            className="font-bold text-green"
            onClick={() => openFolder("")}
          >
            مركز المعرفة
          </button>
          {breadcrumbs.map((f) => (
            <span key={f.id}>
              {" "}
              /{" "}
              <button
                type="button"
                onClick={() => openFolder(f.id)}
                className="font-bold"
              >
                {f.name}
              </button>
            </span>
          ))}
          {trash && <span>/ سلة المحذوفات</span>}
        </nav>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate({ folder: "", all: "true", trash: "" })}
          >
            كل الملفات
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              navigate({ folder: "", all: "", trash: "true", q: "" })
            }
          >
            سلة المحذوفات
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label={
              view === "grid" ? "عرض الملفات كقائمة" : "عرض الملفات كشبكة"
            }
            onClick={() => setView(view === "grid" ? "list" : "grid")}
          >
            {view === "grid" ? "قائمة" : "شبكة"}
          </Button>
        </div>
      </div>
      <form
        key={query}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fields = new FormData(e.currentTarget);
          navigate(
            Object.fromEntries(
              ["q", "uploader", "from", "to"].map((k) => [
                k,
                String(fields.get(k) || ""),
              ]),
            ),
          );
        }}
      >
        <div className="min-w-48 flex-1">
          <Field label="بحث بالعنوان أو اسم الملف" id="knowledge-search">
            <input
              id="knowledge-search"
              name="q"
              defaultValue={params.get("q") || ""}
              className={controlClass}
            />
          </Field>
        </div>
        <details className="relative">
          <summary className="cursor-pointer rounded-xl border border-border px-4 py-3 text-sm font-bold">
            تصفية
          </summary>
          <div className="mt-2 w-[min(18rem,calc(100vw-4rem))] space-y-3 rounded-2xl border border-border bg-white p-4 shadow-xl sm:absolute sm:left-0 sm:z-10">
            <Field label="رفع بواسطة" id="knowledge-uploader">
              <select
                id="knowledge-uploader"
                name="uploader"
                defaultValue={params.get("uploader") || ""}
                className={controlClass}
              >
                <option value="">كل الفريق</option>
                {data?.uploaders.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </Field>
            {[
              ["from", "من تاريخ"],
              ["to", "إلى تاريخ"],
            ].map(([key, label]) => (
              <Field key={key} label={label} id={`knowledge-${key}`}>
                <input
                  id={`knowledge-${key}`}
                  type="date"
                  name={key}
                  defaultValue={params.get(key) || ""}
                  className={controlClass}
                />
              </Field>
            ))}
          </div>
        </details>
        <Button type="submit" disabled={loading}>
          بحث
        </Button>
        {["q", "uploader", "from", "to"].some((k) => params.has(k)) && (
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate({ q: "", uploader: "", from: "", to: "" })}
          >
            مسح التصفية
          </Button>
        )}
      </form>
      {loading ? (
        <p role="status">جارٍ تحميل الملفات…</p>
      ) : (
        <>
          {children.length > 0 && (
            <section
              aria-label="المجلدات"
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              {children.map((f) => (
                <article
                  key={f.id}
                  className="rounded-2xl border border-border bg-white p-4"
                  onDragOver={(e) => {
                    if (
                      e.dataTransfer.types.includes(
                        "application/x-workforce-file",
                      )
                    )
                      e.preventDefault();
                  }}
                  onDrop={(e) => {
                    const value = e.dataTransfer.getData(
                      "application/x-workforce-file",
                    );
                    if (!value) return;
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                      const id = JSON.parse(value).id,
                        file = data?.files.find((item) => item.id === id);
                      if (file?.canManage)
                        void mutate(file.id, file.version, "file_move", {
                          folder_id: f.id,
                        });
                    } catch {
                      setError("تعذر نقل الملف");
                    }
                  }}
                >
                  <button
                    type="button"
                    onClick={() => openFolder(f.id)}
                    className="flex min-h-16 w-full items-center gap-3 text-right font-bold"
                  >
                    <span aria-hidden="true" className="text-3xl">
                      📁
                    </span>
                    <span className="min-w-0 flex-1 break-words">{f.name}</span>
                    <span
                      title="إجمالي الملفات في المجلد ومجلداته الفرعية"
                      aria-label={`${f.file_count} ملف في ${f.name} ومجلداته الفرعية`}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold tabular-nums ${f.file_count > 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}
                    >
                      {f.file_count > 0 ? `${f.file_count.toLocaleString("ar-SA")} ملف` : "فارغ"}
                    </span>
                  </button>
                  {admin && !f.system_key && (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-muted">
                        خيارات المجلد
                      </summary>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditor({
                              id: f.id,
                              version: f.version,
                              command: "folder_edit",
                              title: "تعديل اسم المجلد",
                              value: f.name,
                            })
                          }
                        >
                          تعديل الاسم
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditor({
                              id: f.id,
                              version: f.version,
                              command: "folder_move",
                              title: "نقل المجلد",
                              value: f.parent_id || "",
                            })
                          }
                        >
                          نقل
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={async () => {
                            if (await confirm(`حذف المجلد الفارغ «${f.name}»؟`))
                              await mutate(
                                f.id,
                                f.version,
                                "folder_delete",
                                {},
                              );
                          }}
                        >
                          حذف
                        </Button>
                      </div>
                    </details>
                  )}
                </article>
              ))}
            </section>
          )}
          <section
            aria-label="الملفات"
            className={
              view === "grid"
                ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
                : "space-y-3"
            }
          >
            {data?.files.map((file) => (
              <article
                key={file.id}
                draggable={file.canManage && !trash}
                onDragStart={(e) =>
                  e.dataTransfer.setData(
                    "application/x-workforce-file",
                    JSON.stringify({ id: file.id }),
                  )
                }
                className={`rounded-2xl border border-border bg-white p-4 ${view === "list" ? "flex flex-wrap items-center justify-between gap-4" : "space-y-3"}`}
              >
                <div className="min-w-0 space-y-2">
                  <h2 className="break-words font-bold">{file.title}</h2>
                  <p className="break-all text-xs text-muted" dir="auto">
                    {file.filename} ·{" "}
                    {(file.size_bytes / 1024).toLocaleString("ar-SA", {
                      maximumFractionDigits: 0,
                    })}{" "}
                    كيلوبايت
                  </p>
                  <p className="text-xs text-muted">
                    {file.uploaderName} · {workDate(file.created_at)}
                  </p>
                  <button
                    type="button"
                    onClick={() => openFolder(file.folder_id)}
                    className="text-xs font-bold text-green"
                  >
                    {paths.get(file.folder_id)}
                  </button>
                  {file.taskId && (
                    <Link
                      href={`${admin ? "/admin/workforce/tasks" : "/employee/work/tasks"}/${file.taskId}`}
                      className="block text-xs font-bold underline"
                    >
                      {file.sealed ? "مرفق تسليم محفوظ" : "مرفق مهمة"} ←
                    </Link>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canPreview(file) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPreview(file)}
                    >
                      معاينة
                    </Button>
                  )}
                  <a
                    href={`/api/workforce/knowledge/${file.id}`}
                    download={file.filename}
                    className="rounded-xl border border-border px-3 py-2 text-sm font-bold"
                  >
                    تنزيل
                  </a>
                  {file.canManage && !trash && (
                    <details className="relative">
                      <summary className="cursor-pointer rounded-xl border border-border px-3 py-2 text-sm font-bold">
                        خيارات
                      </summary>
                      <div className="absolute left-0 z-10 mt-1 w-40 space-y-2 rounded-xl border border-border bg-white p-2 shadow-xl">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditor({
                              id: file.id,
                              version: file.version,
                              command: "file_edit",
                              title: "تعديل عنوان الملف",
                              value: file.title,
                            })
                          }
                        >
                          تعديل العنوان
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditor({
                              id: file.id,
                              version: file.version,
                              command: "file_move",
                              title: "نقل الملف",
                              value: file.folder_id,
                            })
                          }
                        >
                          نقل
                        </Button>
                        {file.canTrash && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={async () => {
                              if (
                                await confirm(
                                  `نقل «${file.title}» إلى سلة المحذوفات؟`,
                                )
                              )
                                await mutate(
                                  file.id,
                                  file.version,
                                  "file_trash",
                                  {},
                                );
                            }}
                          >
                            حذف
                          </Button>
                        )}
                      </div>
                    </details>
                  )}
                  {trash && file.canTrash && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void mutate(file.id, file.version, "file_restore", {})
                      }
                    >
                      استعادة
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </section>
          {!children.length && !data?.files.length && (
            <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
              {trash ? "سلة المحذوفات فارغة" : "لا توجد ملفات هنا"}
            </p>
          )}
          {!!data?.count && (
            <div className="flex items-center justify-between text-sm">
              <span>{data.count} ملف</span>
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={data.page <= 1}
                  onClick={() => navigate({ page: String(data.page - 1) })}
                >
                  السابق
                </Button>
                <span>{data.page}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={data.page * 20 >= data.count}
                  onClick={() => navigate({ page: String(data.page + 1) })}
                >
                  التالي
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      <Dialog
        title="رفع ملفات"
        open={uploadOpen}
        onClose={async () => {
          if (
            !busy &&
            (!uploads.length ||
              (await confirm("إغلاق الرفع دون حفظ الملفات المتبقية؟")))
          ) {
            setUploads([]);
            setUploadOpen(false);
          }
        }}
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || !uploads.length) return;
            setBusy(true);
            setError("");
            try {
              for (let i = 0; i < uploads.length; i++) {
                const item = uploads[i];
                setProgress(`رفع ${i + 1} من ${uploads.length}`);
                const body = new FormData();
                body.set("file", item.file);
                body.set("request_key", item.id);
                body.set("folder_id", uploadFolder);
                body.set(
                  "title",
                  uploads.length === 1 && uploadTitle.trim()
                    ? uploadTitle
                    : item.file.name,
                );
                await api("/api/workforce/knowledge", { method: "POST", body });
                setUploads((previous) =>
                  previous.filter((p) => p.id !== item.id),
                );
                setRevision((n) => n + 1);
              }
              setUploadOpen(false);
              setMessage("تم رفع الملفات");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
              setProgress("");
            }
          }}
        >
          <Field label="المجلد" id="knowledge-upload-folder">
            <select
              id="knowledge-upload-folder"
              required
              className={controlClass}
              value={uploadFolder}
              disabled={busy}
              onChange={(e) => setUploadFolder(e.target.value)}
            >
              <option value="">اختر المجلد</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {paths.get(f.id)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="جميع الصيغ — حتى 50 ميجابايت للملف"
            id="knowledge-upload-files"
          >
            <input
              id="knowledge-upload-files"
              type="file"
              multiple
              disabled={busy}
              onChange={(e) => addUploads(Array.from(e.target.files || []))}
              className={controlClass}
            />
          </Field>
          {uploads.length === 1 && (
            <Field label="عنوان الملف" id="knowledge-upload-title">
              <input
                id="knowledge-upload-title"
                className={controlClass}
                maxLength={250}
                value={uploadTitle}
                disabled={busy}
                placeholder={uploads[0].file.name}
                onChange={(e) => setUploadTitle(e.target.value)}
              />
            </Field>
          )}
          <ul className="space-y-2 text-sm">
            {uploads.map((item) => (
              <li key={item.id} className="break-all" dir="auto">
                {item.file.name}
              </li>
            ))}
          </ul>
          <Notice message={error} error />
          <p role="status">{progress}</p>
          <Button
            type="submit"
            loading={busy}
            disabled={!uploads.length || !uploadFolder}
          >
            رفع الملفات
          </Button>
        </form>
      </Dialog>
      <Dialog
        title={editor?.title || "تعديل"}
        open={!!editor}
        onClose={() => {
          if (!busy) setEditor(null);
        }}
      >
        {editor && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const isMove = editor.command.endsWith("move");
              const payload = isMove
                ? {
                    [editor.command === "file_move"
                      ? "folder_id"
                      : "parent_id"]: editor.value || null,
                  }
                : {
                    [editor.command === "file_edit" ? "title" : "name"]:
                      editor.value,
                    ...(editor.command === "folder_create"
                      ? { parent_id: folderParent || null }
                      : {}),
                  };
              if (
                await mutate(editor.id, editor.version, editor.command, payload)
              )
                setEditor(null);
            }}
          >
            <Field
              label={
                editor.command.endsWith("move") ? "المجلد الوجهة" : "الاسم"
              }
              id="knowledge-editor"
            >
              {editor.command.endsWith("move") ? (
                <select
                  id="knowledge-editor"
                  className={controlClass}
                  value={editor.value}
                  onChange={(e) =>
                    setEditor({ ...editor, value: e.target.value })
                  }
                >
                  {editor.command === "folder_move" && (
                    <option value="">الأقسام الرئيسية</option>
                  )}
                  {folders
                    .filter((f) => f.id !== editor.id)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {paths.get(f.id)}
                      </option>
                    ))}
                </select>
              ) : (
                <input
                  id="knowledge-editor"
                  required
                  maxLength={editor.command === "file_edit" ? 250 : 150}
                  className={controlClass}
                  value={editor.value}
                  onChange={(e) =>
                    setEditor({ ...editor, value: e.target.value })
                  }
                />
              )}
            </Field>
            {editor.command === "folder_create" && (
              <Field label="داخل المجلد" id="knowledge-folder-parent">
                <select
                  id="knowledge-folder-parent"
                  className={controlClass}
                  value={folderParent}
                  onChange={(e) => setFolderParent(e.target.value)}
                >
                  {admin && <option value="">الأقسام الرئيسية</option>}
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {paths.get(f.id)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Notice message={error} error />
            <Button
              type="submit"
              loading={busy}
              disabled={
                editor.command === "folder_create" && !folderParent && !admin
              }
            >
              حفظ
            </Button>
          </form>
        )}
      </Dialog>
      <Dialog
        title={preview?.title || "معاينة"}
        open={!!preview}
        onClose={() => setPreview(null)}
      >
        {preview &&
          (preview.mime_type.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={preview.title}
              src={`/api/workforce/knowledge/${preview.id}?preview=true`}
              className="mx-auto max-h-[70dvh] max-w-full object-contain"
            />
          ) : preview.mime_type === "application/pdf" ? (
            <PdfAttachmentPreview
              url={`/api/workforce/knowledge/${preview.id}?preview=true`}
            />
          ) : (
            <TextPreview id={preview.id} />
          ))}
      </Dialog>
    </div>
  );
}

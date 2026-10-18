"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import {
  TASK_PRIORITIES,
  TASK_STATES,
  workDate,
  type WorkTask,
  type TaskColumn,
} from "@/lib/workforce/task-types";
import TaskFields, { taskForm, taskPayload } from "./TaskFields";
import WeeklyPlan from "./WeeklyPlan";
import TaskBoard from "./TaskBoard";
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

export default function TaskWorkspace({
  admin,
  employeeId,
  embedded = false,
  onOpenTask,
  onChanged,
  refreshKey = 0,
  clients = [],
}: {
  admin: boolean;
  userId: string;
  employeeId?: string;
  embedded?: boolean;
  onOpenTask?: (id: string, panel?: string) => void;
  onChanged?: () => void;
  refreshKey?: number;
  clients?: string[];
}) {
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const query = params.toString();
  const pendingQuery = useRef(query);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [columns, setColumns] = useState<TaskColumn[]>([]);
  const [laneCounts, setLaneCounts] = useState<Record<string, number>>({});
  const [lanePages, setLanePages] = useState<Record<string, number>>({});
  const [more, setMore] = useState<Record<string, number>>({});
  const view = params.get("view") === "list" ? "list" : "board";
  const [employees, setEmployees] = useState<
    { id: string; full_name: string }[]
  >([]);
  const [count, setCount] = useState(0),
    [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [teamError, setTeamError] = useState("");
  const [busy, setBusy] = useState(false),
    [taskOpen, setTaskOpen] = useState(false),
    [weeklyOpen, setWeeklyOpen] = useState(false);
  const [task, setTask] = useState(taskForm());
  const taskId = useRef("");
  const retry = useRef({ serialized: "", key: "" }),
    lock = useRef(false);
  const { confirm, confirmation } = useConfirm();
  const unsaved = useUnsavedChanges(
    taskOpen && JSON.stringify(task) !== JSON.stringify(taskForm()),
  );
  const base = admin ? "/admin/workforce/tasks" : "/employee/work/tasks";
  const Heading = embedded ? "h2" : "h1";
  const page = Number(params.get("page") || "1");
  useEffect(() => {
    const refresh = () => {
      if (!taskOpen && !weeklyOpen) setRevision((n) => n + 1);
    };
    window.addEventListener("workforce-data-changed", refresh);
    return () => window.removeEventListener("workforce-data-changed", refresh);
  }, [taskOpen, weeklyOpen]);
  useEffect(() => {
    pendingQuery.current = query;
  }, [query]);
  function change(key: string, value: string) {
    const next = new URLSearchParams(pendingQuery.current);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "scope") next.delete("assignee_id");
    if (key === "assignee_id") next.delete("scope");
    if (key !== "page") next.delete("page");
    pendingQuery.current = next.toString();
    setLoading(true);
    if (next.toString() === query) setRevision((n) => n + 1);
    window.history.replaceState(null, "", `${pathname}?${next}`);
  }
  useEffect(() => {
    const abort = new AbortController();
    api<{ employees: typeof employees }>("/api/workforce/team", {
      signal: abort.signal,
    })
      .then((result) => {
        setEmployees(result.employees);
        setTeamError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setTeamError(e.message);
      });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    const requestParams = new URLSearchParams(query);
    requestParams.set("view", view);
    if (view === "board") {
      requestParams.set("page", "1");
      if (!requestParams.has("sort")) requestParams.set("sort", "position");
    }
    api<{
      tasks: WorkTask[];
      count: number;
      columns: TaskColumn[];
      laneCounts?: Record<string, number>;
    }>(`/api/workforce/tasks?${requestParams}`, {
      signal: abort.signal,
    })
      .then((result) => {
        setTasks(result.tasks);
        setCount(result.count);
        setColumns(result.columns);
        setLaneCounts(result.laneCounts || {});
        setLanePages({});
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
  }, [query, revision, refreshKey, view]);
  const close = async () => {
    if (busy) return;
    if (
      JSON.stringify(task) !== JSON.stringify(taskForm()) &&
      !(await confirm("تجاهل المهمة غير المحفوظة؟"))
    )
      return;
    setTaskOpen(false);
  };
  return (
    <div className={embedded ? "space-y-4" : "space-y-4 p-4 md:p-6"}>
      {confirmation}
      {unsaved}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Heading className="text-2xl font-black">المهام</Heading>
        </div>
        {admin && (
          <div className="flex flex-wrap gap-3">
            <Button
              id="workforce-add-task"
              onClick={() => {
                taskId.current = crypto.randomUUID();
                setTask({
                  ...taskForm(),
                  assignee_id: params.get("assignee_id") || "",
                  client_name: params.get("client_name") || "",
                });
                setTaskOpen(true);
              }}
            >
              إضافة مهمة
            </Button>
            <Button
              id="workforce-weekly-plan"
              variant="outline"
              onClick={() => setWeeklyOpen(true)}
            >
              إسناد خطة أسبوعية
            </Button>
          </div>
        )}
        {employeeId && (
          <div className="flex gap-3">
            <Button
              variant={params.get("scope") ? "primary" : "outline"}
              onClick={() => change("scope", "assigned")}
            >
              مهامي
            </Button>
            <Button
              variant={
                !params.get("scope") && !params.get("assignee_id")
                  ? "primary"
                  : "outline"
              }
              onClick={() => change("scope", "")}
            >
              مهام الفريق
            </Button>
          </div>
        )}
      </header>
      <Notice message={error || teamError} error />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {[
            ["board", "قوائم"],
            ["list", "قائمة مختصرة"],
          ].map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={view === key ? "primary" : "outline"}
              onClick={() => change("view", key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted" role="status">
          {loading ? "جارٍ التحديث…" : `${count} مهمة`}
        </span>
      </div>
      <details className="rounded-2xl border border-border bg-white p-4">
        <summary className="cursor-pointer text-sm font-bold">
          بحث وتصفية
        </summary>
        <div className="pt-4">
          <form
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              change("q", String(new FormData(e.currentTarget).get("q") || ""));
            }}
          >
            <Field label="البحث في المهام" id="task-search">
              <input
                key={params.get("q") || ""}
                id="task-search"
                name="q"
                defaultValue={params.get("q") || ""}
                className={controlClass}
              />
            </Field>
            <Field label="الموظفة المسؤولة" id="assignee-filter">
              <select
                id="assignee-filter"
                className={controlClass}
                value={
                  params.get("assignee_id") ||
                  (params.get("scope") && employeeId ? employeeId : "")
                }
                onChange={(e) => change("assignee_id", e.target.value)}
              >
                <option value="">كل الفريق</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="الحالة" id="state-filter">
              <select
                id="state-filter"
                className={controlClass}
                value={params.get("state") || ""}
                onChange={(e) => change("state", e.target.value)}
              >
                <option value="">كل الحالات</option>
                {Object.entries(TASK_STATES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="العميل أو مجال العمل" id="client-filter">
              <input
                key={params.get("client_name") || ""}
                id="client-filter"
                list="work-client-options"
                className={controlClass}
                defaultValue={params.get("client_name") || ""}
                placeholder="أي عميل، أو تطوير الشركة"
                onBlur={(e) => {
                  if (
                    e.target.value.trim() !== (params.get("client_name") || "")
                  )
                    change("client_name", e.target.value.trim());
                }}
              />
              <datalist id="work-client-options">
                {clients.map((client) => (
                  <option key={client} value={client} />
                ))}
              </datalist>
            </Field>
            {[
              ["due_from", "موعد التسليم من"],
              ["due_to", "موعد التسليم إلى"],
            ].map(([key, label]) => (
              <Field key={key} label={label} id={key}>
                <input
                  id={key}
                  type="date"
                  className={controlClass}
                  value={params.get(key) || ""}
                  onChange={(e) => change(key, e.target.value)}
                />
              </Field>
            ))}
            <div className="flex items-end gap-3">
              <Button type="submit">بحث</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  pendingQuery.current = "";
                  window.history.replaceState(null, "", pathname);
                  setRevision((n) => n + 1);
                }}
              >
                مسح التصفية
              </Button>
            </div>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            {[
              ["overdue", "متأخرة"],
              ["open", "غير مكتملة"],
              ["blocked", "متوقفة"],
              ["archived", "مؤرشفة"],
            ].map(([key, label]) => (
              <label key={key} className="flex gap-2">
                <input
                  type="checkbox"
                  checked={params.get(key) === "true"}
                  onChange={(e) => change(key, e.target.checked ? "true" : "")}
                />
                {label}
              </label>
            ))}
            <select
              aria-label="ترتيب المهام"
              className="rounded-xl border p-2"
              value={params.get("sort") || "updated"}
              onChange={(e) => change("sort", e.target.value)}
            >
              <option value="updated">آخر تحديث</option>
              <option value="due">أقرب موعد تسليم</option>
              <option value="title">العنوان</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRevision((n) => n + 1)}
            >
              تحديث
            </Button>
          </div>
        </div>
      </details>
      {loading && !tasks.length ? (
        <p role="status">جارٍ تحميل المهام…</p>
      ) : error ? (
        <p role="alert">تعذر تحميل المهام. أعيدي المحاولة.</p>
      ) : view === "board" ? (
        <TaskBoard
          tasks={tasks}
          columns={columns}
          counts={laneCounts}
          admin={admin}
          base={base}
          onOpen={onOpenTask}
          more={more}
          onMoved={(updated) => {
            setTasks(updated);
            setRevision((n) => n + 1);
            onChanged?.();
          }}
          onMore={async (kind) => {
            if (more[kind]) return;
            setMore((current) => ({ ...current, [kind]: 1 }));
            try {
              const next = new URLSearchParams(query);
              next.set("view", "list");
              next.set("state", kind);
              next.set("sort", "position");
              const page = (lanePages[kind] || 1) + 1;
              next.set("page", String(page));
              const result = await api<{
                tasks: WorkTask[];
                columns: TaskColumn[];
              }>(`/api/workforce/tasks?${next}`);
              setTasks((current) => [
                ...current,
                ...result.tasks.filter(
                  (row) => !current.some((item) => item.id === row.id),
                ),
              ]);
              setColumns((current) => [
                ...current,
                ...result.columns.filter(
                  (row) => !current.some((item) => item.id === row.id),
                ),
              ]);
              setLanePages((current) => ({ ...current, [kind]: page }));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setMore((current) => ({ ...current, [kind]: 0 }));
            }
          }}
        />
      ) : (
        <>
          <p className="text-sm text-muted">
            {count} مهمة · الصفحة {page}
          </p>
          {!tasks.length && (
            <Panel title="لا توجد مهام مطابقة">
              <p>غيّري التصفية{admin ? " أو أضيفي مهمة جديدة." : "."}</p>
            </Panel>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tasks.map((item) => (
              <article
                key={item.id}
                className="space-y-3 rounded-2xl border border-border bg-white p-5"
              >
                <div className="flex flex-wrap justify-between gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    {item.client_name || "غير مصنفة"}
                  </span>
                  <span>{item.column.title}</span>
                </div>
                <Link
                  href={`${base}/${item.id}`}
                  onClick={
                    onOpenTask
                      ? (e) => {
                          if (
                            !e.ctrlKey &&
                            !e.metaKey &&
                            !e.shiftKey &&
                            e.button === 0
                          ) {
                            e.preventDefault();
                            onOpenTask(item.id);
                          }
                        }
                      : undefined
                  }
                  className="block break-words font-bold hover:underline"
                >
                  {item.title}
                </Link>
                <p className="text-sm">
                  المسؤولة: {item.assigneeName || "لم تُسند بعد"}
                </p>
                <p className="text-xs text-muted">
                  {TASK_PRIORITIES[item.priority]} · التسليم:{" "}
                  {workDate(item.due_at)}
                </p>
                {item.blocked_reason && (
                  <p className="text-xs text-amber-900">
                    متوقفة: {item.blocked_reason}
                  </p>
                )}
                <Link
                  href={`${base}/${item.id}`}
                  onClick={
                    onOpenTask
                      ? (e) => {
                          if (
                            !e.ctrlKey &&
                            !e.metaKey &&
                            !e.shiftKey &&
                            e.button === 0
                          ) {
                            e.preventDefault();
                            onOpenTask(item.id);
                          }
                        }
                      : undefined
                  }
                  className="inline-block py-2 text-sm font-bold text-green"
                >
                  {item.canWork
                    ? "فتح المهمة والإجراءات"
                    : "عرض المهمة — للقراءة فقط"}{" "}
                  ←
                </Link>
              </article>
            ))}
          </div>
          <div className="flex justify-center gap-4">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => change("page", String(page - 1))}
            >
              السابق
            </Button>
            <span>صفحة {page}</span>
            <Button
              variant="outline"
              disabled={page * 20 >= count}
              onClick={() => change("page", String(page + 1))}
            >
              التالي
            </Button>
          </div>
        </>
      )}
      <Dialog title="إضافة مهمة" open={taskOpen} onClose={close}>
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError("");
            try {
              if (!task.assignee_id)
                throw new Error("اختاري الموظفة المسؤولة عن المهمة");
              const payload = taskPayload(task, admin),
                serialized = JSON.stringify(payload);
              if (retry.current.serialized !== serialized)
                retry.current = { serialized, key: crypto.randomUUID() };
              await api("/api/workforce/tasks", {
                method: "POST",
                body: JSON.stringify({
                  id: taskId.current,
                  command: "create",
                  payload,
                  version: null,
                  request_key: retry.current.key,
                }),
              });
              setTaskOpen(false);
              setRevision((n) => n + 1);
              onChanged?.();
              if (onOpenTask) onOpenTask(taskId.current);
              else router.push(`${base}/${taskId.current}`);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          <TaskFields value={task} onChange={setTask} admin={admin} />
          <Notice message={error} error />
          <Button type="submit" loading={busy}>
            إسناد المهمة
          </Button>
        </form>
      </Dialog>
      {weeklyOpen && (
        <WeeklyPlan
          onClose={() => setWeeklyOpen(false)}
          onSaved={() => {
            setWeeklyOpen(false);
            setRevision((n) => n + 1);
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

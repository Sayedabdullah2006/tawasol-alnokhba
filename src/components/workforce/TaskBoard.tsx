"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import {
  TASK_STATES,
  TASK_PRIORITIES,
  type WorkTask,
  type TaskColumn,
} from "@/lib/workforce/task-types";
import { cardAction } from "@/lib/workforce/task-move";
import { api, Notice } from "./shared";
const kinds = Object.keys(TASK_STATES) as (keyof typeof TASK_STATES)[];
const shades = {
  new: "border-slate-300",
  in_progress: "border-blue-500",
  review: "border-amber-500",
  changes: "border-rose-400",
  done: "border-emerald-500",
};
export default function TaskBoard({
  tasks,
  columns,
  counts,
  admin,
  base,
  onOpen,
  onMoved,
  more,
  onMore,
}: {
  tasks: WorkTask[];
  columns: TaskColumn[];
  counts: Record<string, number>;
  admin: boolean;
  base: string;
  onOpen?: (id: string, panel?: string) => void;
  onMoved: (tasks: WorkTask[]) => void;
  more: Record<string, number>;
  onMore: (kind: string) => Promise<void>;
}) {
  const [dragging, setDragging] = useState<string | null>(null),
    [over, setOver] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [pendingMove, setPendingMove] = useState<{
    id: string;
    column: TaskColumn;
    position: number;
  } | null>(null);
  const visibleTasks = tasks.map((task) =>
    pendingMove?.id === task.id
      ? {
          ...task,
          column_id: pendingMove.column.id,
          column: pendingMove.column,
          position: pendingMove.position,
        }
      : task,
  );
  const visibleCounts = { ...counts };
  const originalTask =
    pendingMove && tasks.find((task) => task.id === pendingMove.id);
  if (
    originalTask &&
    pendingMove &&
    originalTask.column.kind !== pendingMove.column.kind
  ) {
    visibleCounts[originalTask.column.kind] = Math.max(
      0,
      (visibleCounts[originalTask.column.kind] || 0) - 1,
    );
    visibleCounts[pendingMove.column.kind] =
      (visibleCounts[pendingMove.column.kind] || 0) + 1;
  }
  const lock = useRef(false),
    dragId = useRef<string | null>(null),
    board = useRef<HTMLDivElement | null>(null),
    touch = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(
      null,
    );
  const moving = tasks.find((task) => task.id === dragging);
  function open(id: string, panel = "brief") {
    if (onOpen) onOpen(id, panel);
    else window.location.assign(`${base}/${id}?panel=${panel}`);
  }
  async function move(task: WorkTask, kind: string) {
    if (lock.current) return;
    const action = cardAction(task, kind, admin);
    if (!action) {
      setError(
        kind === "done"
          ? "أرسلي التسليم للمراجعة أولًا، ثم تعتمد الإدارة إنجازه."
          : "لا يمكن نقل هذه المهمة إلى الحالة المحددة.",
      );
      return;
    }
    setDragging(null);
    setOver("");
    setError("");
    if (action !== "move") {
      open(task.id, "submit");
      return;
    }
    const column = columns.find(
      (column) =>
        column.board_id === task.board_id &&
        column.kind === kind &&
        !column.archived_at,
    );
    if (!column) {
      setError("تعذر تحديد القائمة. حدّث المهام ثم حاول مجددًا.");
      return;
    }
    const position =
      Math.max(
        0,
        ...tasks
          .filter(
            (row) =>
              row.board_id === task.board_id && row.column_id === column.id,
          )
          .map((row) => Number(row.position) || 0),
      ) + 1024;
    lock.current = true;
    setBusy(true);
    setPendingMove({ id: task.id, column, position });
    try {
      const result = await api<{ version: number }>("/api/workforce/tasks", {
        method: "POST",
        body: JSON.stringify({
          id: task.id,
          version: task.version,
          command: "move",
          payload: { column_id: column.id, position },
          request_key: crypto.randomUUID(),
        }),
      });
      onMoved(
        tasks.map((row) =>
          row.id === task.id
            ? {
                ...row,
                column_id: column.id,
                column,
                position,
                version: result.version,
              }
            : row,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
      setPendingMove(null);
    }
  }
  return (
    <div className="space-y-3">
      <Notice message={error} error />
      {busy && (
        <p role="status" className="text-sm text-muted">
          جارٍ حفظ النقل…
        </p>
      )}
      <div
        ref={board}
        className="flex gap-4 overflow-x-auto pb-5"
        aria-label="قوائم المهام"
      >
        {kinds.map((kind) => {
          const rows = visibleTasks
            .filter((task) => task.column.kind === kind)
            .sort(
              (a, b) =>
                Number(a.position) - Number(b.position) ||
                a.id.localeCompare(b.id),
            );
          const allowed = !!moving && !!cardAction(moving, kind, admin);
          return (
            <section
              key={kind}
              data-task-lane={kind}
              aria-label={`${TASK_STATES[kind]} — ${visibleCounts[kind] || 0} مهمة`}
              className={`max-h-[65dvh] min-h-80 w-72 shrink-0 overflow-y-auto rounded-2xl border-t-4 bg-slate-100/90 p-3 ${shades[kind]} ${over === kind && allowed ? "ring-2 ring-green" : ""}`}
              onDragOver={(e) => {
                const source = tasks.find((row) => row.id === dragId.current);
                if (source && cardAction(source, kind, admin)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setOver(kind);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const source = tasks.find((row) => row.id === dragId.current);
                if (source && cardAction(source, kind, admin))
                  void move(source, kind);
                dragId.current = null;
                setOver("");
              }}
            >
              <header className="mb-3 flex items-center justify-between gap-3 px-1">
                <h3 className="text-sm font-black">{TASK_STATES[kind]}</h3>
                <span className="rounded-lg bg-white px-2 py-1 text-xs font-bold">
                  {visibleCounts[kind] ?? rows.length}
                </span>
              </header>
              <div className="space-y-3">
                {rows.map((task) => {
                  const editable =
                    !!task.canWork &&
                    !task.archived_at &&
                    !task.board?.archived_at &&
                    (admin || !["review", "done"].includes(task.column.kind));
                  const late =
                    task.due_at &&
                    new Date(task.due_at).getTime() < Date.now() &&
                    kind !== "done";
                  return (
                    <article
                      key={task.id}
                      draggable={editable && !busy}
                      data-task-card={task.id}
                      onDragStart={(e) => {
                        if (!editable || busy) {
                          e.preventDefault();
                          return;
                        }
                        setDragging(task.id);
                        dragId.current = task.id;
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", task.id);
                      }}
                      onDragEnd={() => {
                        dragId.current = null;
                        setDragging(null);
                        setOver("");
                      }}
                      className={`group space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${dragging === task.id ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                          {task.client_name || "تطوير الشركة"}
                        </span>
                        {editable && (
                          <button
                            type="button"
                            aria-label={`تحريك ${task.title}`}
                            title="اسحب البطاقة أو استخدم قائمة النقل"
                            className="touch-none cursor-grab rounded px-2 text-lg text-slate-400 active:cursor-grabbing"
                            disabled={busy}
                            onPointerDown={(e) => {
                              if (busy || e.button !== 0) return;
                              // A button does not reliably initiate its parent's HTML
                              // drag on desktop. Use the handle for all pointer types.
                              e.preventDefault();
                              e.currentTarget.setPointerCapture(e.pointerId);
                              touch.current = {
                                id: task.id,
                                x: e.clientX,
                                y: e.clientY,
                                moved: false,
                              };
                            }}
                            onPointerMove={(e) => {
                              const state = touch.current;
                              if (!state) return;
                              if (
                                Math.hypot(
                                  e.clientX - state.x,
                                  e.clientY - state.y,
                                ) > 10
                              ) {
                                state.moved = true;
                                dragId.current = task.id;
                                setDragging(task.id);
                                const bounds =
                                  board.current?.getBoundingClientRect();
                                if (bounds && board.current) {
                                  if (e.clientX < bounds.left + 40)
                                    board.current.scrollBy({ left: -24 });
                                  else if (e.clientX > bounds.right - 40)
                                    board.current.scrollBy({ left: 24 });
                                }
                                const lane = document
                                  .elementFromPoint(e.clientX, e.clientY)
                                  ?.closest<HTMLElement>("[data-task-lane]")
                                  ?.dataset.taskLane;
                                setOver(lane || "");
                              }
                            }}
                            onPointerUp={(e) => {
                              const state = touch.current;
                              touch.current = null;
                              dragId.current = null;
                              if (
                                e.currentTarget.hasPointerCapture(e.pointerId)
                              )
                                e.currentTarget.releasePointerCapture(
                                  e.pointerId,
                                );
                              const lane = document
                                .elementFromPoint(e.clientX, e.clientY)
                                ?.closest<HTMLElement>("[data-task-lane]")
                                ?.dataset.taskLane;
                              setDragging(null);
                              setOver("");
                              if (state?.moved && lane) void move(task, lane);
                            }}
                            onPointerCancel={() => {
                              touch.current = null;
                              dragId.current = null;
                              setDragging(null);
                              setOver("");
                            }}
                          >
                            ⠿
                          </button>
                        )}
                      </div>
                      <Link
                        draggable={false}
                        href={`${base}/${task.id}`}
                        onClick={
                          onOpen
                            ? (e) => {
                                if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                                  e.preventDefault();
                                  open(task.id);
                                }
                              }
                            : undefined
                        }
                        className="block break-words text-sm font-bold leading-6 text-dark hover:text-green"
                      >
                        {task.title}
                      </Link>
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        {task.priority !== "normal" && (
                          <span className="rounded bg-amber-50 px-2 py-1 text-amber-800">
                            {TASK_PRIORITIES[task.priority]}
                          </span>
                        )}
                        {task.blocked_reason && (
                          <span className="rounded bg-rose-50 px-2 py-1 text-rose-700">
                            عائق
                          </span>
                        )}
                        {task.due_at && (
                          <span
                            className={`rounded px-2 py-1 ${late ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-500"}`}
                          >
                            {new Date(task.due_at).toLocaleDateString("ar-SA", {
                              calendar: "gregory",
                              month: "short",
                              day: "numeric",
                              timeZone: "Asia/Riyadh",
                            })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                        <span className="truncate text-xs text-slate-500">
                          {task.assigneeName || "دون مسؤولة"}
                        </span>
                        {editable ? (
                          <select
                            aria-label={`نقل: ${task.title}`}
                            value=""
                            disabled={busy}
                            onChange={(e) => void move(task, e.target.value)}
                            className="max-w-28 rounded-lg border border-slate-200 bg-white p-1 text-xs"
                          >
                            <option value="">نقل إلى…</option>
                            {kinds
                              .filter(
                                (target) =>
                                  target !== kind &&
                                  cardAction(task, target, admin),
                              )
                              .map((target) => (
                                <option key={target} value={target}>
                                  {TASK_STATES[target]}
                                </option>
                              ))}
                          </select>
                        ) : !task.canWork ? (
                          <span className="text-[10px] text-slate-400">
                            للقراءة
                          </span>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
              {!rows.length && (
                <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-400">
                  لا توجد مهام
                </div>
              )}
              {rows.length < (counts[kind] || 0) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || !!more[kind]}
                  onClick={() => void onMore(kind)}
                >
                  تحميل المزيد
                </Button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

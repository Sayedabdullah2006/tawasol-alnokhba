"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import {
  TASK_PRIORITIES,
  workDate,
  type BoardDetail,
  type TaskDetail as Detail,
} from "@/lib/workforce/task-types";
import TaskFields, { taskForm, taskPayload } from "./TaskFields";
import TaskChecklist from "./TaskChecklist";
import TaskHistory from "./TaskHistory";
import TaskComments from "./TaskComments";
import TaskTime from "./TaskTime";
import TaskAttachments from "./TaskAttachments";
import {
  api,
  controlClass,
  Dialog,
  Field,
  Notice,
  Panel,
  useConfirm,
  useUnsavedChanges,
  hasUnsavedWorkforceChanges,
} from "./shared";

export default function TaskDetail({
  id,
  admin,
  onChanged,
  onClose,
}: {
  id: string;
  admin: boolean;
  onChanged?: () => void;
  onClose?: () => void;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [reload, setReload] = useState(0);
  const [discussionRevision, setDiscussionRevision] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [commandBusy, setBusy] = useState(false);
  const lock = useRef(false);
  const retry = useRef({ payload: "", key: "" });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(taskForm());
  const [editVersion, setEditVersion] = useState(0);
  const [original, setOriginal] = useState("");
  const [summary, setSummary] = useState("");
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const busy = commandBusy || attachmentBusy;
  const attachmentBusyChanged = useCallback(
    (value: boolean) => setAttachmentBusy(value),
    [],
  );
  const [reason, setReason] = useState("");
  const [block, setBlock] = useState("");
  const [column, setColumn] = useState("");
  const { confirm, confirmation } = useConfirm();
  const unsaved = useUnsavedChanges(
    (editing && JSON.stringify(form) !== original) ||
      !!summary ||
      attachmentIds.length > 0 ||
      attachmentBusy ||
      !!reason ||
      !!block,
  );
  const base = admin ? "/admin/workforce/tasks" : "/employee/work/tasks";
  useEffect(() => {
    const abort = new AbortController();
    api<Detail>(`/api/workforce/tasks/${id}`, { signal: abort.signal })
      .then(async (result) => {
        const board = await api<BoardDetail>(
          `/api/workforce/boards/${result.task.board_id}`,
          { signal: abort.signal },
        );
        setData(result);
        setBoard(board);
        setError("");
      })
      .catch((e) => {
        if ([401, 403, 404].includes(e.status)) {
          setData(null);
          setBoard(null);
        }
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [id, reload]);
  const command = async (
    name: string,
    payload: Record<string, unknown>,
    success: string,
    version = data?.task.version,
    scope: "tasks" | "checklist" = "tasks",
  ) => {
    if (lock.current || attachmentBusy) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const serialized = JSON.stringify({
        id,
        version,
        command: name,
        scope,
        payload,
      });
      if (retry.current.payload !== serialized)
        retry.current = { payload: serialized, key: crypto.randomUUID() };
      await api(`/api/workforce/${scope}`, {
        method: "POST",
        body: JSON.stringify({
          id,
          version,
          command: name,
          payload,
          request_key: retry.current.key,
        }),
      });
      onChanged?.();
      window.dispatchEvent(new Event("workforce-notifications"));
      if (name === "edit") setEditing(false);
      if (name === "submit") {
        setSummary("");
        setAttachmentIds([]);
      }
      if (name === "review") setReason("");
      if (name === "block") setBlock("");
      setColumn("");
      setMessage(success);
      const latest = await api<Detail>(`/api/workforce/tasks/${id}`);
      setData(latest);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const closeEdit = async () => {
    if (busy || attachmentBusy) return;
    if (
      JSON.stringify(form) !== original &&
      !(await confirm("تجاهل تفاصيل المهمة غير المحفوظة؟"))
    )
      return;
    setEditing(false);
  };
  const closeDetail = async () => {
    if (busy || attachmentBusy) return;
    if (
      hasUnsavedWorkforceChanges() &&
      !(await confirm("تجاهل التغييرات غير المحفوظة والعودة للداشبورد؟"))
    )
      return;
    onClose?.();
  };
  if (!data || !board)
    return (
      <div className="space-y-4 p-6">
        {onClose ? (
          <Button variant="outline" onClick={closeDetail}>
            ← العودة للداشبورد
          </Button>
        ) : (
          <Link href={base}>← العودة للمهام</Link>
        )}
        <Notice message={error} error />
        {error ? (
          <Button type="button" onClick={() => setReload((n) => n + 1)}>
            إعادة المحاولة
          </Button>
        ) : (
          <p role="status">جارٍ تحميل المهمة…</p>
        )}
      </div>
    );
  const task = data.task;
  const frozen = !!task.archived_at || !!board.board.archived_at;
  const reviewing = task.column.kind === "review";
  const done = task.column.kind === "done";
  const submission = data.latestSubmission;
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      {confirmation}
      {unsaved}
      {onClose ? (
        <Button variant="outline" disabled={busy} onClick={closeDetail}>
          ← العودة لقائمة المهام
        </Button>
      ) : (
        <Link className="text-sm font-bold" href={base}>
          ← جميع المهام
        </Link>
      )}
      <header className="space-y-3 rounded-2xl bg-dark p-6 text-white">
        <div className="flex flex-wrap gap-2 text-sm">
          <span>{task.column.title}</span>
          <span>· أولوية {TASK_PRIORITIES[task.priority]}</span>
          {task.archived_at && <span>· مهمة مؤرشفة</span>}
          {board.board.archived_at && <span>· لوحة مؤرشفة</span>}
        </div>
        <h1 className="break-words text-2xl font-black">{task.title}</h1>
        <p className="text-sm">المسؤول: {data.assigneeName || "لم يسند بعد"}</p>
        <p className="text-sm text-white/80">
          {reviewing
            ? "الخطوة التالية: مراجعة المدير للتسليم."
            : done
              ? "اكتمل العمل وفق شروط المهمة."
              : task.blocked_reason
                ? "الخطوة التالية: معالجة العائق المسجل."
                : "الخطوة التالية: تنفيذ العمل ثم رفع النتيجة."}
        </p>
      </header>
      <Notice message={error} error />
      <Notice message={message} />
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => setReload((n) => n + 1)}
        >
          تحديث المهمة
        </Button>
        {data.canEdit && !frozen && !reviewing && !done && (
          <Button
            type="button"
            onClick={() => {
              const next = taskForm(task);
              setForm(next);
              setOriginal(JSON.stringify(next));
              setEditVersion(task.version);
              setEditing(true);
            }}
          >
            تعديل تفاصيل المهمة
          </Button>
        )}
        {data.canEdit && !board.board.archived_at && !reviewing && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              if (
                await confirm(
                  task.archived_at
                    ? "استعادة هذه المهمة؟"
                    : "أرشفة المهمة مع الاحتفاظ بتاريخها؟",
                )
              )
                await command(
                  "archive",
                  { archived: !task.archived_at },
                  task.archived_at ? "تمت استعادة المهمة" : "تمت أرشفة المهمة",
                );
            }}
          >
            {task.archived_at ? "استعادة المهمة" : "أرشفة المهمة"}
          </Button>
        )}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Panel title="تفاصيل التكليف">
            <div className="space-y-5 text-sm leading-7">
              <p className="font-bold">
                العميل / مجال العمل: {task.client_name || "غير محدد"}
              </p>
              {!data.canWork && (
                <p className="rounded-xl bg-slate-100 p-3">
                  هذه مهمة زميلة لك، وهي متاحة للقراءة فقط. إجراءات التنفيذ
                  والتسليم تخص الموظفة المسندة إليها المهمة.
                </p>
              )}
              <p className="whitespace-pre-wrap break-words">
                {task.description || "لا يوجد وصف إضافي."}
              </p>
              <div>
                <h3 className="font-bold">معيار الإنجاز والتسليم</h3>
                <p className="whitespace-pre-wrap break-words">
                  {task.completion_criteria || "لم يحدد معيار إضافي."}
                </p>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt>البداية</dt>
                  <dd>{workDate(task.starts_at)}</dd>
                </div>
                <div>
                  <dt>موعد التسليم — الرياض</dt>
                  <dd>{workDate(task.due_at)}</dd>
                </div>
                <div>
                  <dt>الوقت التقديري</dt>
                  <dd>
                    {task.estimate_minutes == null
                      ? "غير محدد"
                      : `${task.estimate_minutes} دقيقة`}
                  </dd>
                </div>
                <div>
                  <dt>اعتماد الإكمال</dt>
                  <dd>
                    {task.requires_approval
                      ? "مطلوب من المدير"
                      : "يمكن الإكمال بعد استيفاء المتطلبات"}
                  </dd>
                </div>
              </dl>
              {!data.canEdit && data.canWork && (
                <p className="text-muted">
                  تفاصيل تكليف المدير وموعده ومعيار إنجازه يحدّثها المدير.
                </p>
              )}
            </div>
          </Panel>
          <TaskChecklist
            items={data.checklist}
            version={task.version}
            canEdit={data.canEdit}
            canWork={data.canWork}
            frozen={frozen || reviewing || done}
            busy={busy}
            error={error}
            command={(name, payload, success, version) =>
              command(name, payload, success, version, "checklist")
            }
          />
          <TaskAttachments
            taskId={id}
            version={task.version}
            canWork={data.canWork}
            frozen={frozen || reviewing || done}
            disabled={busy}
            selected={attachmentIds}
            onSelected={setAttachmentIds}
            onBusy={attachmentBusyChanged}
            onChanged={() => setDiscussionRevision((n) => n + 1)}
          />
          {submission && (
            <Panel title="آخر تسليم وقرار المراجعة">
              <div className="space-y-3 text-sm leading-7">
                <p className="font-bold">
                  {
                    {
                      pending: "بانتظار قرار المدير",
                      approved: "تسليم معتمد",
                      changes: "أعيد للتعديل",
                    }[submission.status]
                  }
                </p>
                <p className="whitespace-pre-wrap break-words">
                  {submission.summary}
                </p>
                <p className="text-muted">
                  التسليم: {workDate(submission.created_at)}
                </p>
                <TaskAttachments
                  taskId={id}
                  submissionId={submission.id}
                  version={task.version}
                />
                {submission.decision_reason && (
                  <div className="rounded-xl bg-slate-50 p-4">
                    <h3 className="font-bold">سبب قرار المدير</h3>
                    <p className="whitespace-pre-wrap break-words">
                      {submission.decision_reason}
                    </p>
                    <p className="text-muted">
                      {workDate(submission.decided_at)}
                    </p>
                  </div>
                )}
              </div>
            </Panel>
          )}
          {data.canWork && !frozen && !reviewing && !done && (
            <Panel
              title="رفع التسليم"
              description="اكتب النتيجة المنجزة وما يحتاجه المدير للتحقق منها."
            >
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void command(
                    "submit",
                    { summary, attachment_ids: attachmentIds },
                    "أرسل التسليم إلى المدير للمراجعة",
                  );
                }}
              >
                <Field label="ملخص التسليم" id="task-submission">
                  <textarea
                    id="task-submission"
                    required
                    minLength={3}
                    maxLength={10000}
                    rows={4}
                    className={controlClass}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                  />
                </Field>
                <Button
                  type="submit"
                  loading={busy}
                  disabled={
                    attachmentBusy ||
                    !!task.blocked_reason ||
                    data.checklist.some(
                      (item) => item.required && !item.completed,
                    )
                  }
                >
                  إرسال للمراجعة
                </Button>
                {task.blocked_reason && (
                  <p className="text-sm text-muted">
                    أزل العائق بعد معالجته قبل التسليم.
                  </p>
                )}
                {data.checklist.some(
                  (item) => item.required && !item.completed,
                ) && (
                  <p className="text-sm text-muted">
                    أكمل بنود التحقق المطلوبة قبل التسليم.
                  </p>
                )}
              </form>
            </Panel>
          )}
          {data.canReview && reviewing && !frozen && (
            <Panel
              title="قرار المدير"
              description="القرار وسببه يظهران للموظف داخل المهمة."
            >
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void command(
                    "review",
                    { decision: "approved", reason },
                    "اعتمد التسليم وأصبحت المهمة مكتملة",
                  );
                }}
              >
                <Field label="سبب قرار المراجعة" id="task-review-reason">
                  <textarea
                    id="task-review-reason"
                    required
                    minLength={3}
                    maxLength={10000}
                    rows={3}
                    className={controlClass}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" loading={busy}>
                    اعتماد التسليم
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || reason.trim().length < 3}
                    onClick={() =>
                      command(
                        "review",
                        { decision: "changes", reason },
                        "أعيدت المهمة للموظف مع سبب التعديل",
                      )
                    }
                  >
                    إعادة للتعديل
                  </Button>
                </div>
              </form>
            </Panel>
          )}
        </div>
        <div className="space-y-6">
          <Panel title="العوائق">
            <p className="whitespace-pre-wrap break-words text-sm leading-7">
              {task.blocked_reason || "لا يوجد عائق مسجل."}
            </p>
            {data.canWork && !frozen && !reviewing && !done && (
              <div className="mt-4 space-y-3">
                <Field label="سبب توقف العمل" id="task-block">
                  <textarea
                    id="task-block"
                    maxLength={2000}
                    className={controlClass}
                    value={block}
                    onChange={(e) => setBlock(e.target.value)}
                  />
                </Field>
                <Button
                  type="button"
                  disabled={busy || !block.trim()}
                  onClick={() =>
                    command("block", { reason: block }, "تم تسجيل العائق")
                  }
                >
                  تسجيل العائق
                </Button>
                {task.blocked_reason && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      command(
                        "block",
                        { reason: "" },
                        "تمت إزالة العائق بعد معالجته",
                      )
                    }
                  >
                    تمت معالجة العائق
                  </Button>
                )}
              </div>
            )}
          </Panel>
          {data.canWork && !frozen && !reviewing && (!done || admin) && (
            <Panel title={done ? "إعادة فتح المهمة" : "تحديث حالة العمل"}>
              <form
                className="space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    !done ||
                    (await confirm("إعادة فتح المهمة المكتملة للتنفيذ؟"))
                  )
                    await command(
                      "move",
                      { column_id: column },
                      "تم تحديث حالة المهمة",
                    );
                }}
              >
                <Field label="نقل إلى حالة" id="task-column">
                  <select
                    id="task-column"
                    required
                    className={controlClass}
                    value={column}
                    onChange={(e) => setColumn(e.target.value)}
                  >
                    <option value="">اختر الحالة</option>
                    {board.columns
                      .filter(
                        (c) =>
                          !c.archived_at &&
                          c.id !== task.column_id &&
                          (c.kind === "new" ||
                            c.kind === "in_progress" ||
                            (c.kind === "done" && !task.requires_approval)),
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                  </select>
                </Field>
                <Button type="submit" disabled={busy || !column}>
                  حفظ الحالة
                </Button>
              </form>
            </Panel>
          )}
        </div>
      </div>
      <TaskTime
        taskId={id}
        taskVersion={task.version}
        onChanged={() => setDiscussionRevision((n) => n + 1)}
      />
      <TaskComments
        taskId={id}
        taskVersion={task.version}
        frozen={frozen}
        onChanged={() => setDiscussionRevision((n) => n + 1)}
      />
      <TaskHistory
        id={id}
        version={task.version}
        refreshKey={discussionRevision}
      />
      <Dialog title="تعديل تفاصيل المهمة" open={editing} onClose={closeEdit}>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              void command(
                "edit",
                taskPayload(form, admin),
                "تم حفظ تفاصيل المهمة",
                editVersion,
              );
            } catch {
              setError("تحقق من صحة التواريخ والأوقات");
            }
          }}
        >
          <TaskFields value={form} onChange={setForm} admin={admin} />
          <Notice message={error} error />
          <Button type="submit" loading={busy}>
            حفظ تفاصيل المهمة
          </Button>
        </form>
      </Dialog>
    </div>
  );
}

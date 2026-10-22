"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import {
  TASK_PRIORITIES,
  workDate,
  type BoardDetail,
  type TaskDetail as Detail,
} from "@/lib/workforce/task-types";
import TaskFields, { CoAssignees, EmployeePicker, taskForm, taskPayload } from "./TaskFields";
import TaskChecklist from "./TaskChecklist";
import TaskHistory from "./TaskHistory";
import TaskComments from "./TaskComments";
import TaskTime from "./TaskTime";
import { WorkStartButton } from "./WorkSessionProvider";
import TaskAttachments from "./TaskAttachments";
import { taskEditReason } from "./TaskEditAction";
import { taskNextAction } from "@/lib/workforce/task-next-action";
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
  initialPanel = "brief",
}: {
  initialPanel?: string;
  id: string;
  admin: boolean;
  onChanged?: () => void;
  onClose?: () => void;
}) {
  const startingPanel = initialPanel === "edit" ? "brief" : initialPanel;
  const router = useRouter();
  const editRequested = useRef(initialPanel === "edit");
  const workflowForm = useRef<HTMLElement>(null);
  const uploadWorkflow = useRef<HTMLElement>(null);
  const blockers = useRef<HTMLDetailsElement>(null);
  const pendingWorkflowFocus = useRef(false);
  const [focusWorkflow, setFocusWorkflow] = useState(0);
  const [tab, setTab] = useState(startingPanel);
  const [visited, setVisited] = useState<Record<string, boolean>>({
    [startingPanel]: true,
  });
  function show(panel: string) {
    setTab(panel);
    setVisited((current) => ({ ...current, [panel]: true }));
  }
  useEffect(() => {
    if (pendingWorkflowFocus.current && tab === "submit") {
      const target = uploadWorkflow.current && !uploadWorkflow.current.hidden ? uploadWorkflow.current : workflowForm.current;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.focus({ preventScroll: true });
      pendingWorkflowFocus.current = false;
    }
  }, [focusWorkflow, tab]);
  const [data, setData] = useState<Detail | null>(null);
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [reload, setReload] = useState(0);
  const [discussionRevision, setDiscussionRevision] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [commandBusy, setBusy] = useState(false);
  const lock = useRef(false);
  const loadingDetails = useRef(false),
    queuedRefresh = useRef(false);
  const retry = useRef({ payload: "", key: "" });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(taskForm());
  const [editVersion, setEditVersion] = useState(0);
  const [original, setOriginal] = useState("");
  const [summary, setSummary] = useState("");
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState(false);
  const busy = commandBusy || attachmentBusy;
  const attachmentBusyChanged = useCallback(
    (value: boolean) => setAttachmentBusy(value),
    [],
  );
  const [reason, setReason] = useState("");
  const [reviewAssignment, setReviewAssignment] = useState<ReturnType<typeof taskForm> | null>(null);
  const [pendingReviewFiles, setPendingReviewFiles] = useState(false);
  const [block, setBlock] = useState("");
  const [column, setColumn] = useState("");
  const { confirm, confirmation } = useConfirm();
  const unsaved = useUnsavedChanges(
    (editing && JSON.stringify(form) !== original) ||
      !!summary ||
      attachmentIds.length > 0 ||
      attachmentBusy ||
      !!reason ||
      !!reviewAssignment ||
      !!block,
  );
  const base = admin ? "/admin/workforce/tasks" : "/employee/work/tasks";
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ taskIds?: string[] }>).detail;
      if (detail && !detail.taskIds?.includes(id)) return;
      if (!busy && !hasUnsavedWorkforceChanges()) {
        if (loadingDetails.current) queuedRefresh.current = true;
        else setReload((n) => n + 1);
      }
    };
    window.addEventListener("workforce-data-changed", refresh);
    return () => window.removeEventListener("workforce-data-changed", refresh);
  }, [busy, id]);
  useEffect(() => {
    const abort = new AbortController();
    loadingDetails.current = true;
    api<Detail>(`/api/workforce/tasks/${id}`, { signal: abort.signal })
      .then(async (result) => {
        setData(result);
        setBoard(result.boardDetail);
        setError("");
        if (editRequested.current) {
          editRequested.current = false;
          if (result.canAssign && result.task.column.kind === "review") {
            setTab("submit");
            setVisited(current => ({ ...current, submit: true }));
          }
          if (result.canEdit && !taskEditReason(result.task)) {
            const next = taskForm(result.task);
            setForm(next);
            setOriginal(JSON.stringify(next));
            setEditVersion(result.task.version);
            setEditing(true);
          }
        }
      })
      .catch((e) => {
        if ([401, 403, 404].includes(e.status)) {
          setData(null);
          setBoard(null);
        }
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (abort.signal.aborted) return;
        loadingDetails.current = false;
        if (queuedRefresh.current) {
          queuedRefresh.current = false;
          setReload((n) => n + 1);
        }
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
      if (name === "delete") {
        setReason(""); setSummary(""); setAttachmentIds([]); setReviewAssignment(null); setBlock("");
        if (onClose) onClose(); else router.replace(base);
        return true;
      }
      if (name === "edit") setEditing(false);
      if (name === "submit") {
        setSummary("");
        setAttachmentIds([]);
      }
      if (name === "review") setReason("");
      if (name === "edit") setReviewAssignment(null);
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
  const review = data.latestReview ?? (submission?.status !== "pending" ? submission : null);
  const nextAction = taskNextAction({ frozen, kind: task.column.kind,
    canWork: data.canWork, canReview: data.canReview,
    blocked: !!task.blocked_reason, submissionStatus: submission?.status });
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 p-4 md:p-8">
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
      <header className="space-y-3 rounded-3xl bg-[#102b57] p-6 text-white shadow-sm">
        <div className="flex flex-wrap gap-2 text-sm">
          <span>{task.column.title}</span>
          {task.priority !== "normal" && (
            <span>· {TASK_PRIORITIES[task.priority]}</span>
          )}
          {task.archived_at && <span>· مهمة مؤرشفة</span>}
          {board.board.archived_at && <span>· لوحة مؤرشفة</span>}
        </div>
        <h1 className="break-words text-2xl font-black">{task.title}</h1>
        {data.canWork && !frozen && !reviewing && !done && <WorkStartButton taskId={task.id} />}
        <p className="text-sm">المسؤول: {data.assigneeName || "لم يسند بعد"}</p>
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
        {data.canEdit && (
          <Button
            type="button"
            disabled={busy || (!!taskEditReason(task) && !(reviewing && data.canAssign && !frozen))}
            title={reviewing && data.canAssign && !frozen ? undefined : taskEditReason(task) || undefined}
            onClick={() => {
              if (reviewing && data.canAssign && !frozen) {
                show("submit");
                return;
              }
              const next = taskForm(task);
              setForm(next);
              setOriginal(JSON.stringify(next));
              setEditVersion(task.version);
              setEditing(true);
            }}
          >
            {reviewing && data.canAssign ? "تعديل الإسناد" : data.canAssign ? "تعديل وإعادة الإسناد" : "تعديل المهمة"}
          </Button>
        )}
        {data.canArchive && !board.board.archived_at && !reviewing && (
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
        {admin && <Button type="button" variant="outline" disabled={busy} onClick={async () => {
          if (await confirm("حذف هذه المهمة دون إرسال إشعارات أو بريد؟"))
            await command("delete", {}, "حُذفت المهمة");
        }}>حذف المهمة</Button>}
      </div>
      <nav
        aria-label="تفاصيل المهمة"
        className="flex flex-wrap gap-2 rounded-2xl bg-white p-3 shadow-sm"
      >
        {[
          ["brief", "التفاصيل"],
          ["files", "المرفقات"],
          ["submit", reviewing ? "التسليم والاعتماد" : "التسليم"],
          ["comments", "التعليقات"],
          ["history", "السجل والوقت"],
        ].map(([key, label]) => (
          <Button
            key={key}
            variant={tab === key ? "primary" : "outline"}
            size="sm"
            onClick={() => show(key)}
          >
            {label}
          </Button>
        ))}
      </nav>
      {(tab === "brief" || tab === "submit") && (
        <section aria-label="التسليم والمراجعة" className="grid items-start gap-4 lg:grid-cols-2">
          <Panel title="آخر تسليم" tone="sky">
            {submission ? <div className="space-y-4 text-sm leading-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full border border-current px-3 py-1 text-xs font-bold">
                  {{pending: "بانتظار المراجعة", approved: "معتمد", changes: "أعيد للتعديل"}[submission.status]}
                </span>
                <span className="text-xs text-muted">المحاولة {submission.submission_number} · {workDate(submission.created_at)}</span>
              </div>
              <p className="max-h-64 overflow-auto whitespace-pre-wrap break-words">{submission.summary}</p>
              <TaskAttachments key={submission.id} taskId={id} submissionId={submission.id} version={task.version} />
            </div> : <p className="text-sm text-muted">لم يُرسل تسليم بعد</p>}
          </Panel>
          <div className="space-y-4">
            <Panel title="الإجراء التالي" tone="emerald">
              <p className="text-sm font-bold">{nextAction.label}</p>
              {nextAction.action && <Button className="mt-4" disabled={busy} onClick={() => {
                if (nextAction.action === "block") {
                  if (blockers.current) { blockers.current.open = true; blockers.current.scrollIntoView({behavior: "smooth", block: "start"}); }
                } else { pendingWorkflowFocus.current = true; show("submit"); setFocusWorkflow(n => n + 1); }
              }}>{nextAction.button}</Button>}
            </Panel>
            <Panel title="ملاحظات المراجعة" tone="amber">
              {review?.decision_reason ? <div className="space-y-2 text-sm leading-7">
                <p className="text-xs font-bold">{review.status === "approved" ? "اعتماد" : "طلب تعديل"} · المحاولة {review.submission_number}</p>
                <p className="max-h-64 overflow-auto whitespace-pre-wrap break-words">{review.decision_reason}</p>
                <p className="text-xs text-muted">{workDate(review.decided_at)}</p>
              </div> : <p className="text-sm text-muted">{submission?.status === "pending" ? "لم يصدر قرار بعد" : "لا توجد ملاحظات"}</p>}
            </Panel>

          </div>
        </section>
      )}
      <div className="space-y-5">
        <div className="space-y-6">
          <section hidden={tab !== "brief"} className="space-y-5">
            <div className="grid items-start gap-4 md:grid-cols-2">
              <Panel title="تفاصيل المهمة" tone="sky">
                <p className="whitespace-pre-wrap break-words text-sm leading-7">
                  {task.description || "—"}
                </p>
                <dl className="mt-5 grid gap-4 border-t border-sky-200 pt-4 text-sm sm:grid-cols-2">
                  {task.starts_at && (
                    <div>
                      <dt className="text-muted">البداية</dt>
                      <dd className="mt-1 font-bold">
                        {new Date(task.starts_at).toLocaleDateString("ar-SA", {
                          calendar: "gregory",
                          timeZone: "Asia/Riyadh",
                        })}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-muted">التسليم</dt>
                    <dd className="mt-1 font-bold">
                      {task.due_at
                        ? new Date(task.due_at).toLocaleDateString("ar-SA", {
                            calendar: "gregory",
                            timeZone: "Asia/Riyadh",
                          })
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </Panel>
              <Panel title="المطلوب تسليمه" tone="violet">
                <p className="whitespace-pre-wrap break-words text-sm leading-7">
                  {task.completion_criteria || "—"}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-violet-200 pt-4">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold">
                    {task.requires_approval ? "يتطلب اعتمادًا" : "إنجاز مباشر"}
                  </span>
                </div>
              </Panel>
            </div>
            {(data.canConfigureChecklist || data.checklist.length > 0) && (
              <TaskChecklist
                items={data.checklist}
                version={task.version}
                canEdit={data.canConfigureChecklist}
                canWork={data.canWork}
                frozen={frozen || reviewing || done}
                busy={busy}
                error={error}
                command={(name, payload, success, version) =>
                  command(name, payload, success, version, "checklist")
                }
              />
            )}
          </section>
          {(visited.files || visited.submit) && (
            <section
              ref={uploadWorkflow}
              tabIndex={-1}
              aria-label="تجهيز المرفقات"
              hidden={
                tab !== "files" &&
                !(
                  tab === "submit" &&
                  data.canWork &&
                  !frozen &&
                  !reviewing &&
                  !done
                )
              }
            >
              <TaskAttachments
                taskId={id}
                version={task.version}
                canWork={data.canWork}
                frozen={frozen || reviewing || done}
                disabled={busy}
                selected={attachmentIds}
                onSelected={setAttachmentIds}
                onBusy={attachmentBusyChanged}
                onPendingChange={setPendingAttachments}
                onChanged={() => setDiscussionRevision((n) => n + 1)}
              />
            </section>
          )}
          {visited.submit && (
            <section
              ref={workflowForm}
              tabIndex={-1}
              aria-label={reviewing ? "قرار المراجعة" : "تجهيز التسليم"}
              hidden={tab !== "submit"}
              className={`grid items-start gap-4 ${data.canReview && reviewing ? "lg:grid-cols-2" : ""}`}
            >
              {data.canWork && !frozen && !reviewing && !done && (
                <Panel title="إرسال التسليم" tone="emerald">
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
                        pendingAttachments ||
                        !!task.blocked_reason ||
                        data.checklist.some(
                          (item) => item.required && !item.completed,
                        )
                      }
                    >
                      إرسال للمراجعة
                    </Button>
                    {pendingAttachments && (
                      <p
                        role="status"
                        className="text-sm font-bold text-amber-800"
                      >
                        ارفع الملفات المختارة أولًا
                      </p>
                    )}
                    {task.blocked_reason && (
                      <p className="text-sm text-muted">المهمة متوقفة بعائق</p>
                    )}
                    {attachmentIds.length > 0 && <p className="text-sm font-bold">{attachmentIds.length} مرفق مع التسليم</p>}
                    {data.checklist.some(
                      (item) => item.required && !item.completed,
                    ) && (
                      <p className="text-sm text-muted">
                        بنود التحقق غير مكتملة
                      </p>
                    )}
                  </form>
                </Panel>
              )}
              {data.canAssign && reviewing && !frozen && (
                <Panel title="المسند إليهم" tone="sky">
                  <EmployeePicker includeAdmins value={(reviewAssignment ?? taskForm(task)).assignee_id}
                    onChange={value => setReviewAssignment(current => ({ ...(current ?? taskForm(task)), assignee_id: value }))} />
                  <CoAssignees value={(reviewAssignment ?? taskForm(task)).co_assignee_ids}
                    primary={(reviewAssignment ?? taskForm(task)).assignee_id}
                    onChange={ids => setReviewAssignment(current => ({ ...(current ?? taskForm(task)), co_assignee_ids: ids }))} />
                  <Button disabled={busy || !reviewAssignment} onClick={() => {
                    if (!reviewAssignment) return;
                    const assignment = taskPayload(reviewAssignment, admin, true);
                    void command("edit", { assignee_id: assignment.assignee_id, assignee_admin_id: assignment.assignee_admin_id,
                      co_assignee_ids: assignment.co_assignee_ids }, "تم تحديث المسند إليهم");
                  }}>حفظ الإسناد</Button>
                </Panel>
              )}
              {data.canReview && reviewing && !frozen && (
                <Panel title="قرار المراجعة" tone="amber">
                  <details className="mb-4 rounded-xl border border-border p-3">
                    <summary className="cursor-pointer text-sm font-bold">إرفاق ملفات للمراجعة</summary>
                    <div className="mt-3"><TaskAttachments taskId={id} version={task.version} canWork reviewMode
                      disabled={commandBusy} onBusy={attachmentBusyChanged} onPendingChange={setPendingReviewFiles} /></div>
                  </details>
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (pendingReviewFiles || reviewAssignment) return;
                      void command(
                        "review",
                        { decision: "approved", reason },
                        "اعتمد التسليم وأصبحت المهمة مكتملة",
                      );
                    }}
                  >
                    {reviewAssignment && <p role="status" className="text-sm font-bold">احفظ الإسناد أولًا</p>}
                    {pendingReviewFiles && <p role="status" className="text-sm font-bold">ارفع المرفقات أولًا</p>}
                    <Field label="سبب قرار المراجعة" id="task-review-reason">
                      <textarea
                        id="task-review-reason"
                        required
                        minLength={3}
                        rows={3}
                        className={controlClass}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </Field>
                    <div className="flex flex-wrap gap-3">
                      <Button type="submit" loading={busy} disabled={pendingReviewFiles || !!reviewAssignment}>
                        اعتماد التسليم
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy || reason.trim().length < 3 || pendingReviewFiles || !!reviewAssignment}
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
            </section>
          )}
        </div>
        <details ref={blockers} className="rounded-2xl border border-border bg-white p-4">
          <summary className="cursor-pointer text-sm font-bold">
            الحالة والعوائق
          </summary>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
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
        </details>
      </div>
      {visited.history && (
        <section hidden={tab !== "history"} className="space-y-5">
          <TaskTime
            taskId={id}
            taskVersion={task.version}
            onChanged={() => setDiscussionRevision((n) => n + 1)}
          />

          <TaskHistory
            id={id}
            version={task.version}
            refreshKey={discussionRevision}
          />
        </section>
      )}
      {visited.comments && (
        <section hidden={tab !== "comments"}>
          <TaskComments
            taskId={id}
            taskVersion={task.version}
            frozen={frozen}
            onChanged={() => setDiscussionRevision((n) => n + 1)}
          />
        </section>
      )}
      <Dialog title="تعديل وإسناد" open={editing} onClose={closeEdit}>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              void command(
                "edit",
                taskPayload(form, admin, data.canAssign),
                "تم حفظ تفاصيل المهمة",
                editVersion,
              );
            } catch {
              setError("تحقق من صحة التواريخ والأوقات");
            }
          }}
        >
          <TaskFields
            value={form}
            onChange={setForm}
            admin={admin}
            canAssign={data.canAssign}
          />
          <Notice message={error} error />
          <Button type="submit" loading={busy}>
            حفظ تفاصيل المهمة
          </Button>
        </form>
      </Dialog>
    </div>
  );
}

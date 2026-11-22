"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import type { OfficeCoordinationControl } from "./useOfficeCoordination";
import type { OfficeInteraction } from "@/lib/virtual-office/coordination";
import type { OfficeStaff } from "@/lib/virtual-office/domain";
import s from "./office.module.css";
const labels: Record<string, string> = {
  pending_manager: "بانتظار المدير",
  approved: "أُسندت المرحلة",
  requested: "طلب مساعدة",
  accepted: "المساعدة جارية",
  resolved: "اكتملت المساعدة",
  rejected: "يحتاج تعديلًا",
  cancelled: "ملغي",
  handoff: "بانتظار المدير",
  plan_review: "خطة للموافقة",
  review: "للمراجعة",
  failed: "يحتاج مساعدة",
  running: "قيد العمل",
  queued: "أُسندت المرحلة",
  completed: "معتمد",
};
export default function OfficeCoordinationPanel({
  control,
  staff,
  admin,
  onSession,
}: {
  control: OfficeCoordinationControl;
  staff: OfficeStaff[];
  admin: boolean;
  onSession: (event: OfficeInteraction) => void;
}) {
  const { data, error, pending, selected } = control,
    dialog = useRef<HTMLDialogElement>(null),
    id = useId();
  const [draft, setDraft] = useState<"help" | "handoff" | "route" | null>(null),
    [taskId, setTaskId] = useState(""),
    [target, setTarget] = useState(""),
    [summary, setSummary] = useState(""),
    [nextTitle, setNextTitle] = useState(""),
    [resolution, setResolution] = useState(""),
    [notice, setNotice] = useState("");
  const [routeId, setRouteId] = useState<string | null>(null);
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
    else if (!selected && dialog.current?.open) dialog.current.close();
  }, [selected]);
  const event =
    data?.interactions.find((e) => e.id === selected?.id) || selected;
  const record = data?.records.find((r) => r.id === event?.resource.id),
    task = data?.tasks.find((t) => t.id === (taskId || data?.candidateTaskId));
  const prefix = admin ? "/admin/workforce/tasks/" : "/employee/work/tasks/";
  const morning = data?.interactions.find((e) => e.kind === "morning");
  function prepare(kind: "help" | "handoff", source?: string) {
    const selectedTask =
      source || data?.candidateTaskId || data?.tasks[0]?.id || "";
    setTaskId(selectedTask);
    control.setTask(selectedTask);
    setDraft(kind);
    setTarget("");
    setNotice("");
    setSummary(
      kind === "help"
        ? data?.tasks.find((t) => t.id === selectedTask)?.blockedReason || ""
        : "",
    );
  }
  async function action(command: string, extra: Record<string, unknown> = {}) {
    if (!record) return;
    const result = await control.command(command, record.id, record.version, {
      ...extra,
      taskVersion: record.taskVersion,
    });
    if (result) {
      setNotice("تم حفظ التحديث.");
      setResolution("");
    }
  }
  return (
    <aside className={s.coordinationPanel} aria-labelledby={`${id}-heading`}>
      <header>
        <div>
          <span>تواصل العمل</span>
          <h2 id={`${id}-heading`}>نبض الفريق</h2>
        </div>
        <button
          type="button"
          onClick={() => void control.refresh()}
          aria-label="تحديث نبض الفريق"
        >
          ↻
        </button>
      </header>
      {error && (
        <p className={s.humanError} role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <p>جارٍ تجهيز ملخص الفريق…</p>
      ) : (
        <>
          <button
            type="button"
            className={s.morningCard}
            onClick={() => {
              if (morning) {
                control.open(morning);
                control.play(morning);
              }
            }}
          >
            <span>
              ملخص الصباح ·{" "}
              {new Intl.DateTimeFormat("ar-SA", {
                timeZone: "Asia/Riyadh",
                month: "short",
                day: "numeric",
              }).format(new Date(data.briefing.generatedAt))}
            </span>
            <strong>
              {data.briefing.dueToday} لليوم <i aria-hidden="true">·</i>{" "}
              {data.briefing.pending} للموافقة
            </strong>
            <small>
              {data.briefing.completed} منجزة في آخر يوم عمل ·{" "}
              {data.briefing.blocked} تحتاج مساعدة
            </small>
          </button>
          <div className={s.coordinationActions}>
            <button type="button" onClick={() => prepare("handoff")}>
              تسليم لزميل
            </button>
            <button type="button" onClick={() => prepare("help")}>
              طلب مساعدة
            </button>
          </div>
          {!!data.suggestions.length && (
            <details className={s.helpSuggestions}>
              <summary>{data.suggestions.length} فرص للمساندة</summary>
              <ul>
                {data.suggestions.slice(0, 3).map((suggestion) => (
                  <li key={suggestion.taskId}>
                    <strong>
                      {
                        data.tasks.find((t) => t.id === suggestion.taskId)
                          ?.title
                      }
                    </strong>
                    <p>{suggestion.reason}</p>
                    <button
                      type="button"
                      onClick={() => prepare("help", suggestion.taskId)}
                    >
                      اقترح مساندًا
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {draft && (
            <form
              className={s.coordinationForm}
              action="/api/workforce/office-coordination"
              method="post"
              aria-labelledby={`${id}-form-title`}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!task) return;
                const route = data.records.find((r) => r.id === routeId);
                const result =
                  draft === "route" && route
                    ? await control.command("route", route.id, route.version, {
                        targetId: target || data.candidates[0]?.employeeId,
                      })
                    : await control.command("create", null, null, {
                        kind: draft,
                        taskId: task.id,
                        taskVersion: task.version,
                        targetId:
                          target ||
                          (draft === "help" && data.candidateTaskId === task.id
                            ? data.candidates[0]?.employeeId
                            : null) ||
                          null,
                        summary,
                        nextTitle: draft === "handoff" ? nextTitle : "",
                      });
                if (result) {
                  setDraft(null);
                  setSummary("");
                  setNextTitle("");
                  setNotice(
                    draft === "handoff"
                      ? "التسليم محفوظ، والمرحلة التالية تنتظر موافقة المدير."
                      : "طلب المساعدة محفوظ في نبض الفريق.",
                  );
                }
              }}
            >
              <h3 id={`${id}-form-title`}>
                {draft === "handoff"
                  ? "جهّز التسليم التالي"
                  : draft === "route"
                    ? "ترشيح مساند"
                    : "نلقى لك المساند المناسب"}
              </h3>
              <label htmlFor={`${id}-task`}>المهمة</label>
              <select
                id={`${id}-task`}
                name="task"
                required
                value={taskId || data.candidateTaskId || ""}
                onChange={(e) => {
                  setTaskId(e.target.value);
                  control.setTask(e.target.value);
                  setTarget("");
                }}
              >
                <option value="">اختر المهمة</option>
                {data.tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <label htmlFor={`${id}-target`}>
                {draft === "handoff" ? "المستلم" : "المساند"}
              </label>
              <select
                id={`${id}-target`}
                name="target"
                required={draft === "handoff"}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">
                  {draft === "handoff"
                    ? "اختر زميلًا"
                    : data.candidateTaskId !== task?.id
                      ? "جارٍ تحديث الترشيح…"
                      : data.candidates[0]
                        ? `الترشيح: ${data.candidates[0].name} — ${data.candidates[0].availability}`
                        : "إلى المدير لترشيح مساند"}
                </option>
                {(draft === "handoff"
                  ? staff.filter((p) => p.id !== data.employeeId)
                  : data.candidateTaskId === task?.id
                    ? data.candidates.map((c) => ({
                        id: c.employeeId,
                        name: c.name,
                        jobTitle: c.role,
                      }))
                    : []
                ).map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name} · {p.jobTitle}
                  </option>
                ))}
              </select>
              {draft !== "handoff" && data.candidateTaskId === task?.id && (
                <p>
                  {data.candidates[0]?.reason ||
                    "لا يوجد زميل آخر مخوّل بالمهمة حاليًا؛ يظهر الطلب للمدير ليحدد المساند."}
                </p>
              )}
              {draft === "handoff" && (
                <>
                  <label htmlFor={`${id}-next`}>عنوان المرحلة التالية</label>
                  <input
                    id={`${id}-next`}
                    name="nextTitle"
                    required
                    minLength={3}
                    maxLength={160}
                    value={nextTitle}
                    onChange={(e) => setNextTitle(e.target.value)}
                  />
                </>
              )}
              {draft !== "route" && (
                <>
                  <label htmlFor={`${id}-summary`}>
                    {draft === "handoff"
                      ? "التسليم والتعليمات للمستلم"
                      : "في ماذا تحتاج المساعدة؟"}
                  </label>
                  <textarea
                    id={`${id}-summary`}
                    name="summary"
                    required
                    minLength={3}
                    maxLength={2000}
                    rows={3}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                  />
                </>
              )}
              {draft === "handoff" && (
                <p>
                  لن تُنشأ المهمة التالية قبل اعتماد المدير واكتمال مراجعة المهمة
                  الأصلية.
                </p>
              )}
              <div>
                <button
                  className={s.primary}
                  type="submit"
                  disabled={
                    pending ||
                    (draft === "route" && !target && !data.candidates.length) ||
                    (draft !== "handoff" && data.candidateTaskId !== task?.id)
                  }
                >
                  {pending
                    ? "جارٍ الحفظ…"
                    : draft === "handoff"
                      ? "ارفع التسليم للموافقة"
                      : draft === "route"
                        ? "إسناد المساعدة"
                        : "أرسل طلب المساعدة"}
                </button>
                <button
                  type="button"
                  className={s.secondary}
                  onClick={() => setDraft(null)}
                >
                  إغلاق
                </button>
              </div>
            </form>
          )}
          <ul className={s.coordinationFeed}>
            {data.interactions
              .filter((e) => e.kind !== "morning")
              .slice(0, 10)
              .map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      control.open(item);
                      setResolution("");
                    }}
                  >
                    <small>{labels[item.state] || "تحديث عمل"}</small>
                    <strong>{item.title}</strong>
                    <span>
                      {item.from.name} ← {item.to.name}
                    </span>
                    <p>{item.text}</p>
                  </button>
                  <button
                    className={s.replayInteraction}
                    type="button"
                    onClick={() => control.play(item)}
                    aria-label={`عرض تفاعل ${item.title}`}
                  >
                    عرض التفاعل ↗
                  </button>
                </li>
              ))}
          </ul>
          {!data.interactions.some((e) => e.kind !== "morning") && (
            <p>التسليمات وطلبات المساعدة تظهر هنا عند حدوثها.</p>
          )}
        </>
      )}
      <p className={s.notice} role="status">
        {notice}
      </p>
      <dialog
        ref={dialog}
        className={s.chatDialog}
        aria-labelledby={`${id}-dialog-title`}
        onClose={() => control.open(null)}
        {...{ closedby: "closerequest" }}
      >
        <div className={s.dialogBar}>
          <span>إشعار عمل من النظام</span>
          <form method="dialog">
            <button type="submit" autoFocus aria-label="إغلاق تفاصيل التفاعل">
              ×
            </button>
          </form>
        </div>
        {event && (
          <div className={s.coordinationDetails}>
            <h2 id={`${id}-dialog-title`}>{event.title}</h2>
            <p>{event.text}</p>
            {error && (
              <p role="alert" className={s.humanError}>
                {error}
              </p>
            )}
            {event.kind === "morning" && data && (
              <>
                <p className={s.humanExplanation}>
                  من السجلات المتاحة لك · يتحدث تلقائيًا مع يوم العمل.
                </p>
                {data.briefing.sections.map((section) => (
                  <section key={section.title}>
                    <h3>{section.title}</h3>
                    {section.items.length ? (
                      <ul>
                        {section.items.map((item, i) => (
                          <li key={i}>
                            <Link href={item.href}>{item.text}</Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>لا توجد سجلات في هذا القسم حاليًا.</p>
                    )}
                  </section>
                ))}
                {data.briefing.limited && (
                  <p>الملخص يغطي أحدث ٢٠٠ مهمة متاحة لك.</p>
                )}
              </>
            )}
            {event.resource.type === "session" && (
              <button
                type="button"
                className={s.primary}
                onClick={() => {
                  control.open(null);
                  onSession(event);
                }}
              >
                فتح التسليم وموافقة المدير
              </button>
            )}
            {event.resource.type === "task" && (
              <Link className={s.primary} href={prefix + event.resource.id}>
                فتح المهمة والمراجعة
              </Link>
            )}
            {record && (
              <>
                <h3>{labels[record.state]}</h3>
                <p>{record.summary}</p>
                {record.resolution && <p>{record.resolution}</p>}
                {record.taskId && (
                  <Link href={prefix + record.taskId}>المهمة الأصلية ←</Link>
                )}
                {record.nextTaskId && (
                  <Link className={s.primary} href={prefix + record.nextTaskId}>
                    فتح المرحلة المسندة
                  </Link>
                )}
                {record.state === "pending_manager" && record.canApprove && (
                  <>
                    <p>
                      {record.taskState === "done"
                        ? "تمت مراجعة المهمة الأصلية. يمكنك إسناد المرحلة التالية."
                        : "أكمل مراجعة المهمة الأصلية واعتمادها أولًا."}
                    </p>
                    <button
                      type="button"
                      className={s.primary}
                      disabled={pending || record.taskState !== "done"}
                      onClick={() => void action("approve")}
                    >
                      موافق، أسند المرحلة التالية
                    </button>
                  </>
                )}
                {record.canAccept && (
                  <button
                    className={s.primary}
                    type="button"
                    disabled={pending}
                    onClick={() => void action("accept")}
                  >
                    أنا أساعدك
                  </button>
                )}
                {record.canRoute && (
                  <button
                    className={s.secondary}
                    type="button"
                    onClick={() => {
                      control.open(null);
                      setRouteId(record.id);
                      setDraft("route");
                      setTaskId(record.taskId || "");
                      control.setTask(record.taskId || "");
                      setTarget("");
                    }}
                  >
                    ترشيح مساند
                  </button>
                )}
                {(record.canResolve ||
                  (record.canApprove &&
                    record.state === "pending_manager")) && (
                  <form
                    action="/api/workforce/office-coordination"
                    method="post"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(
                        record.kind === "help" ? "resolve" : "reject",
                        { resolution },
                      );
                    }}
                  >
                    <label htmlFor={`${id}-resolution`}>
                      {record.kind === "help"
                        ? "خلاصة المساعدة"
                        : "التعديل المطلوب"}
                    </label>
                    <textarea
                      id={`${id}-resolution`}
                      name="resolution"
                      rows={3}
                      required
                      minLength={3}
                      maxLength={2000}
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                    />
                    <button
                      className={s.secondary}
                      type="submit"
                      disabled={pending}
                    >
                      {record.kind === "help"
                        ? "تمت المساعدة"
                        : "أعد التسليم للتعديل"}
                    </button>
                  </form>
                )}
                {record.canCancel && (
                  <button
                    className={s.secondary}
                    type="button"
                    disabled={pending}
                    onClick={() => void action("cancel")}
                  >
                    إلغاء الطلب
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </dialog>
    </aside>
  );
}

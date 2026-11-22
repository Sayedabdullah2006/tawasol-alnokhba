"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  OFFICE_AGENTS,
  OFFICE_CONTRACT_VERSION,
  OFFICE_APPEARANCE,
  appearanceForStaff,
  type OfficeStaff,
  type OfficePersonId,
  STATUS_LABELS,
  KIND_LABELS,
  agentById,
  currentAgent,
  sessionSteps,
  type AgentId,
  type OfficeMessage,
  type OfficeSnapshot,
  type SessionKind,
  type OfficeSession,
} from "@/lib/virtual-office/domain";
import s from "./office.module.css";
import HumanStaffPanel from "./HumanStaffPanel";
import OfficePlanCard from "./OfficePlanCard";
import {
  firstName,
  officeExcerpt,
  plainOfficeText,
} from "@/lib/virtual-office/presentation";

const OfficeScene = dynamic(() => import("./OfficeScene"), {
  ssr: false,
  loading: () => (
    <div className={s.sceneLoading}>جارٍ تجهيز المكتب الثلاثي الأبعاد…</div>
  ),
});
const endpoint = "/api/admin/virtual-office";
async function api(
  body?: Record<string, unknown>,
  session?: string,
  signal?: AbortSignal,
) {
  const response = await fetch(
    session ? `${endpoint}?session=${encodeURIComponent(session)}` : endpoint,
    {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal,
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "تعذر الاتصال بالمكتب");
  return data;
}
function Icon({
  type,
}: {
  type:
    "office" | "tasks" | "meeting" | "send" | "memory" | "plus" | "download";
}) {
  const paths = {
    office: "M3 21V5l9-3 9 3v16M7 8h2m6 0h2M7 12h2m6 0h2M9 21v-5h6v5",
    tasks: "M9 5h11v16H4V5h2m2-2h8v5H8zM8 13h8m-8 4h5",
    meeting:
      "M8 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm9 1a2 2 0 1 0 0-4m-4 15v-5a5 5 0 0 0-10 0v5m18 0v-5a4 4 0 0 0-5-4",
    send: "m21 3-7 18-4-7-7-4L21 3ZM10 14 21 3",
    memory: "M6 3h12v18H6zM9 7h6m-6 4h6m-6 4h4",
    plus: "M12 5v14m-7-7h14",
    download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  };
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[type]} />
    </svg>
  );
}
function Portrait({
  id = "editor",
  large = false,
  staff,
}: {
  id?: AgentId;
  large?: boolean;
  staff?: OfficeStaff;
}) {
  const agent = agentById(id),
    look = staff ? appearanceForStaff(staff.appearance) : OFFICE_APPEARANCE[id];
  const patternId = `shemagh-${useId().replace(/:/g, "")}`;
  if (staff?.appearance === "unset")
    return (
      <span
        className={`${s.portrait} ${large ? s.portraitLarge : ""} ${s.initialPortrait}`}
        aria-hidden="true"
      >
        {staff.name
          .split(/\s+/)
          .slice(0, 2)
          .map((n) => n[0])
          .join("")}
      </span>
    );
  return (
    <span
      className={`${s.portrait} ${large ? s.portraitLarge : ""}`}
      style={{ background: `${agent.color}18` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64">
        <defs>
          <pattern
            id={patternId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <rect width="6" height="6" fill="#fff9ef" />
            <path
              d="m0 3 3-3 3 3-3 3Z"
              stroke={look.scarf}
              strokeWidth=".8"
              fill="none"
            />
            <rect x="2.4" y="2.4" width="1.2" height="1.2" fill={look.scarf} />
          </pattern>
        </defs>
        <path d="M8 64v-9c0-14 48-14 48 0v9" fill={look.clothing} />
        {look.gender === "male" ? (
          <>
            <path d="M27 46h10l-3 8h-4Z" fill="#fff" />
            <path d="M32 48v16" stroke="#c4ccd2" strokeWidth="1" />
            <path d="M41 54h8v7h-8Z" fill="#dfe6eb" />
            <path d="M44 53v6" stroke={agent.color} strokeWidth="1.4" />
          </>
        ) : look.headwear === "none" ? (
          <path d="m25 47 7 17 7-17Z" fill="#f4e9db" />
        ) : null}
        {look.headwear === "shemagh" ? (
          <path
            d="M15 23C12 1 51 1 49 23l5 30-13-9H23L10 53Z"
            fill={`url(#${patternId})`}
          />
        ) : (
          <path
            d={
              look.headwear === "hijab"
                ? "M14 32V22C14-2 50-2 50 22v14l9 25H5Z"
                : "M16 40V22C13-1 51-1 49 22v24l-10-4H25Z"
            }
            fill={look.headwear === "hijab" ? look.scarf : look.hair}
          />
        )}
        <rect x="26" y="36" width="12" height="14" rx="4" fill={look.skin} />
        <ellipse cx="32" cy="27" rx="12.5" ry="16" fill={look.skin} />
        {look.headwear === "shemagh" ? (
          <>
            <path
              d="M17 19Q17 3 32 4q15-1 15 15l-6-4q-9-6-18 0Z"
              fill={`url(#${patternId})`}
            />
            <path
              d="M17 12q15-8 30 0M17 15q15-8 30 0"
              fill="none"
              stroke="#252a2d"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </>
        ) : look.headwear === "none" ? (
          <path d="M18 25C13 3 42-1 47 18l-8-5-9 8-9-2Z" fill={look.hair} />
        ) : (
          <>
            <path
              d="M18 19Q19 5 32 6q13-1 14 13l-6-5q-8-5-16 0Z"
              fill={look.scarf}
            />
            <path
              d="M19 38q3 14 13 17 10-3 13-17l5 17-18 9-18-9Z"
              fill={look.scarf}
            />
            <path
              d="M23 43q9 9 18 0"
              fill="none"
              stroke="#ffffff"
              strokeOpacity=".2"
            />
          </>
        )}
        <path
          d="m24 24 5-1m6 0 5 1"
          stroke={look.hair}
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <circle cx="27" cy="28" r="1.5" fill="#273647" />
        <circle cx="37" cy="28" r="1.5" fill="#273647" />
        <path
          d="M28 36q4 3 8 0"
          fill="none"
          stroke="#7c5240"
          strokeWidth="1.5"
        />
      </svg>
    </span>
  );
}
function time(value: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
function Status({ session }: { session: OfficeSession }) {
  return (
    <span className={`${s.status} ${s[session.status]}`}>
      {STATUS_LABELS[session.status]}
    </span>
  );
}

export default function VirtualOffice() {
  const [data, setData] = useState<OfficeSnapshot | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<AgentId>("editor"),
    [view, setView] = useState<"office" | "tasks" | "meetings">("office");
  const [staffId, setStaffId] = useState<string | null>(null);
  const [focusedMessage, setFocusedMessage] = useState<string | null>(null);
  const workPanelRef = useRef<HTMLElement>(null);
  const chatDialog = useRef<HTMLDialogElement>(null);
  function openChat() {
    const dialog = chatDialog.current;
    if (dialog && !dialog.open) {
      dialog.scrollTop = 0;
      dialog.showModal();
      dialog.scrollTop = 0;
    }
  }
  const [panel, setPanel] = useState<"work" | "memory">("work"),
    [kind, setKind] = useState<SessionKind>("chat");
  const [sessionId, setSessionId] = useState<string | null>(null),
    [messages, setMessages] = useState<OfficeMessage[]>([]);
  const [brief, setBrief] = useState(""),
    [project, setProject] = useState("First1Saudi"),
    [sourceText, setSourceText] = useState(""),
    [sourceUrls, setSourceUrls] = useState("");
  const [memories, setMemories] = useState<Partial<Record<AgentId, string>>>(
      {},
    ),
    [pending, setPending] = useState(false),
    [filter, setFilter] = useState("all");
  const sessionRef = useRef<string | null>(null),
    listRef = useRef<HTMLDivElement>(null),
    revision = useRef(0),
    pollError = useRef(false);
  const refreshing = useRef(false);
  const submission = useRef<{ signature: string; id: string } | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (refreshing.current) return;
    refreshing.current = true;
    const id = ++revision.current,
      current = sessionRef.current;
    try {
      const [snapshot, detail] = await Promise.all([
        api(undefined, undefined, signal),
        current
          ? api(undefined, current, signal)
          : Promise.resolve({ messages: [] }),
      ]);
      if (id !== revision.current) return;
      setData(snapshot);
      if (current === sessionRef.current) setMessages(detail.messages);
      if (pollError.current) {
        setError("");
        pollError.current = false;
      }
    } catch (e) {
      if (signal?.aborted) return;
      pollError.current = true;
      setError(e instanceof Error ? e.message : "تعذر تحديث المكتب");
    } finally {
      refreshing.current = false;
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const interval = setInterval(() => {
      if (!document.hidden) void refresh(controller.signal);
    }, 3500);
    const wake = () => {
      if (!document.hidden) void refresh(controller.signal);
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      controller.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [refresh]);
  useEffect(() => {
    const el = listRef.current;
    const target =
      focusedMessage &&
      el?.querySelector<HTMLElement>(`[data-message-id="${focusedMessage}"]`);
    if (target)
      target.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    else if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sessionId, focusedMessage]);
  const sessions = data?.sessions || [],
    session = sessions.find((v) => v.id === sessionId),
    agent = agentById(selected);
  const running = sessions.filter((v) => v.status === "running"),
    active = running.map(currentAgent),
    meeting = sessions.some(
      (v) =>
        v.kind === "meeting" &&
        (["running", "handoff"].includes(v.status) ||
          (v.status === "queued" && v.step > 0)) &&
        (v.workflow !== "adaptive" ||
          (v.step > 0 && v.approved_plan_version === v.plan_version)),
    );
  const waiting = sessions.filter((v) =>
    ["review", "handoff", "plan_review"].includes(v.status),
  ).length;
  const handoffs = sessions.filter(
    (v) => v.status === "handoff" || v.status === "plan_review",
  );
  const meetingAgents = [
    ...new Set(
      sessions
        .filter(
          (v) =>
            v.kind === "meeting" &&
            ["running", "queued", "handoff"].includes(v.status) &&
            (v.workflow !== "adaptive" ||
              (v.approved_plan_version === v.plan_version && !!v.plan)),
        )
        .flatMap(sessionSteps),
    ),
  ];
  const taskSummaries: Partial<Record<OfficePersonId, string>> = {};
  running.forEach((v) => {
    taskSummaries[currentAgent(v)] = v.title;
  });
  const busy = session?.status === "running" || session?.status === "queued";
  const canReply =
    session && ["review", "completed", "failed"].includes(session.status);
  const memoryValue =
    memories[selected] ??
    data?.memories.find((m) => m.agent_id === selected)?.content ??
    "";
  const choose = useCallback((id: AgentId) => {
    setStaffId(null);
    setFocusedMessage(null);
    setSelected(id);
    setPanel("work");
    setSessionId(null);
    sessionRef.current = null;
    setMessages([]);
    setNotice("");
    setError("");
  }, []);
  function openSession(
    value: OfficeSession,
    person = value.agent_id,
    messageId: string | null = null,
  ) {
    setStaffId(null);
    setSessionId(value.id);
    sessionRef.current = value.id;
    setSelected(person);
    setFocusedMessage(messageId);
    setPanel("work");
    setMessages([]);
    void refresh();
    openChat();
  }
  function newWork(mode: SessionKind = "chat") {
    if (mode === "team" || mode === "meeting") setSelected("editor");
    setStaffId(null);
    setFocusedMessage(null);
    setSessionId(null);
    sessionRef.current = null;
    setMessages([]);
    setKind(mode);
    setPanel("work");
    setNotice("");
    setError("");
    openChat();
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || (session && !canReply)) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const payload =
        session && canReply
          ? { action: "reply", sessionId: session.id, brief }
          : {
              action: "create",
              agentId:
                kind === "team" || kind === "meeting" ? "editor" : selected,
              kind,
              brief,
              project,
              sourceText,
              sourceUrls: sourceUrls
                .split(/\n/)
                .map((v) => v.trim())
                .filter(Boolean),
            };
      const signature = JSON.stringify(payload);
      if (submission.current?.signature !== signature)
        submission.current = { signature, id: crypto.randomUUID() };
      const result = await api({
        ...payload,
        requestId: submission.current.id,
      });
      submission.current = null;
      setSessionId(result.session.id);
      setSelected(result.session.agent_id);
      sessionRef.current = result.session.id;
      setBrief("");
      await refresh();
      setNotice("تم استلام الطلب؛ يمكنك مغادرة الصفحة ومتابعته لاحقًا.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إرسال الطلب");
    } finally {
      setPending(false);
    }
  }
  async function action(value: string, notes?: string): Promise<boolean> {
    if (!session || pending) return false;
    setPending(true);
    setError("");
    try {
      await api({
        action: value,
        sessionId: session.id,
        requestId: crypto.randomUUID(),
        step: session.step,
        planVersion: session.plan_version,
        notes,
      });
      await refresh();
      setNotice(
        value === "approve_plan"
          ? "اعتمدت الخطة؛ يبدأ الفريق بالمراحل المختارة فقط."
          : value === "revise_plan"
            ? "وصلت ملاحظاتك؛ يعيد عبدالله إعداد الخطة قبل أي تنفيذ."
            : value === "approve_handoff"
              ? `وافق مدير التحرير وأُسندت المهمة إلى ${agentById(currentAgent(session)).firstName}.`
              : value === "approve"
                ? "تم اعتماد التسليم. لم يتم نشره تلقائيًا."
                : value === "cancel"
                  ? "تم إلغاء التكليف؛ لن تحفظ نتيجة المرحلة الجارية."
                  : "أعيدت المهمة إلى قائمة الانتظار.",
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تنفيذ الإجراء");
      return false;
    } finally {
      setPending(false);
    }
  }
  async function saveMemory() {
    setPending(true);
    setError("");
    try {
      await api({ action: "memory", agentId: selected, content: memoryValue });
      await refresh();
      setNotice("حُفظت ذاكرة الموظف للتكليفات القادمة.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ الذاكرة");
    } finally {
      setPending(false);
    }
  }
  function download() {
    if (!session) return;
    const file = new Blob(
      [
        JSON.stringify(
          { contractVersion: OFFICE_CONTRACT_VERSION, session, messages },
          null,
          2,
        ),
      ],
      { type: "application/json;charset=utf-8" },
    );
    const url = URL.createObjectURL(file),
      a = document.createElement("a");
    a.href = url;
    a.download = `office-${session.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const visible = sessions.filter(
    (v) =>
      (view !== "meetings" || v.kind === "meeting") &&
      (filter === "all" || v.status === filter),
  );
  return (
    <div className={s.office} dir="rtl">
      <header className={s.header}>
        <div className={s.heading}>
          <span className={s.officeMark}>
            <Icon type="office" />
          </span>
          <div>
            <h1>المكتب الافتراضي</h1>
            <p>فريق التحرير، في مساحة واحدة.</p>
          </div>
        </div>
        <div className={s.headerActions}>
          <span className={s.workspaceBadge}>تواصل النخبة</span>
          <button
            className={s.primary}
            onClick={() => {
              setView("office");
              newWork("team");
              setSelected("editor");
            }}
          >
            <Icon type="plus" />
            تكليف الفريق
          </button>
        </div>
      </header>
      <div className={s.topline}>
        <nav className={s.viewNav} aria-label="أقسام المكتب">
          <button
            aria-pressed={view === "office"}
            onClick={() => setView("office")}
          >
            <Icon type="office" />
            المكتب
          </button>
          <button
            aria-pressed={view === "tasks"}
            onClick={() => setView("tasks")}
          >
            <Icon type="tasks" />
            المهام والتسليمات{waiting > 0 && <span>{waiting}</span>}
          </button>
          <button
            aria-pressed={view === "meetings"}
            onClick={() => setView("meetings")}
          >
            <Icon type="meeting" />
            الاجتماعات
          </button>
        </nav>
        <p className={s.officePulse}>
          <span className={running.length ? s.pulseActive : s.pulseIdle} />
          {running.length
            ? `${running.length} مهمة قيد التنفيذ`
            : handoffs.length
              ? "تسليم جاهز لموافقة مدير التحرير"
              : "الفريق بانتظار تكليفك"}
          <b>٦ تخصصات</b>
        </p>
      </div>
      {error && (
        <div className={s.error} role="alert">
          {error}
          <button onClick={() => void refresh()}>تحديث</button>
        </div>
      )}
      {data && !data.runtime.configured && (
        <div className={s.runtimeNotice}>
          التنفيذ غير مفعّل: يحتاج الخادم إلى إعداد مزود الذكاء الاصطناعي. يمكنك
          استعراض المكتب وتجهيز ذاكرة الفريق.
        </div>
      )}
      <div className={s.layout}>
        <section className={s.mainColumn}>
          {view === "office" ? (
            <OfficeScene
              selected={staffId ? `staff:${staffId}` : selected}
              active={active}
              staff={data?.staff || []}
              activities={data?.activities || []}
              taskSummaries={taskSummaries}
              onOpenActivity={(activity) => {
                const target = sessions.find(
                  (v) => v.id === activity.sessionId,
                );
                if (!target) return;
                openSession(
                  target,
                  activity.agentId,
                  activity.messageId ?? null,
                );
                requestAnimationFrame(() =>
                  workPanelRef.current?.scrollIntoView({
                    block: "nearest",
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)",
                    ).matches
                      ? "auto"
                      : "smooth",
                  }),
                );
              }}
              meeting={meeting}
              meetingAgents={meetingAgents}
              onSelect={(id) => {
                if (id.startsWith("staff:")) {
                  setStaffId(id.slice(6));
                  setNotice("");
                  setError("");
                } else choose(id as AgentId);
              }}
              onTalk={(id) => {
                if (id.startsWith("staff:")) setStaffId(id.slice(6));
                else {
                  choose(id as AgentId);
                  setKind("chat");
                }
                openChat();
              }}
            />
          ) : (
            <section className={s.board}>
              <div className={s.boardHeading}>
                <div>
                  <h2>
                    {view === "meetings"
                      ? "غرفة الاجتماعات"
                      : "المهام والتسليمات"}
                  </h2>
                  <p>
                    {view === "meetings"
                      ? "مدير التحرير يختار المشاركين بحسب الموضوع، ثم يعرض الخطة لموافقتك."
                      : "تكليفات حقيقية، ومراحل محفوظة حتى اعتمادك."}
                  </p>
                </div>
                <button
                  className={s.secondary}
                  onClick={() =>
                    newWork(view === "meetings" ? "meeting" : "task")
                  }
                >
                  <Icon type="plus" />
                  {view === "meetings" ? "اجتماع جديد" : "مهمة جديدة"}
                </button>
              </div>
              <label className={s.filter}>
                الحالة
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">جميع الحالات</option>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              {!visible.length ? (
                <div className={s.emptyBoard}>
                  <Icon type={view === "meetings" ? "meeting" : "tasks"} />
                  <h3>
                    {view === "meetings"
                      ? "ابدأ أول اجتماع للفريق"
                      : "أول تكليف يبدأ منك"}
                  </h3>
                  <p>
                    {view === "meetings"
                      ? "حدد موضوعًا وقرارًا تحتاجه، ويقترح عبدالله التخصصات اللازمة فقط."
                      : "أرسل الفكرة والمراجع، وراجع خطة الفريق قبل بدء التنفيذ."}
                  </p>
                  <button
                    className={s.primary}
                    onClick={() =>
                      newWork(view === "meetings" ? "meeting" : "team")
                    }
                  >
                    {view === "meetings" ? "تجهيز اجتماع" : "تجهيز تكليف"}
                  </button>
                </div>
              ) : (
                <ul className={s.sessionRows}>
                  {visible.map((v) => (
                    <li key={v.id}>
                      <button
                        className={sessionId === v.id ? s.rowSelected : ""}
                        onClick={() => openSession(v)}
                      >
                        <Portrait id={v.agent_id} />
                        <span>
                          <strong>{v.title}</strong>
                          <small>
                            {KIND_LABELS[v.kind]} · {time(v.updated_at)}
                          </small>
                        </span>
                        <Status session={v} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {handoffs.length > 0 && (
            <div className={s.approvalInbox}>
              <span>عند عبدالله · مدير التحرير</span>
              <strong>
                {handoffs.length === 1
                  ? handoffs[0].status === "plan_review"
                    ? "خطة جاهزة لموافقتك قبل التنفيذ"
                    : "تسليم جاهز لموافقتك"
                  : `${handoffs.length} خطط وتسليمات تنتظر موافقتك`}
              </strong>
              <button
                type="button"
                onClick={() => openSession(handoffs[0], "editor")}
              >
                راجع ووافق
              </button>
            </div>
          )}
          <details className={s.employeeDock}>
            <summary>
              مساحة{" "}
              {staffId
                ? firstName(
                    data?.staff.find((p) => p.id === staffId)?.name || "الموظف",
                  )
                : agent.firstName}{" "}
              · المحادثة والذاكرة
            </summary>
            <p>اضغط على أي شخصية للتحدث معها، أو افتح مساحة الموظف المحدد.</p>
            <button type="button" className={s.secondary} onClick={openChat}>
              فتح مساحة الموظف
            </button>
          </details>
          <div className={s.teamHeading}>
            <h2>فريق المكتب</h2>
            <span>اختر الموظف لفتح مساحة عمله</span>
          </div>
          <ul className={s.roster}>
            {OFFICE_AGENTS.map((a) => {
              const isActive = active.includes(a.id),
                review = sessions.some(
                  (v) => v.status === "review" && v.agent_id === a.id,
                );
              return (
                <li key={a.id}>
                  <button
                    className={
                      !staffId && selected === a.id ? s.agentSelected : ""
                    }
                    aria-pressed={!staffId && selected === a.id}
                    onClick={() => {
                      choose(a.id);
                      setKind("chat");
                      openChat();
                    }}
                  >
                    <Portrait id={a.id} />
                    <strong>{a.firstName}</strong>
                    <span className={s.rosterRole}>{a.name}</span>
                    <small>
                      <i
                        className={
                          isActive
                            ? s.workingDot
                            : review
                              ? s.reviewDot
                              : s.idleDot
                        }
                      />
                      {isActive
                        ? "قيد العمل"
                        : review
                          ? "بانتظار اعتماد"
                          : "متاح للتكليف"}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className={s.teamHeading}>
            <h2>فريق تواصل النخبة</h2>
            <span>الموظفون الحقيقيون من نظام الفريق</span>
          </div>
          {data?.staffAvailable === false ? (
            <p className={s.humanExplanation}>
              تعذر تحديث دليل الفريق. تبقى مساحة الذكاء الاصطناعي متاحة.
            </p>
          ) : !data?.staff?.length ? (
            <p className={s.humanExplanation}>
              يظهر الموظفون النشطون هنا تلقائيًا عند إضافتهم إلى نظام الفريق.
            </p>
          ) : (
            <ul className={s.staffRoster}>
              {data.staff.map((person) => (
                <li key={person.id}>
                  <button
                    className={staffId === person.id ? s.humanSelected : ""}
                    aria-pressed={staffId === person.id}
                    onClick={() => {
                      setStaffId(person.id);
                      setNotice("");
                      setError("");
                      openChat();
                    }}
                  >
                    <Portrait staff={person} />
                    <span>
                      <strong>{firstName(person.name)}</strong>
                      <small>
                        {person.jobTitle} · {person.metrics.open} مهام مفتوحة
                      </small>
                    </span>
                    <span className={s.humanBadge}>فريقك</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className={s.bottomNote}>
            <span>ذاكرة محفوظة · تنفيذ في الخلفية · اعتماد قبل النشر</span>
            <Link href="/admin/studio">استوديو التصميم</Link>
            <Link href="/admin/integrations">مركز النشر</Link>
          </div>
        </section>
        <dialog
          ref={chatDialog}
          className={s.chatDialog}
          onClose={() => setPanel("work")}
          aria-label={
            staffId ? "مساحة الموظف الحقيقي" : `محادثة ${agent.firstName}`
          }
          {...{ closedby: "closerequest" }}
        >
          <div className={s.dialogBar}>
            <span>
              {staffId
                ? "فريق تواصل النخبة"
                : `${agent.firstName} · ${agent.name}`}
            </span>
            <form method="dialog">
              <button type="submit" autoFocus aria-label="إغلاق المحادثة">
                ×
              </button>
            </form>
          </div>
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}
          {staffId && data?.staff?.some((p) => p.id === staffId) ? (
            <HumanStaffPanel
              key={staffId}
              person={data.staff.find((p) => p.id === staffId)!}
              portrait={
                <Portrait
                  staff={data.staff.find((p) => p.id === staffId)!}
                  large
                />
              }
              onSaved={async () => {
                await refresh();
              }}
            />
          ) : (
            <aside
              ref={workPanelRef}
              className={s.workPanel}
              aria-label={`مساحة عمل ${agent.firstName}`}
            >
              <div className={s.agentHeader}>
                <Portrait id={selected} large />
                <div>
                  <h2>{agent.firstName}</h2>
                  <p>
                    {agent.name} · {agent.responsibility}
                  </p>
                </div>
              </div>
              <div className={s.agentTools}>
                {agent.tools.map((tool) => (
                  <span key={tool}>{tool}</span>
                ))}
              </div>
              <nav className={s.panelNav} aria-label="مساحة الموظف">
                <button
                  aria-pressed={panel === "work"}
                  onClick={() => setPanel("work")}
                >
                  <Icon type="send" />
                  المحادثة والعمل
                </button>
                <button
                  aria-pressed={panel === "memory"}
                  onClick={() => setPanel("memory")}
                >
                  <Icon type="memory" />
                  ذاكرة الموظف
                </button>
              </nav>
              {panel === "memory" ? (
                <div className={s.memoryPanel}>
                  <h3>ما يحتاج الموظف إلى تذكره</h3>
                  <p>
                    احفظ تفضيلاتك وقراراتك ومراجعك المعتمدة لهذا التخصص. تستخدم
                    في التكليفات القادمة، ولا تستبدل التحقق من المصادر.
                  </p>
                  <details className={s.memoryDetails}>
                    <summary>ملاحظات معتمدة · اضغط للتوسيع</summary>
                    <label htmlFor="office-memory">ملاحظات معتمدة</label>
                    <textarea
                      id="office-memory"
                      rows={13}
                      maxLength={8000}
                      value={memoryValue}
                      onChange={(e) =>
                        setMemories((prev) => ({
                          ...prev,
                          [selected]: e.target.value,
                        }))
                      }
                      placeholder="مثلًا: الجمهور المستهدف، نبرة المشروع، مراجع معتمدة…"
                    />
                    <button
                      disabled={pending}
                      className={s.primary}
                      onClick={() => void saveMemory()}
                    >
                      حفظ الذاكرة
                    </button>
                  </details>
                </div>
              ) : (
                <>
                  <div className={s.conversationHeader}>
                    <h3>
                      {session ? KIND_LABELS[session.kind] : "مساحة جديدة"}
                    </h3>
                    <div>
                      {session && (
                        <button
                          onClick={download}
                          aria-label="تنزيل الجلسة للربط والنقل"
                        >
                          <Icon type="download" />
                        </button>
                      )}
                      <button onClick={() => newWork()}>
                        <Icon type="plus" />
                        جديد
                      </button>
                    </div>
                  </div>
                  {session && (
                    <div className={s.sessionProgress}>
                      <Status session={session} />
                      <p>{session.progress}</p>
                      {busy && (
                        <progress
                          max={sessionSteps(session).length}
                          value={session.step}
                        />
                      )}
                    </div>
                  )}
                  {session?.plan && (
                    <OfficePlanCard
                      key={`${session.id}:${session.plan_version}`}
                      session={session}
                      pending={pending}
                      configured={!!data?.runtime.configured}
                      onAction={action}
                    />
                  )}
                  {session?.status === "handoff" && (
                    <div className={s.handoffCard}>
                      <span className={s.handoffEyebrow}>
                        على مكتب مدير التحرير
                      </span>
                      <div className={s.handoffPeople}>
                        <span>
                          <Portrait
                            id={sessionSteps(session)[session.step - 1]}
                          />
                          <b>
                            {
                              agentById(sessionSteps(session)[session.step - 1])
                                .firstName
                            }
                          </b>
                          <small>سلّم المرحلة</small>
                        </span>
                        <i aria-hidden="true">←</i>
                        <span>
                          <Portrait id={currentAgent(session)} />
                          <b>{agentById(currentAgent(session)).firstName}</b>
                          <small>{agentById(currentAgent(session)).name}</small>
                        </span>
                      </div>
                      <p>
                        {officeExcerpt(
                          [...messages]
                            .reverse()
                            .find((m) => m.kind === "assistant")?.content ||
                            session.title,
                          150,
                        )}
                      </p>
                      <button
                        className={s.primary}
                        disabled={pending || !data?.runtime.configured}
                        onClick={() => void action("approve_handoff")}
                      >
                        {pending
                          ? "جارٍ الإسناد…"
                          : `موافق، أسند إلى ${agentById(currentAgent(session)).firstName}`}
                      </button>
                      <small>لن تبدأ المرحلة التالية قبل موافقتك.</small>
                    </div>
                  )}
                  <div className={s.conversation} ref={listRef}>
                    {!messages.length ? (
                      <div className={s.greeting}>
                        <span className={s.greetingIcon}>
                          <Icon
                            type={view === "meetings" ? "meeting" : "send"}
                          />
                        </span>
                        <h3>
                          {kind === "team"
                            ? "ماذا سننجز معًا؟"
                            : kind === "meeting"
                              ? "ما موضوع اجتماع الفريق؟"
                              : `ابدأ مع ${agent.firstName}`}
                        </h3>
                        <p>
                          {kind === "team"
                            ? "عبدالله يختار التخصصات المناسبة ويعرض الخطة لموافقتك قبل أن يبدأ الفريق."
                            : kind === "meeting"
                              ? "شارك موضوع الاجتماع والقرار المطلوب. يعرض عبدالله خطة بالمشاركين المناسبين لموافقتك أولًا."
                              : agent.greeting}
                        </p>
                      </div>
                    ) : (
                      messages.map((m) => (
                        <article
                          key={m.id}
                          data-message-id={m.id}
                          className={`${s.message} ${focusedMessage === m.id ? s.highlightedMessage : ""} ${m.kind === "user" ? s.userMessage : m.kind === "event" ? s.eventMessage : ""}`}
                        >
                          <div className={s.messageMeta}>
                            <strong>
                              {m.kind === "user"
                                ? "أنت"
                                : m.kind === "event"
                                  ? "سجل المكتب"
                                  : m.agent_id
                                    ? `${agentById(m.agent_id).firstName} · ${agentById(m.agent_id).name}`
                                    : "الفريق"}
                            </strong>
                            <time dateTime={m.created_at}>
                              {time(m.created_at)}
                            </time>
                          </div>
                          <div className={s.messageText}>
                            {m.kind === "assistant"
                              ? plainOfficeText(m.content)
                              : m.content}
                          </div>
                          {m.citations?.length > 0 && (
                            <ul className={s.citations}>
                              {m.citations.map((c) => (
                                <li key={c.url}>
                                  <a
                                    href={c.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {c.title}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </article>
                      ))
                    )}
                    {busy && (
                      <p className={s.liveStage}>
                        <span />
                        {session?.status === "queued"
                          ? "التكليف محفوظ في قائمة الانتظار."
                          : session?.progress}
                      </p>
                    )}
                  </div>
                  {session && (
                    <div className={s.sessionActions}>
                      {session.status === "review" && (
                        <button
                          className={s.primary}
                          disabled={pending}
                          onClick={() => void action("approve")}
                        >
                          اعتماد التسليم
                        </button>
                      )}
                      {(busy ||
                        ["handoff", "plan_review"].includes(
                          session.status,
                        )) && (
                        <button
                          className={s.secondary}
                          disabled={pending}
                          onClick={() => void action("cancel")}
                        >
                          إلغاء التكليف
                        </button>
                      )}
                      {["failed", "cancelled"].includes(session.status) && (
                        <button
                          className={s.secondary}
                          disabled={pending}
                          onClick={() => void action("retry")}
                        >
                          إعادة المحاولة
                        </button>
                      )}
                      {selected === "art" && (
                        <Link href="/admin/studio">فتح استوديو التصميم</Link>
                      )}
                      {selected === "publisher" && (
                        <Link href="/admin/integrations">فتح مركز النشر</Link>
                      )}
                    </div>
                  )}
                  <form onSubmit={submit} className={s.composer}>
                    {!session && (
                      <>
                        <div className={s.formRow}>
                          <label htmlFor="office-kind">
                            نوع الطلب
                            <select
                              id="office-kind"
                              value={kind}
                              onChange={(e) =>
                                setKind(e.target.value as SessionKind)
                              }
                            >
                              <option value="chat">محادثة الموظف</option>
                              <option value="task">مهمة للموظف</option>
                              <option value="team">تكليف الفريق كاملًا</option>
                              <option value="meeting">اجتماع الفريق</option>
                            </select>
                          </label>
                          <label htmlFor="office-project">
                            المشروع
                            <input
                              id="office-project"
                              value={project}
                              maxLength={120}
                              onChange={(e) => setProject(e.target.value)}
                              required
                            />
                          </label>
                        </div>
                        <details className={s.references}>
                          <summary>
                            المصادر والسياق <small>اختياري</small>
                          </summary>
                          <label htmlFor="office-source-text">
                            نصوص وحقائق مرجعية
                          </label>
                          <textarea
                            id="office-source-text"
                            value={sourceText}
                            maxLength={30000}
                            rows={4}
                            onChange={(e) => setSourceText(e.target.value)}
                          />
                          <label htmlFor="office-source-urls">
                            روابط المصادر، رابط في كل سطر
                          </label>
                          <textarea
                            id="office-source-urls"
                            dir="ltr"
                            value={sourceUrls}
                            maxLength={16000}
                            rows={2}
                            onChange={(e) => setSourceUrls(e.target.value)}
                            placeholder="https://…"
                          />
                        </details>
                      </>
                    )}
                    <label htmlFor="office-brief">
                      {session ? "رسالة متابعة أو طلب تعديل" : "طلبك للفريق"}
                    </label>
                    <textarea
                      id="office-brief"
                      rows={3}
                      value={brief}
                      minLength={3}
                      maxLength={12000}
                      onChange={(e) => setBrief(e.target.value)}
                      disabled={
                        busy ||
                        ["handoff", "plan_review"].includes(
                          session?.status || "",
                        ) ||
                        session?.status === "cancelled"
                      }
                      required
                      placeholder={
                        session
                          ? "وضح التعديل أو السؤال التالي…"
                          : "اكتب الفكرة والنتيجة التي تحتاجها…"
                      }
                    />
                    <div className={s.sendRow}>
                      <small>
                        {session
                          ? "تُحفظ المتابعة مع سجل الجلسة."
                          : "المخرجات تحتاج مراجعتك قبل استخدامها."}
                      </small>
                      <button
                        className={s.primary}
                        disabled={
                          pending ||
                          busy ||
                          ["handoff", "plan_review"].includes(
                            session?.status || "",
                          ) ||
                          !data?.runtime.configured ||
                          brief.trim().length < 3 ||
                          session?.status === "cancelled"
                        }
                      >
                        <Icon type="send" />
                        {pending
                          ? "جارٍ الحفظ…"
                          : session
                            ? "إرسال المتابعة"
                            : kind === "meeting"
                              ? "تجهيز خطة الاجتماع"
                              : kind === "chat"
                                ? "إرسال"
                                : kind === "team"
                                  ? "تجهيز خطة الفريق"
                                  : "إسناد التكليف"}
                      </button>
                    </div>
                  </form>
                  {!session &&
                    sessions.some(
                      (v) =>
                        v.agent_id === selected ||
                        v.kind === "team" ||
                        v.kind === "meeting",
                    ) && (
                      <details className={s.history}>
                        <summary>جلسات الموظف والفريق السابقة</summary>
                        <ul>
                          {sessions
                            .filter(
                              (v) =>
                                v.agent_id === selected ||
                                v.kind === "team" ||
                                v.kind === "meeting",
                            )
                            .slice(0, 12)
                            .map((v) => (
                              <li key={v.id}>
                                <button onClick={() => openSession(v)}>
                                  <span>{v.title}</span>
                                  <Status session={v} />
                                </button>
                              </li>
                            ))}
                        </ul>
                      </details>
                    )}
                </>
              )}
              <p className={s.notice} role="status">
                {notice}
              </p>
            </aside>
          )}
        </dialog>
      </div>
    </div>
  );
}

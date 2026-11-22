"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  OFFICE_AGENTS,
  STATUS_LABELS,
  KIND_LABELS,
  agentById,
  currentAgent,
  stepsFor,
  type AgentId,
  type OfficeMessage,
  type OfficeSnapshot,
  type SessionKind,
  type OfficeSession,
} from "@/lib/virtual-office/domain";
import s from "./office.module.css";

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
function Portrait({ id, large = false }: { id: AgentId; large?: boolean }) {
  const agent = agentById(id),
    i = OFFICE_AGENTS.findIndex((a) => a.id === id);
  return (
    <span
      className={`${s.portrait} ${large ? s.portraitLarge : ""}`}
      style={{ background: `${agent.color}18` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64">
        <path d="M9 64v-9c0-13 46-13 46 0v9" fill={agent.color} />
        <rect x="26" y="36" width="12" height="14" rx="4" fill="#c99772" />
        <ellipse
          cx="32"
          cy="27"
          rx="14"
          ry="17"
          fill={i % 2 ? "#dcb18b" : "#c9946e"}
        />
        <path
          d={
            i === 3 || i === 4
              ? "M16 35V22c0-24 33-24 33 0v19L39 38l5-15-10-7-13 7 4 15Z"
              : "M18 25c-7-25 34-25 28 0l-8-10-8 5-9-1Z"
          }
          fill={i === 3 || i === 4 ? agent.color : "#25394d"}
        />
        <circle cx="27" cy="28" r="1.5" fill="#273647" />
        <circle cx="37" cy="28" r="1.5" fill="#273647" />
        <path
          d="M28 36q4 3 8 0"
          fill="none"
          stroke="#7c5240"
          strokeWidth="1.5"
        />
        {(i === 0 || i === 5) && (
          <path d="M17 17Q19 2 32 3q14 0 16 14Z" fill="#f8fafc" />
        )}
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
  const submission = useRef<{ signature: string; id: string } | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
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
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sessionId]);
  const sessions = data?.sessions || [],
    session = sessions.find((v) => v.id === sessionId),
    agent = agentById(selected);
  const running = sessions.filter((v) => v.status === "running"),
    active = running.map(currentAgent),
    meeting = sessions.some(
      (v) =>
        v.kind === "meeting" &&
        (v.status === "running" || (v.status === "queued" && v.step > 0)),
    );
  const waiting = sessions.filter((v) => v.status === "review").length;
  const busy = session?.status === "running" || session?.status === "queued";
  const canReply =
    session && ["review", "completed", "failed"].includes(session.status);
  const memoryValue =
    memories[selected] ??
    data?.memories.find((m) => m.agent_id === selected)?.content ??
    "";
  const choose = useCallback((id: AgentId) => {
    setSelected(id);
    setPanel("work");
    setSessionId(null);
    sessionRef.current = null;
    setMessages([]);
    setNotice("");
    setError("");
  }, []);
  function openSession(value: OfficeSession) {
    setSessionId(value.id);
    sessionRef.current = value.id;
    setSelected(value.agent_id);
    setPanel("work");
    setMessages([]);
    void refresh();
  }
  function newWork(mode: SessionKind = "chat") {
    setSessionId(null);
    sessionRef.current = null;
    setMessages([]);
    setKind(mode);
    setPanel("work");
    setNotice("");
    setError("");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const payload =
        session && canReply
          ? { action: "reply", sessionId: session.id, brief }
          : {
              action: "create",
              agentId: selected,
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
  async function action(value: string) {
    if (!session || pending) return;
    setPending(true);
    setError("");
    try {
      await api({
        action: value,
        sessionId: session.id,
        requestId: crypto.randomUUID(),
      });
      await refresh();
      setNotice(
        value === "approve"
          ? "تم اعتماد التسليم. لم يتم نشره تلقائيًا."
          : value === "cancel"
            ? "تم إلغاء التكليف؛ لن تحفظ نتيجة المرحلة الجارية."
            : "أعيدت المهمة إلى قائمة الانتظار.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تنفيذ الإجراء");
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
      [JSON.stringify({ contractVersion: 1, session, messages }, null, 2)],
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
              selected={selected}
              active={active}
              meeting={meeting}
              onSelect={choose}
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
                      ? "كل تخصص يقدم رأيه، ومدير التحرير يسلم محضرًا وقرارات."
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
                      ? "حدد موضوعًا وقرارًا تحتاجه، وسيشارك الموظفون الستة من تخصصاتهم."
                      : "أرسل الفكرة والمراجع، وتابع تسليم كل تخصص من هذه المساحة."}
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
                    className={selected === a.id ? s.agentSelected : ""}
                    aria-pressed={selected === a.id}
                    onClick={() => choose(a.id)}
                  >
                    <Portrait id={a.id} />
                    <strong>{a.name}</strong>
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
          <div className={s.bottomNote}>
            <span>ذاكرة محفوظة · تنفيذ في الخلفية · اعتماد قبل النشر</span>
            <Link href="/admin/studio">استوديو التصميم</Link>
            <Link href="/admin/integrations">مركز النشر</Link>
          </div>
        </section>
        <aside className={s.workPanel} aria-label={`مساحة عمل ${agent.name}`}>
          <div className={s.agentHeader}>
            <Portrait id={selected} large />
            <div>
              <h2>{agent.name}</h2>
              <p>{agent.responsibility}</p>
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
                احفظ تفضيلاتك وقراراتك ومراجعك المعتمدة لهذا التخصص. تستخدم في
                التكليفات القادمة، ولا تستبدل التحقق من المصادر.
              </p>
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
            </div>
          ) : (
            <>
              <div className={s.conversationHeader}>
                <h3>{session ? KIND_LABELS[session.kind] : "مساحة جديدة"}</h3>
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
                      max={stepsFor(session.kind, session.agent_id).length}
                      value={session.step}
                    />
                  )}
                </div>
              )}
              <div className={s.conversation} ref={listRef}>
                {!messages.length ? (
                  <div className={s.greeting}>
                    <span className={s.greetingIcon}>
                      <Icon type={view === "meetings" ? "meeting" : "send"} />
                    </span>
                    <h3>
                      {kind === "team"
                        ? "ماذا سننجز معًا؟"
                        : kind === "meeting"
                          ? "ما موضوع اجتماع الفريق؟"
                          : `ابدأ مع ${agent.name}`}
                    </h3>
                    <p>
                      {kind === "team"
                        ? "ينتقل الطلب عبر الأدوار الستة، ثم يعود إليك بتسليم موحد للمراجعة."
                        : kind === "meeting"
                          ? "شارك الفكرة والقرار المطلوب. تحفظ مساهمات الفريق والمحضر هنا."
                          : agent.greeting}
                    </p>
                  </div>
                ) : (
                  messages.map((m) => (
                    <article
                      key={m.id}
                      className={`${s.message} ${m.kind === "user" ? s.userMessage : m.kind === "event" ? s.eventMessage : ""}`}
                    >
                      <div className={s.messageMeta}>
                        <strong>
                          {m.kind === "user"
                            ? "أنت"
                            : m.kind === "event"
                              ? "سجل المكتب"
                              : m.agent_id
                                ? agentById(m.agent_id).name
                                : "الفريق"}
                        </strong>
                        <time dateTime={m.created_at}>
                          {time(m.created_at)}
                        </time>
                      </div>
                      <div className={s.messageText}>{m.content}</div>
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
                  {busy && (
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
                  disabled={busy || session?.status === "cancelled"}
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
                          ? "بدء الاجتماع"
                          : kind === "chat"
                            ? "إرسال"
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
      </div>
    </div>
  );
}

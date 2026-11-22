import {
  currentAgent,
  sessionSteps,
  type OfficePersonId,
  type OfficeSession,
  type OfficeStaff,
} from "./domain";
import {
  departmentAgent,
  departmentForSession,
  type DepartmentId,
} from "./departments";

export type OfficeContact = {
  id: OfficePersonId;
  department: DepartmentId;
  name: string;
  role: string;
};
export type CoordinationTask = {
  id: string;
  title: string;
  version: number;
  state: string;
  assigneeId: string | null;
  coAssigneeIds: string[];
  dueAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  blockedReason: string;
  priority: string;
  requiresApproval: boolean;
};
export type CoordinationRecord = {
  id: string;
  kind: "handoff" | "help";
  state:
    | "pending_manager"
    | "approved"
    | "requested"
    | "accepted"
    | "resolved"
    | "rejected"
    | "cancelled";
  version: number;
  summary: string;
  nextTitle: string;
  senderId: string | null;
  targetId: string | null;
  requestedByMe: boolean;
  taskId: string | null;
  taskTitle: string;
  taskVersion: number | null;
  taskState: string | null;
  nextTaskId: string | null;
  resolution: string;
  createdAt: string;
  updatedAt: string;
  canApprove: boolean;
  canAccept: boolean;
  canResolve: boolean;
  canRoute: boolean;
  canCancel: boolean;
};
export type OfficeInteraction = {
  id: string;
  key: string;
  kind: "handoff" | "help" | "morning" | "result";
  state: string;
  title: string;
  text: string;
  from: OfficeContact;
  to: OfficeContact;
  at: string;
  resource: {
    type: "coordination" | "session" | "task" | "morning";
    id: string;
    department?: DepartmentId;
  };
};
export type HelpCandidate = {
  employeeId: string;
  name: string;
  role: string;
  department: DepartmentId;
  reason: string;
  availability: string;
  score: number;
};
export type MorningBriefing = {
  day: string;
  previousDay: string;
  generatedAt: string;
  summary: string;
  completed: number;
  dueToday: number;
  pending: number;
  blocked: number;
  sections: { title: string; items: { text: string; href: string }[] }[];
  limited: boolean;
};
export type CoordinationSnapshot = {
  viewerId: string;
  employeeId: string | null;
  isManager: boolean;
  now: string;
  tasks: CoordinationTask[];
  records: CoordinationRecord[];
  interactions: OfficeInteraction[];
  candidates: HelpCandidate[];
  candidateTaskId: string | null;
  briefing: MorningBriefing;
  suggestions: { taskId: string; reason: string }[];
};
export type OfficeMotion = OfficeInteraction & { runId: string };

export function staffContact(
  staff: OfficeStaff[],
  id: string | null,
  department: DepartmentId = "leadership",
): OfficeContact {
  const person = staff.find((p) => p.id === id);
  if (person)
    return {
      id: `staff:${person.id}`,
      department: (person.officeDepartment || department) as DepartmentId,
      name: person.name.split(/\s+/)[0],
      role: person.jobTitle,
    };
  return virtualContact(department, "editor");
}
export function virtualContact(
  department: DepartmentId,
  id: Parameters<typeof departmentAgent>[1],
): OfficeContact {
  const person = departmentAgent(department, id);
  return { id, department, name: person.firstName, role: person.name };
}
export function officeDay(now: string) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
  const prior = new Date(`${day}T12:00:00Z`);
  prior.setUTCDate(prior.getUTCDate() - 1);
  while (prior.getUTCDay() === 5) prior.setUTCDate(prior.getUTCDate() - 1);
  return {
    day,
    previousDay: prior.toISOString().slice(0, 10),
    start: `${day}T00:00:00+03:00`,
    end: `${day}T23:59:59.999+03:00`,
    previousStart: `${prior.toISOString().slice(0, 10)}T00:00:00+03:00`,
  };
}
export function rankHelpCandidates(
  staff: OfficeStaff[],
  eligible: string[],
  task: CoordinationTask,
  now: string,
): HelpCandidate[] {
  const context = `${task.title} ${task.blockedReason}`;
  const desired: DepartmentId | undefined =
    /برمج|تقني|خطأ|واجهة|كود|ربط|API/i.test(context)
      ? "technology"
      : /ميزاني|محاسب|فاتور|مالي|ضريب/.test(context)
        ? "finance"
        : /توظيف|موارد بشر|إجاز|اجاز/.test(context)
          ? "people"
          : /تسويق|حملات|جمهور/.test(context)
            ? "marketing"
            : /تصميم|صورة|هوية|مصادر|بحث|كتابة|نص|قصة/.test(context)
              ? "content"
              : undefined;
  return staff
    .filter((p) => eligible.includes(p.id))
    .map((p) => {
      const fresh =
        p.presence &&
        Date.parse(now) - Date.parse(p.presence.observedAt) <= 45000;
      const status = fresh ? p.presence!.state : "offline",
        available = status === "available";
      const matched = p.officeDepartment === desired;
      const score =
        (matched ? 40 : 0) +
        (available
          ? 20
          : status === "busy"
            ? 3
            : status === "break"
              ? -5
              : -10);
      return {
        employeeId: p.id,
        name: p.name.split(/\s+/)[0],
        role: p.jobTitle,
        department: (p.officeDepartment || "leadership") as DepartmentId,
        reason: matched
          ? "تخصصه مناسب لطبيعة الطلب، ولديه صلاحية الاطلاع على المهمة"
          : "زميل مخوّل بالمهمة ويمكنه المساندة",
        availability: available
          ? "متاح الآن"
          : status === "busy"
            ? "مشغول؛ الطلب ينتظره"
            : status === "break"
              ? "في استراحة؛ الطلب محفوظ له"
              : "خارج الدوام؛ الطلب محفوظ له",
        score,
      };
    })
    .sort(
      (a, b) => b.score - a.score || a.employeeId.localeCompare(b.employeeId),
    );
}
export function recordInteraction(
  record: CoordinationRecord,
  staff: OfficeStaff[],
): OfficeInteraction {
  const from = staffContact(staff, record.senderId),
    manager = virtualContact(from.department, "editor"),
    recipient = record.targetId
      ? staffContact(staff, record.targetId, from.department)
      : manager;
  const pending = record.state === "pending_manager";
  let text =
    record.kind === "handoff"
      ? pending
        ? `تسليم ${from.name} جاهز. ننتظر موافقة المدير قبل إسناد المرحلة إلى ${recipient.name}.`
        : record.state === "approved"
          ? `وافق المدير على التسليم، وأُنشئت مهمة ${recipient.name}. تبدأ من مساحة العمل عند جاهزيته.`
          : `التسليم ${record.state === "rejected" ? "يحتاج تعديلًا" : "أُلغي"}. ${record.resolution}`
      : record.state === "resolved"
        ? `اكتملت المساعدة: ${record.resolution}`
        : record.state === "accepted"
          ? `${recipient.name} قبل طلب المساعدة ويتابع مع ${from.name}.`
          : `طلب مساعدة من ${from.name}${record.targetId ? ` إلى ${recipient.name}` : " بانتظار ترشيح المدير"}: ${record.summary}`;
  if (record.state === "cancelled") text = "أُلغي طلب التنسيق.";
  return {
    id: record.id,
    key: `coord:${record.id}:${record.version}:${record.state}`,
    kind: record.kind,
    state: record.state,
    title:
      record.kind === "handoff"
        ? record.nextTitle || record.taskTitle
        : record.taskTitle,
    text,
    from:
      record.kind === "help" && ["accepted", "resolved"].includes(record.state)
        ? recipient
        : from,
    to: pending
      ? manager
      : record.kind === "help" &&
          ["accepted", "resolved"].includes(record.state)
        ? from
        : recipient,
    at: record.updatedAt,
    resource: { type: "coordination", id: record.id },
  };
}
export function virtualInteractions(
  sessions: OfficeSession[],
): OfficeInteraction[] {
  return sessions.flatMap((session) => {
    const department = departmentForSession(session),
      steps = sessionSteps(session),
      manager = virtualContact(department, "editor");
    const pending = ["handoff", "plan_review", "review"].includes(
        session.status,
      ),
      failed = session.status === "failed";
    const approved =
      ["queued", "running"].includes(session.status) &&
      session.step > 0 &&
      session.approved_step >= session.step &&
      (session.workflow !== "adaptive" ||
        session.approved_plan_version === session.plan_version);
    if (!pending && !failed && !approved && session.status !== "completed")
      return [];
    const source =
      pending && session.status === "handoff"
        ? steps[session.step - 1]
        : session.status === "review"
          ? steps.at(-1)
          : currentAgent(session);
    const from = approved
      ? manager
      : virtualContact(department, source || "editor");
    const to = approved
      ? virtualContact(department, currentAgent(session))
      : manager;
    const text = failed
      ? `تعثر تسليم ${from.name}. يحتاج مراجعة المدير قبل إعادة المحاولة.`
      : session.status === "plan_review"
        ? "الخطة جاهزة للموافقة؛ لم يبدأ التنفيذ بعد."
        : session.status === "handoff"
          ? `تسليم ${from.name} جاهز. ${virtualContact(department, steps[session.step] || "editor").name} ينتظر موافقة المدير.`
          : approved
            ? `وافق المدير، وأُسندت المرحلة إلى ${to.name}.`
            : session.status === "completed"
              ? "اعتمد المدير النتيجة النهائية."
              : "النتيجة جاهزة لمراجعة المدير.";
    return [
      {
        id: `ai:${session.id}`,
        key: `ai:${session.id}:${session.plan_version}:${session.step}:${session.status === "running" ? "assigned" : session.status === "queued" ? "assigned" : session.status}`,
        kind: failed
          ? "help"
          : session.status === "completed"
            ? "result"
            : "handoff",
        state: session.status,
        title: session.title,
        text,
        from,
        to,
        at: session.updated_at,
        resource: { type: "session", id: session.id, department },
      } as OfficeInteraction,
    ];
  });
}
export function buildMorningBriefing(
  tasks: CoordinationTask[],
  interactions: OfficeInteraction[],
  now: string,
  admin: boolean,
  limited = false,
): MorningBriefing {
  const bounds = officeDay(now),
    start = Date.parse(bounds.start),
    end = Date.parse(bounds.end),
    prior = Date.parse(bounds.previousStart),
    prefix = admin ? "/admin/workforce/tasks/" : "/employee/work/tasks/";
  const completed = tasks.filter(
    (t) =>
      t.completedAt &&
      Date.parse(t.completedAt) >= prior &&
      Date.parse(t.completedAt) < start,
  );
  const open = tasks.filter((t) => t.state !== "done"),
    due = open.filter(
      (t) =>
        t.dueAt && Date.parse(t.dueAt) >= start && Date.parse(t.dueAt) <= end,
    ),
    blocked = open.filter((t) => t.blockedReason.trim());
  const waiting = interactions.filter((e) =>
    ["pending_manager", "handoff", "plan_review", "review"].includes(e.state),
  );
  const priorities = [...open].sort(
    (a, b) =>
      (Date.parse(a.dueAt || "") || Infinity) -
        (Date.parse(b.dueAt || "") || Infinity) || a.id.localeCompare(b.id),
  );
  return {
    day: bounds.day,
    previousDay: bounds.previousDay,
    generatedAt: now,
    completed: completed.length,
    dueToday: due.length,
    pending: waiting.length,
    blocked: blocked.length,
    limited,
    summary: `صباح الخير، عندك ${due.length} مهام مستحقة اليوم، و${waiting.length} تسليمات تحتاج قرارًا. ${completed.length} مهام اكتملت في آخر يوم عمل${blocked.length ? `، و${blocked.length} مهام تحتاج مساعدة` : ""}.`,
    sections: [
      {
        title: "أنجزنا في آخر يوم عمل",
        items: completed
          .slice(0, 5)
          .map((t) => ({ text: t.title, href: prefix + t.id })),
      },
      {
        title: "أولويات اليوم",
        items: priorities
          .slice(0, 5)
          .map((t) => ({ text: t.title, href: prefix + t.id })),
      },
      {
        title: "تحتاج مساعدة",
        items: blocked
          .slice(0, 5)
          .map((t) => ({
            text: `${t.title}: ${t.blockedReason}`,
            href: prefix + t.id,
          })),
      },
    ],
  };
}

/** Portable office contract. No Next.js, database, auth or provider dependencies. */
export const OFFICE_CONTRACT_VERSION = 1;
export const OFFICE_AGENTS = [
  {
    id: "editor",
    name: "مدير التحرير",
    short: "التحرير",
    initials: "تح",
    color: "#294d81",
    responsibility: "يحول طلبك إلى خطة ويوزع العمل",
    tools: ["تخطيط المحتوى", "توزيع الأدوار", "تجميع التسليمات"],
    greeting: "أرسل الفكرة والهدف والجمهور، وسأجهز خطة واضحة للفريق.",
    position: [-6, -3],
  },
  {
    id: "researcher",
    name: "الباحث",
    short: "البحث",
    initials: "بح",
    color: "#227a78",
    responsibility: "يجمع المصادر ويتحقق من الإنجازات والتواريخ",
    tools: ["بحث الويب بالمصادر", "تدقيق التواريخ", "تحديد فجوات الأدلة"],
    greeting: "ما الشخصية أو الإنجاز الذي نبحث عنه؟ أرفق ما لديك من مصادر.",
    position: [-6, 1],
  },
  {
    id: "writer",
    name: "الكاتب",
    short: "الكتابة",
    initials: "كت",
    color: "#855f9b",
    responsibility: "يكتب القصة والمنشورات وفق سياسة المشروع",
    tools: ["صياغة القصة", "نسخ القنوات", "سياسة أول سعودي"],
    greeting: "أعطني الحقائق والمصادر والقناة، وسأكتب النسخة المناسبة.",
    position: [-6, 5],
  },
  {
    id: "art",
    name: "المدير الفني",
    short: "التصميم",
    initials: "فن",
    color: "#b77a36",
    responsibility: "يجهز فكرة التصميم ويوجه أدوات الصور",
    tools: ["توجيه فني", "تجهيز برومبت الصور", "الاستوديو الحالي"],
    greeting: "لنحدد الرسالة البصرية والمادة الأصلية والهوية والمقاس.",
    position: [6, -3],
  },
  {
    id: "reviewer",
    name: "المراجع",
    short: "المراجعة",
    initials: "مر",
    color: "#9d5968",
    responsibility: "يراجع الادعاءات والنص والتصميم",
    tools: ["بحث للتحقق", "مراجعة الادعاءات", "قائمة التعديلات"],
    greeting: "أرسل المادة ومصادرها، وسأميز المثبت وما يحتاج تعديلًا أو دليلًا.",
    position: [6, 1],
  },
  {
    id: "publisher",
    name: "مسؤول النشر",
    short: "النشر",
    initials: "نش",
    color: "#4e7052",
    responsibility: "يجهز النسخ والقنوات والجدولة والنتائج",
    tools: ["تجهيز حزمة النشر", "خطة الجدولة", "تسليم للقنوات"],
    greeting: "سأجهز النسخ والقنوات ومواعيد الرياض المقترحة للاعتماد.",
    position: [6, 5],
  },
] as const;
export type AgentId = (typeof OFFICE_AGENTS)[number]["id"];
export type SessionKind = "chat" | "task" | "team" | "meeting";
export type SessionStatus =
  "queued" | "running" | "review" | "completed" | "failed" | "cancelled";
export type Citation = { title: string; url: string };
export type OfficeMessage = {
  id: string;
  session_id: string;
  agent_id: AgentId | null;
  kind: "user" | "assistant" | "event";
  content: string;
  citations: Citation[];
  created_at: string;
};
export type OfficeSession = {
  id: string;
  workspace_id: string;
  agent_id: AgentId;
  kind: SessionKind;
  title: string;
  brief: string;
  status: SessionStatus;
  step: number;
  progress: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  context: { project: string; sourceText: string; sourceUrls: string[] };
  input_tokens: number;
  output_tokens: number;
};
export type OfficeSnapshot = {
  contractVersion: number;
  sessions: OfficeSession[];
  memories: { agent_id: AgentId; content: string }[];
  runtime: { configured: boolean; model: string; provider: string };
};
export const STATUS_LABELS: Record<SessionStatus, string> = {
  queued: "في الانتظار",
  running: "قيد العمل",
  review: "بانتظار اعتمادك",
  completed: "معتمد",
  failed: "تعذر التنفيذ",
  cancelled: "ملغى",
};
export const KIND_LABELS: Record<SessionKind, string> = {
  chat: "محادثة",
  task: "مهمة",
  team: "تكليف الفريق",
  meeting: "اجتماع",
};
export function isAgentId(value: unknown): value is AgentId {
  return OFFICE_AGENTS.some((a) => a.id === value);
}
export function isOfficeUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export function agentById(id: AgentId) {
  return OFFICE_AGENTS.find((a) => a.id === id)!;
}
export function stepsFor(kind: SessionKind, agent: AgentId): AgentId[] {
  return kind === "team" || kind === "meeting"
    ? [
        "editor",
        "researcher",
        "writer",
        "art",
        "reviewer",
        "publisher",
        "editor",
      ]
    : [agent];
}
export function currentAgent(session: OfficeSession): AgentId {
  return (
    stepsFor(session.kind, session.agent_id)[session.step] ?? session.agent_id
  );
}
export class OfficeError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function parseBrief(input: Record<string, unknown>) {
  const kind = input.kind;
  if (!["chat", "task", "team", "meeting"].includes(String(kind)))
    throw new OfficeError("اختر نوع التكليف");
  if (!isAgentId(input.agentId)) throw new OfficeError("اختر الموظف");
  const brief = typeof input.brief === "string" ? input.brief.trim() : "";
  if (brief.length < 3 || brief.length > 12000)
    throw new OfficeError("اكتب طلبًا من ٣ إلى ١٢٠٠٠ حرف");
  const project =
    typeof input.project === "string" ? input.project.trim() : "First1Saudi";
  if (!project || project.length > 120)
    throw new OfficeError("اسم المشروع مطلوب، بحد أقصى ١٢٠ حرفًا");
  const sourceText =
    typeof input.sourceText === "string" ? input.sourceText.trim() : "";
  if (sourceText.length > 30000)
    throw new OfficeError("نص المصادر يتجاوز ٣٠٠٠٠ حرف");
  const rawUrls = input.sourceUrls ?? [];
  if (!Array.isArray(rawUrls) || rawUrls.length > 8)
    throw new OfficeError("أرفق حتى ٨ روابط مصادر");
  const sourceUrls = rawUrls.map((value) => {
    if (typeof value !== "string" || value.length > 2000)
      throw new OfficeError("رابط مصدر غير صالح");
    try {
      const url = new URL(value);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
      return url.href;
    } catch {
      throw new OfficeError("استخدم روابط مصادر تبدأ بـ https أو http");
    }
  });
  if (!isOfficeUuid(input.requestId))
    throw new OfficeError("معرف الطلب غير صالح؛ أعد المحاولة");
  return {
    kind: kind as SessionKind,
    agentId: input.agentId,
    brief,
    project,
    sourceText,
    sourceUrls,
    requestId: input.requestId,
  };
}

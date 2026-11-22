/** Portable office contract. No Next.js, database, auth or provider dependencies. */
export const OFFICE_CONTRACT_VERSION = 4;
export const OFFICE_AGENTS = [
  {
    id: "editor",
    firstName: "عبدالله",
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
    firstName: "سارة",
    name: "الباحثة",
    short: "البحث",
    initials: "بح",
    color: "#227a78",
    responsibility: "تجمع المصادر وتتحقق من الإنجازات والتواريخ",
    tools: ["بحث الويب بالمصادر", "تدقيق التواريخ", "تحديد فجوات الأدلة"],
    greeting: "ما الشخصية أو الإنجاز الذي نبحث عنه؟ أرفق ما لديك من مصادر.",
    position: [-6, 1],
  },
  {
    id: "writer",
    firstName: "فهد",
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
    firstName: "نورة",
    name: "المديرة الفنية",
    short: "التصميم",
    initials: "فن",
    color: "#b77a36",
    responsibility: "تجهز فكرة التصميم وتوجه أدوات الصور",
    tools: ["توجيه فني", "تجهيز برومبت الصور", "الاستوديو الحالي"],
    greeting: "لنحدد الرسالة البصرية والمادة الأصلية والهوية والمقاس.",
    position: [6, -3],
  },
  {
    id: "reviewer",
    firstName: "ريم",
    name: "المراجعة",
    short: "المراجعة",
    initials: "مر",
    color: "#9d5968",
    responsibility: "تراجع الادعاءات والنص والتصميم",
    tools: ["بحث للتحقق", "مراجعة الادعاءات", "قائمة التعديلات"],
    greeting: "أرسل المادة ومصادرها، وسأميز المثبت وما يحتاج تعديلًا أو دليلًا.",
    position: [6, 1],
  },
  {
    id: "publisher",
    firstName: "خالد",
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
export type SpecialistId = Exclude<AgentId, "editor">;
export type OfficePlan = {
  summary: string;
  steps: {
    agentId: SpecialistId;
    reason: string;
    instruction: string;
    deliverable: string;
  }[];
  excluded: { agentId: SpecialistId; reason: string }[];
};
export type OfficeAppearance = {
  gender: "male" | "female" | "unspecified";
  headwear: "shemagh" | "hijab" | "none";
  skin: string;
  clothing: string;
  hair: string;
  scarf: string;
};
/** Fictional Saudi teammates; one appearance shared by the 3D model and its portrait. */
export const OFFICE_APPEARANCE: Record<AgentId, OfficeAppearance> = {
  editor: {
    gender: "male",
    headwear: "shemagh",
    skin: "#c58f68",
    clothing: "#f7f5ee",
    hair: "#292c32",
    scarf: "#b8464a",
  },
  researcher: {
    gender: "female",
    headwear: "hijab",
    skin: "#dab18d",
    clothing: "#233e47",
    hair: "#2d2526",
    scarf: "#37766f",
  },
  writer: {
    gender: "male",
    headwear: "shemagh",
    skin: "#af7653",
    clothing: "#e8edf1",
    hair: "#292b30",
    scarf: "#a73640",
  },
  art: {
    gender: "female",
    headwear: "none",
    skin: "#c99270",
    clothing: "#ac794c",
    hair: "#50362c",
    scarf: "#ac794c",
  },
  reviewer: {
    gender: "female",
    headwear: "hijab",
    skin: "#b77f60",
    clothing: "#30394e",
    hair: "#302526",
    scarf: "#a17c8b",
  },
  publisher: {
    gender: "male",
    headwear: "shemagh",
    skin: "#deb48d",
    clothing: "#fbf8f0",
    hair: "#313030",
    scarf: "#b93b46",
  },
};
export type StaffAppearance = "unset" | "shemagh" | "hijab" | "hair";
export type OfficeStaff = {
  id: string;
  name: string;
  jobTitle: string;
  registeredDepartment?: string;
  officeDepartment?: string;
  departmentReason?: string;
  appearance: StaffAppearance;
  metrics: {
    assigned: number;
    open: number;
    inProgress: number;
    overdue: number;
  };
};
export type OfficePersonId = AgentId | `staff:${string}`;
export function appearanceForStaff(preset: StaffAppearance): OfficeAppearance {
  if (preset === "shemagh") return { ...OFFICE_APPEARANCE.editor };
  if (preset === "hijab") return { ...OFFICE_APPEARANCE.researcher };
  if (preset === "hair") return { ...OFFICE_APPEARANCE.art };
  return {
    gender: "unspecified",
    headwear: "none",
    skin: "#cfa17f",
    clothing: "#68849a",
    hair: "#354657",
    scarf: "#68849a",
  };
}
export type SessionKind = "chat" | "task" | "team" | "meeting";
export type SessionStatus =
  | "queued"
  | "running"
  | "handoff"
  | "plan_review"
  | "review"
  | "completed"
  | "failed"
  | "cancelled";
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
  approved_step: number;
  workflow: "legacy" | "adaptive";
  plan: OfficePlan | null;
  plan_version: number;
  approved_plan_version: number;
  progress: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  context: {
    project: string;
    sourceText: string;
    sourceUrls: string[];
    department?: string;
  };
  input_tokens: number;
  output_tokens: number;
};
export type OfficeSnapshot = {
  contractVersion: number;
  sessions: OfficeSession[];
  memories: { agent_id: AgentId; content: string }[];
  runtime: { configured: boolean; model: string; provider: string };
  staff: OfficeStaff[];
  staffAvailable: boolean;
  activities: OfficeActivity[];
};
export type OfficeActivity = {
  agentId: AgentId;
  sessionId: string;
  messageId?: string;
  kind: "question" | "reply" | "result" | "handoff" | "plan";
  preview: string;
};
export const STATUS_LABELS: Record<SessionStatus, string> = {
  queued: "في الانتظار",
  running: "قيد العمل",
  handoff: "بانتظار موافقة المدير",
  plan_review: "الخطة بانتظار موافقتك",
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
  if (session.status === "plan_review") return "editor";
  return sessionSteps(session)[session.step] ?? session.agent_id;
}
export function sessionSteps(
  session: Pick<OfficeSession, "kind" | "agent_id"> &
    Partial<Pick<OfficeSession, "workflow" | "plan">>,
): AgentId[] {
  if (session.workflow !== "adaptive")
    return stepsFor(session.kind, session.agent_id);
  return session.plan
    ? ["editor", ...session.plan.steps.map((s) => s.agentId), "editor"]
    : ["editor"];
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

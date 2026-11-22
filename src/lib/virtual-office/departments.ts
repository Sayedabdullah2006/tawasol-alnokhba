import {
  OFFICE_AGENTS,
  OFFICE_APPEARANCE,
  OfficeError,
  type AgentId,
  type OfficeSession,
} from "./domain";

export type DepartmentAgent = Omit<
  (typeof OFFICE_AGENTS)[number],
  "firstName" | "name" | "short" | "responsibility" | "tools" | "greeting"
> & {
  firstName: string;
  name: string;
  short: string;
  responsibility: string;
  tools: readonly string[];
  greeting: string;
};
type Role = readonly [firstName: string, title: string, responsibility: string];
type Department = {
  id: string;
  name: string;
  short: string;
  description: string;
  brief: string;
  roles: readonly Role[];
  links: readonly { label: string; href: string }[];
};
export const OFFICE_DEPARTMENTS = [
  {
    id: "leadership",
    name: "الإدارة العامة",
    short: "الإدارة",
    description: "التوجه والقرارات وتطوير الأعمال ومتابعة أداء الإدارات.",
    brief: "أريد خطة تشغيل للشركة للشهر القادم بأولويات واضحة ومؤشرات متابعة.",
    roles: [
      [
        "عبدالعزيز",
        "المدير العام",
        "يحلل الطلب ويحدد الأولويات ويقترح خطة عمل واعتمادات الإدارات",
      ],
      [
        "مها",
        "محللة الأعمال",
        "تحلل السوق والفرص والمعلومات المتاحة وتحدد فجوات البيانات",
      ],
      [
        "راشد",
        "مسؤول الاستراتيجية",
        "يحول التوجه إلى أهداف ومبادرات ومؤشرات أداء قابلة للمتابعة",
      ],
      [
        "لمياء",
        "مسؤولة تطوير الأعمال",
        "تجهز أفكار الشراكات ونماذج العروض والتوسع",
      ],
      [
        "أمل",
        "مسؤولة الحوكمة",
        "تراجع اتساق القرارات والمخاطر والصلاحيات والاعتمادات المطلوبة",
      ],
      [
        "سلمان",
        "المساعد التنفيذي",
        "يجهز ملخص القرارات وجدول المتابعة ومحاضر الاجتماعات",
      ],
    ],
    links: [
      { label: "أداء الفريق", href: "/admin/workforce" },
      { label: "الاعتمادات", href: "/admin/workforce/approvals" },
    ],
  },
  {
    id: "finance",
    name: "الإدارة المالية",
    short: "المالية",
    description: "الموازنات والمحاسبة والتحليل المالي والمراجعة والمستحقات.",
    brief:
      "جهز خطة موازنة شهرية من الأرقام التي سأرفقها، مع المصروفات والفجوات والافتراضات.",
    roles: [
      [
        "عمر",
        "المدير المالي",
        "يوزع الطلب المالي على التخصصات اللازمة ويجمع توصيات قابلة للمراجعة",
      ],
      [
        "هند",
        "المحللة المالية",
        "تحلل الإيرادات والمصروفات والتدفقات من الأرقام المقدمة وتوضح الافتراضات",
      ],
      [
        "ناصر",
        "المحاسب",
        "يجهز تسويات وملخصات حسابية وفواتير مقترحة من المستندات والأرقام المقدمة",
      ],
      [
        "دلال",
        "مسؤولة الموازنات",
        "تجهز الموازنة وسيناريوهات التكلفة ومقارنة المخطط بالفعلي عند توفر البيانات",
      ],
      [
        "جود",
        "المراجعة المالية",
        "تراجع الأرقام واتساقها والفجوات والأدلة دون افتراض مستندات غير مرفقة",
      ],
      [
        "مازن",
        "مسؤول المستحقات",
        "يجهز قائمة الاستحقاقات والتحصيل وجدول متابعة الدفعات المقترح",
      ],
    ],
    links: [
      { label: "المستحقات والرواتب", href: "/admin/workforce/payroll" },
      { label: "أداء الفريق", href: "/admin/workforce" },
    ],
  },
  {
    id: "people",
    name: "الموارد البشرية",
    short: "الموارد البشرية",
    description: "التوظيف وشؤون الموظفين والتطوير والأداء والرواتب.",
    brief:
      "جهز خطة توظيف لدور جديد، تبدأ بتحديد الاحتياج والوصف الوظيفي ومعايير مقابلة مرتبطة بالعمل.",
    roles: [
      [
        "لطيفة",
        "مديرة الموارد البشرية",
        "تحدد احتياج الفريق وتوزع أعمال الموارد البشرية وتراجع المقترحات",
      ],
      [
        "عبير",
        "مسؤولة التوظيف",
        "تجهز الوصف الوظيفي ومعايير الفرز وأسئلة المقابلات المرتبطة بمتطلبات العمل",
      ],
      [
        "تركي",
        "مسؤول شؤون الموظفين",
        "يجهز إجراءات الانضمام والإجازات والملفات وقوائم المتابعة",
      ],
      [
        "شذى",
        "مسؤولة التعلم والتطوير",
        "تقترح خطط تدريب وتهيئة ومهارات بناء على الاحتياج المقدم",
      ],
      [
        "منار",
        "مسؤولة الأداء والسياسات",
        "تراجع السياسات ومعايير الأداء ووضوح الإجراءات وتحدد ما يحتاج مراجعة بشرية",
      ],
      [
        "يزيد",
        "مسؤول الرواتب والحضور",
        "يجهز ملخصات حضور واستحقاقات مقترحة من البيانات المقدمة دون اعتماد أو صرف",
      ],
    ],
    links: [
      {
        label: "الموظفون والأقسام الفعلية",
        href: "/admin/workforce/employees",
      },
      { label: "الحضور", href: "/admin/workforce/attendance" },
      { label: "الرواتب", href: "/admin/workforce/payroll" },
    ],
  },
  {
    id: "marketing",
    name: "إدارة التسويق",
    short: "التسويق",
    description: "الاستراتيجية والحملات والعلامة والإعلانات وقياس الأداء.",
    brief:
      "جهز خطة حملة لخدمة جديدة: الهدف والجمهور والقنوات والميزانية ومؤشرات القياس المقترحة.",
    roles: [
      [
        "مشعل",
        "مدير التسويق",
        "يحدد أهداف الطلب ويختار فريق الحملة ويجمع الخطة قبل التنفيذ",
      ],
      [
        "العنود",
        "محللة السوق والجمهور",
        "تبحث السوق والجمهور والمنافسين بمصادر وتوضح حدود البيانات",
      ],
      [
        "بدر",
        "مسؤول الحملات",
        "يجهز رسائل الحملة وعروضها ومراحلها ونسخها التسويقية",
      ],
      [
        "لينا",
        "مسؤولة العلامة والإبداع",
        "تحدد الاتجاه الإبداعي واتساق الهوية وملخصات التصميم المطلوبة",
      ],
      [
        "غادة",
        "محللة الأداء",
        "تراجع خطة القياس ومؤشرات الأداء ونتائج الحملات المرفقة دون اختلاق أرقام",
      ],
      [
        "فيصل",
        "مسؤول الإعلانات والقنوات",
        "يجهز القنوات والاستهداف والميزانيات والجدولة المقترحة دون شراء إعلانات",
      ],
    ],
    links: [
      { label: "مركز المحتوى والحملات", href: "/admin/social" },
      { label: "تقويم النشر", href: "/admin/social/calendar" },
      { label: "الهوية", href: "/admin/brand" },
    ],
  },
  {
    id: "sales",
    name: "المبيعات وخدمة العملاء",
    short: "المبيعات",
    description: "الفرص والعروض والحسابات ومتابعة العملاء وخدمتهم.",
    brief:
      "جهز خطة لمتابعة فرصة بيع، مع أسئلة اكتشاف الاحتياج وعرض القيمة والخطوة التالية.",
    roles: [
      [
        "سعود",
        "مدير المبيعات",
        "يحدد مرحلة الفرصة ويختار المساهمات اللازمة ويجمع توصية الخطوة التالية",
      ],
      [
        "شهد",
        "مسؤولة تأهيل الفرص",
        "تحلل احتياج العميل والمعلومات المقدمة وتجهز أسئلة اكتشاف وتأهيل",
      ],
      [
        "ماجد",
        "مسؤول الحسابات",
        "يجهز عرض القيمة ومسودة العرض ورسائل المتابعة للمراجعة قبل الإرسال",
      ],
      [
        "دانة",
        "مسؤولة العروض والتسعير",
        "تجهز هيكل العرض وبنود التسعير من الأسعار المعتمدة ولا تخترع خصومات",
      ],
      [
        "أروى",
        "مسؤولة نجاح العملاء",
        "تراجع وضوح التوقعات وتجربة العميل وخطة التسليم ومعالجة الاعتراضات",
      ],
      [
        "وليد",
        "مسؤول عمليات المبيعات",
        "يجهز ملخص الفرصة وقائمة المتابعة ومؤشرات المسار من البيانات المقدمة",
      ],
    ],
    links: [
      { label: "نظام المبيعات والعملاء", href: "/admin/workforce/sales" },
      { label: "طلبات العملاء", href: "/admin/requests" },
    ],
  },
  {
    id: "operations",
    name: "العمليات والمشاريع",
    short: "العمليات",
    description: "التخطيط والتسليم والموارد والجودة وتنسيق المشاريع.",
    brief:
      "حوّل هذا المشروع إلى خطة تنفيذ بمراحل ومسؤوليات وتسليمات ومخاطر واعتمادات.",
    roles: [
      [
        "نواف",
        "مدير العمليات",
        "يحدد مراحل التنفيذ والاعتماد ويوزع الطلب على التخصصات اللازمة",
      ],
      [
        "رغد",
        "محللة العمليات",
        "تحلل الإجراء الحالي والفجوات والاعتماديات وتقترح التحسينات",
      ],
      [
        "ياسر",
        "مدير المشاريع",
        "يجهز خطة المشروع والنطاق والجدول والمسؤوليات والتسليمات",
      ],
      [
        "منيرة",
        "مسؤولة الموارد والموردين",
        "تجهز تقدير الموارد ومتطلبات الموردين ومقارنة العروض المقدمة",
      ],
      [
        "نجلاء",
        "مسؤولة الجودة",
        "تراجع معايير القبول والمخاطر وجودة التسليم وقابلية التحقق",
      ],
      [
        "حسام",
        "منسق المشاريع",
        "يجهز محاضر المتابعة وقوائم المهام والمواعيد والقرارات المقترحة",
      ],
    ],
    links: [
      { label: "لوحات المهام", href: "/admin/workforce/tasks" },
      { label: "الاجتماعات", href: "/admin/workforce/meetings" },
      { label: "الاعتمادات", href: "/admin/workforce/approvals" },
    ],
  },
  {
    id: "technology",
    name: "التقنية والمنتج",
    short: "التقنية",
    description: "المنتج والأنظمة والتطوير وتجربة المستخدم والجودة والتشغيل.",
    brief:
      "جهز خطة ميزة جديدة: المتطلبات وتجربة المستخدم والتنفيذ والتحقق ومخاطر الإطلاق.",
    roles: [
      [
        "عبدالرحمن",
        "مدير التقنية والمنتج",
        "يحدد نطاق الطلب التقني ويختار التخصصات ويجمع خطة قابلة للمراجعة",
      ],
      [
        "الجوهرة",
        "محللة الأنظمة",
        "تحلل المتطلبات والعمليات والتكاملات والاعتماديات من المعلومات المتاحة",
      ],
      [
        "عبدالله",
        "المطور",
        "يجهز تصور التنفيذ ومقترحات الشيفرة والعقود دون الادعاء بتعديل المستودع",
      ],
      [
        "سلمى",
        "مصممة تجربة المستخدم",
        "تجهز تدفق الاستخدام والشاشات وحالات الخطأ وإمكانية الوصول",
      ],
      [
        "هيا",
        "مسؤولة الاختبار والجودة",
        "تجهز سيناريوهات التحقق والمخاطر ولا تدعي تشغيل اختبارات لم تنفذ",
      ],
      [
        "خالد",
        "مسؤول الأنظمة والتشغيل",
        "يجهز خطة التشغيل والإطلاق والمراقبة والاستعادة دون الوصول إلى الخوادم",
      ],
    ],
    links: [
      { label: "مهام التطوير", href: "/admin/workforce/tasks" },
      { label: "قاعدة المعرفة", href: "/admin/workforce/knowledge" },
    ],
  },
  {
    id: "content",
    name: "المحتوى والتصميم والنشر",
    short: "المحتوى",
    description: "التحرير والبحث والكتابة والتصميم والمراجعة والنشر.",
    brief:
      "جهز قصة لأول سعودي بمصادر موثقة وخطة بالمساهمات اللازمة قبل أن يبدأ الفريق.",
    roles: [],
    links: [
      { label: "استوديو التصميم", href: "/admin/studio" },
      { label: "مركز النشر", href: "/admin/integrations" },
    ],
  },
] as const satisfies readonly Department[];
export type DepartmentId = (typeof OFFICE_DEPARTMENTS)[number]["id"];
export function parseDepartment(value: unknown): DepartmentId {
  if (value === null || value === undefined || value === "") return "content";
  if (
    typeof value !== "string" ||
    !OFFICE_DEPARTMENTS.some((d) => d.id === value)
  )
    throw new OfficeError("اختر إدارة متاحة");
  return value as DepartmentId;
}
export const departmentById = (id: DepartmentId) =>
  OFFICE_DEPARTMENTS.find((d) => d.id === id)!;
export const departmentForSession = (session: Pick<OfficeSession, "context">) =>
  parseDepartment(session.context.department);
export function agentsForDepartment(id: DepartmentId): DepartmentAgent[] {
  const department = departmentById(id);
  return OFFICE_AGENTS.map((base, i) => {
    const role = department.roles[i];
    return role
      ? {
          ...base,
          firstName: role[0],
          name: role[1],
          short: role[1],
          responsibility: role[2],
          tools: [department.short, "تجهيز التسليم", "مراجعة الإدارة"],
          greeting: `أرسل الهدف والمعلومات المتاحة. ${role[2]}، ثم أرفع لك النتيجة للمراجعة.`,
        }
      : { ...base };
  });
}
export const departmentAgent = (department: DepartmentId, id: AgentId) =>
  agentsForDepartment(department).find((a) => a.id === id)!;
export function departmentAppearance(department: DepartmentId, id: AgentId) {
  return department === "people" && id === "editor"
    ? OFFICE_APPEARANCE.reviewer
    : OFFICE_APPEARANCE[id];
}
/** Role IDs are stable seats; a department workspace gives each person separate history and memory. */
export const departmentWorkspace = (base: string, id: DepartmentId) =>
  id === "content" ? base : `${base}:department:${id}`;

export function requiresOfficeResearch(
  session: Pick<OfficeSession, "context" | "brief">,
  agent: AgentId,
) {
  const department = departmentForSession(session);
  if (department === "content")
    return agent === "researcher" || agent === "reviewer";
  if (department === "marketing" && agent === "researcher") return true;
  return (
    (agent === "researcher" ||
      agent === "reviewer" ||
      (department === "technology" && agent === "writer")) &&
    (/بحث|مصادر|تحقق|توثيق|لائح|لوائح|أنظم|انظم|ضريب|قانون|منافس|وثائق|documentation|research/i.test(
      session.brief,
    ) ||
      session.context.sourceUrls.length > 0)
  );
}

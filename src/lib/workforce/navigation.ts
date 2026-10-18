export type EmployeeScreen = {
  path: string;
  title: string;
  purpose: string;
  related: string[];
  available: boolean;
  live?:
    | "profile"
    | "documents"
    | "requests"
    | "payment-details"
    | "compensation"
    | "job-description"
    | "contract";
};
export type EmployeeModule = {
  key: string;
  title: string;
  purpose: string;
  adminArea: string;
  screens: EmployeeScreen[];
};
const screen = (
  path: string,
  title: string,
  purpose: string,
  related: string[] = [],
  live?: EmployeeScreen["live"],
  available = false,
): EmployeeScreen => ({
  path: `/employee/${path}`,
  title,
  purpose,
  related: related.map((p) => `/employee/${p}`),
  live,
  available:
    available ||
    !!live ||
    [
      "work/projects",
      "work/calendar",
      "work/time",
      "work/deliveries",
      "work/archive",
      "requests/general",
      "requests/leave",
      "requests/permission",
      "requests/remote-work",
      "requests/expenses",
      "requests/advance",
      "requests/attendance-correction",
      "requests/letter",
      "requests/payroll-review",
    ].includes(path),
});

export const employeeModules: EmployeeModule[] = [
  {
    key: "work",
    title: "مهامي",
    purpose: "إدارة أعمالك اليومية والمشاريع التي تشارك فيها.",
    adminArea: "إدارة العمل: اللوحات والتكليفات والمشاريع والتسليمات",
    screens: [
      screen(
        "work/tasks",
        "لوحة المهام",
        "لوحة وقائمة للمهام المسندة والذاتية، وأولوياتها وعوائقها وتسليماتها.",
        ["work/projects", "work/calendar", "work/time", "performance/goals"],
        undefined,
        true,
      ),
      screen(
        "work/projects",
        "مشاريعي",
        "المشاريع التي تشارك فيها، ومراحلها ومهامها وملفاتها وتقدمها.",
        ["work/tasks", "performance/goals"],
      ),
      screen(
        "work/calendar",
        "تقويم العمل",
        "مواعيد مهامك وتسليمات مشاريعك وإجازاتك المعتمدة.",
        ["work/tasks", "attendance/overview", "requests/leave"],
      ),
      screen(
        "work/time",
        "سجل وقت العمل",
        "الوقت التقديري والفعلي على المهام، بصورة مستقلة عن الحضور.",
        ["work/tasks", "attendance/overview"],
      ),
      screen("work/deliveries", "تسليماتي", "", [], undefined, true),
      screen("work/archive", "أرشيف المهام", "", [], undefined, true),
    ],
  },
  {
    key: "performance",
    title: "الأهداف والأداء",
    purpose: "متابعة ما تستهدفه ونتائجك المعتمدة وملاحظات تطويرك.",
    adminArea: "الأهداف والتقييم: تحديد الأهداف واعتماد النتائج والمراجعات",
    screens: [
      screen(
        "performance/goals",
        "أهدافي",
        "الأهداف الشهرية والمالية والنوعية، ومصدر كل نتيجة ودليلها.",
        [
          "work/tasks",
          "work/projects",
          "performance/reviews",
          "finance/commissions",
        ],
      ),
      screen(
        "performance/reviews",
        "تقييمي وخطة التطوير",
        "التقييم الذاتي وتقييم المدير وملاحظات التطوير وطلب المراجعة.",
        ["performance/goals", "requests/performance-review"],
      ),
    ],
  },
  {
    key: "finance",
    title: "المستحقات المالية",
    purpose: "فهم مستحقاتك ومصادرها وما اعتمد وصرف منها.",
    adminArea: "المالية: سياسات التعويض والعمولات ومسيرات الرواتب والتسويات",
    screens: [
      screen(
        "finance/overview",
        "الراتب والحوافز",
        "مستحقات الشهر المتوقعة والمعتمدة والمصروف المسجل والمتبقي من المعتمد.",
        ["finance/payslips", "finance/commissions", "finance/advances"],
        undefined,
        true,
      ),
      screen(
        "finance/payslips",
        "كشوف الرواتب",
        "تفاصيل الأساسي والبدلات والحوافز والعمولات، والمتوقع والمعتمد والمصروف من كشف الشهر.",
        ["finance/overview", "requests/payroll-review"],
        undefined,
        true,
      ),
      screen(
        "finance/compensation",
        "الراتب والبدلات المتفق عليها",
        "الراتب الأساسي والبدلات وبنود العمولة وتواريخ سريانها وسجل إعداداتها.",
        ["profile", "finance/payslips", "finance/commissions"],
        "compensation",
      ),
      screen(
        "finance/commissions",
        "العمولات والمكافآت",
        "المصدر والسياسة وأساس الحساب وحالة الاستحقاق والاعتماد والصرف.",
        ["performance/goals", "finance/payslips"],
        undefined,
        true,
      ),
      screen(
        "finance/advances",
        "السلف والالتزامات",
        "السلف المعتمدة والأقساط والرصيد المتبقي والتسويات.",
        ["requests/advance", "finance/payslips"],
      ),
      screen(
        "finance/payment-details",
        "بيانات الصرف",
        "البنك والآيبان المعتمدان وطلب تعديلهما.",
        ["requests/profile-change"],
        "payment-details",
      ),
    ],
  },
  {
    key: "attendance",
    title: "الحضور والإجازات",
    purpose: "جدول دوامك وسجلات حضورك ورصيد إجازاتك.",
    adminArea: "شؤون الموظفين: جداول الدوام وسجلات الحضور وسياسات الإجازات",
    screens: [
      screen(
        "attendance/overview",
        "حضوري وانصرافي",
        "تسجيل الحضور والانصراف والراحة ومراجعة سجلاتك.",
        ["attendance/schedule", "requests/attendance-correction"],
        undefined,
        true,
      ),
      screen(
        "attendance/schedule",
        "جدول دوامي",
        "أيام العمل وساعاته والاستثناءات والإجازات المعتمدة.",
        ["work/calendar", "requests/remote-work"],
        undefined,
        true,
      ),
      screen(
        "attendance/leave-balances",
        "أرصدة الإجازات",
        "المستحق والمستخدم والمحجوز والمتاح وتاريخ حركة الرصيد.",
        ["requests/leave", "requests/history"],
        undefined,
        true,
      ),
    ],
  },
  {
    key: "requests",
    title: "الطلبات والموافقات",
    purpose: "مركز موحد لطلبات الموظف ومتابعة قرار الإدارة وآثاره.",
    adminArea: "صندوق الموافقات الموحد: مراجعة الطلب والقرار وأثره وسجله",
    screens: [
      screen("requests/general", "طلب إداري", "", [], undefined, true),
      screen(
        "requests/history",
        "كل طلباتي",
        "البحث والتصفية في طلباتك وحالاتها ومرفقاتها وقراراتها.",
        ["requests/leave", "requests/expenses", "requests/profile-change"],
        undefined,
        true,
      ),
      screen(
        "requests/leave",
        "طلب إجازة",
        "نوع الإجازة والفترة والرصيد والتسليم أثناء الغياب.",
        ["attendance/leave-balances", "work/tasks"],
      ),
      screen(
        "requests/permission",
        "طلب استئذان",
        "استئذان جزئي بوقت محدد وسبب ومتابعة الموافقة.",
        ["attendance/overview"],
      ),
      screen(
        "requests/remote-work",
        "طلب عمل عن بُعد",
        "الفترة وخطة العمل وقرار الإدارة.",
        ["attendance/schedule", "work/tasks"],
      ),
      screen(
        "requests/expenses",
        "طلب تعويض أو استرداد مصروف",
        "المبلغ والسبب والفواتير والمشروع المرتبط اختياريًا، ثم الاعتماد والصرف.",
        ["work/projects", "finance/overview"],
      ),
      screen(
        "requests/advance",
        "طلب سلفة",
        "المبلغ المطلوب وخطة السداد المقترحة وقرار الإدارة.",
        ["finance/advances"],
      ),
      screen(
        "requests/attendance-correction",
        "طلب تصحيح حضور",
        "السجل المراد تصحيحه والقيمة المقترحة وسبب التعديل.",
        ["attendance/overview"],
      ),
      screen(
        "requests/letter",
        "طلب خطاب أو شهادة",
        "نوع الخطاب والغرض والجهة ثم استلام المستند المعتمد.",
        ["profile/documents"],
      ),
      screen(
        "requests/profile-change",
        "طلب تعديل بيانات",
        "تعديل الاسم أو البنك أو الآيبان بموافقة موثقة.",
        ["profile", "finance/payment-details"],
        "requests",
      ),
      screen(
        "requests/payroll-review",
        "استفسار أو اعتراض مالي",
        "طلب توضيح بشأن كشف راتب أو عمولة أو دفعة مع ربطه بمصدره.",
        ["finance/payslips", "finance/commissions"],
      ),
      screen(
        "requests/performance-review",
        "طلب مراجعة تقييم",
        "طلب مراجعة نتيجة أو تقييم مع الدليل والتعليق.",
        ["performance/reviews"],
      ),
    ],
  },
  {
    key: "profile",
    title: "ملفي الوظيفي",
    purpose: "بياناتك وعقدك ومستنداتك وعهدك وسياسات العمل.",
    adminArea:
      "دليل الموظفين: الملف الوظيفي والمستندات والعهد والتهيئة والمغادرة",
    screens: [
      screen(
        "profile",
        "بياناتي الشخصية والتواصل",
        "بيانات التعاقد والقسم والمسمى وتحديث الهاتف والمدينة.",
        ["requests/profile-change"],
        "profile",
      ),
      screen(
        "profile/job-description",
        "الوصف الوظيفي",
        "",
        [],
        "job-description",
      ),
      screen("profile/contract", "بيانات العقد", "", [], "contract"),
      screen(
        "profile/compensation",
        "الراتب والبدلات المتفق عليها",
        "",
        [],
        "compensation",
      ),
      screen(
        "finance/overview",
        "كشف الراتب والحوافز",
        "",
        [],
        undefined,
        true,
      ),
      screen(
        "profile/payment-details",
        "بيانات الصرف",
        "",
        [],
        "payment-details",
      ),
      screen(
        "profile/documents",
        "مستنداتي",
        "المستندات المسموح لك بها ورفع ملفاتك ومتابعة صلاحيتها.",
        ["requests/letter"],
        "documents",
      ),
      screen(
        "profile/assets",
        "عهدي",
        "الأصول المسلمة لك وتوثيق الاستلام والإعادة.",
        ["profile/onboarding"],
      ),
      screen(
        "profile/onboarding",
        "التهيئة وتسليم العمل",
        "خطوات الانضمام ونقل الأعمال وتسليم العهد عند المغادرة.",
        ["work/tasks", "profile/assets"],
      ),
      screen(
        "profile/policies",
        "سياسات الشركة",
        "نسخ السياسات المعتمدة السارية ذات الصلة بعملك.",
        ["attendance/schedule", "requests/history"],
      ),
    ],
  },
  {
    key: "notifications",
    title: "الإشعارات",
    purpose: "تنبيهات تخصك وروابط مباشرة للإجراء المطلوب.",
    adminArea: "الإشعارات والأتمتة: الأحداث وتفضيلات الإرسال وسجل التنفيذ",
    screens: [
      screen(
        "notifications/inbox",
        "مركز الإشعارات",
        "التكليفات والتعليقات والقرارات والتذكيرات مع حالة القراءة.",
        ["work/tasks", "requests/history"],
        undefined,
        true,
      ),
      screen(
        "notifications/preferences",
        "تفضيلات التنبيهات",
        "اختيار التنبيهات وتكرارها ضمن سياسة الشركة.",
        ["notifications/inbox"],
      ),
    ],
  },
];

export const findEmployeeScreen = (path: string) =>
  employeeModules
    .flatMap((module) => module.screens)
    .find((screen) => screen.path === path);

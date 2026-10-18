export const WEEK_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
export type WeeklyRow = {
  id: string;
  employee: number;
  day: number;
  client_name: string;
  title: string;
  completion_criteria: string;
};
const first = [
  [
    "أول سعودي",
    "إعداد خطة محتوى الأسبوع",
    "5 أفكار موثقة بالمصدر والهدف والصيغة وموعد التنفيذ.",
  ],
  [
    "أول سعودي",
    "تجهيز نصوص وموجزات تصميم",
    "نصان بمصادرهما وموجزا تصميم للمراجعة.",
  ],
  [
    "تطوير الشركة",
    "تحديث ملف خدمات الشركة وأعمالها",
    "صفحة خدمة ونموذج عمل بنتيجة مثبتة، جاهزان للاعتماد.",
  ],
  [
    "أول سعودي",
    "تجهيز النشر ومتابعة التفاعل",
    "روابط أو إثبات جدولة المواد المعتمدة، وردود مقترحة للمراجعة.",
  ],
  [
    "أول سعودي",
    "تقرير الأسبوع وخطة التحسين",
    "تقرير المنجز والنتائج و3 تحسينات وخطة الأسبوع القادم.",
  ],
];
const second = [
  [
    "بلاتفورم",
    "ترتيب طلبات العميل وخطة الأسبوع",
    "جدول الطلبات والأولويات والمواعيد والموافقات المعلقة.",
  ],
  [
    "بلاتفورم",
    "تجهيز أقرب تسليم مستحق",
    "مسودة التسليم وفق الاتفاق وقائمة النواقص وروابط الملفات.",
  ],
  [
    "تطوير الشركة",
    "حصر فرص عملاء مناسبين",
    "5 فرص موضحة بمدى الملاءمة ووسائل التواصل المنشورة والخطوة التالية.",
  ],
  [
    "بلاتفورم",
    "تجهيز النسخة النهائية ومتابعة الموافقات",
    "التسليم النهائي وقائمة تحقق الجودة وحالة موافقة العميل.",
  ],
  [
    "تطوير الشركة",
    "تقرير العميل والفرص وتوثيق إجراء",
    "ملخص بلاتفورم، وجدول الفرص، وإجراء تشغيلي مكتوب واحد.",
  ],
];
export function weeklyRows(): WeeklyRow[] {
  return [first, second].flatMap((items, employee) =>
    items.map(([client_name, title, completion_criteria], day) => ({
      id: crypto.randomUUID(),
      employee,
      day,
      client_name,
      title,
      completion_criteria,
    })),
  );
}
export function weekDate(start: string, day: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start))
    throw new Error("حددي تاريخ بداية الأسبوع");
  const date = new Date(`${start}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== start
  )
    throw new Error("تاريخ بداية الأسبوع غير صحيح");
  date.setUTCDate(date.getUTCDate() + day);
  return date.toISOString().slice(0, 10);
}

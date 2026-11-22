import type { DepartmentId } from "./departments";

const normalized = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670ـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const rules: readonly [DepartmentId, RegExp][] = [
  [
    "people",
    /موارد بشري|شؤون الموظف|شئون الموظف|توظيف|استقطاب|تدريب|\bhr\b|recruit|human resources/,
  ],
  [
    "finance",
    /محاسب|محاسبه|مالي|ماليه|موازن|خزينه|تحصيل|رواتب|accountant|finance|payroll/,
  ],
  ["marketing", /تسويق|اعلان|حملات|marketing|campaign|advertis/],
  [
    "sales",
    /مبيعات|خدمه العملاء|نجاح العملاء|مدير حساب|اداره الحسابات|علاقات العملاء|مندوب|sales|customer success|account manager/,
  ],
  [
    "technology",
    /تقني|تقنيه|برمج|مطور|مصمم تجربه|تجربه المستخدم|انظمه|نظم معلومات|\bit\b|\bux\b|\bui\b|developer|software|product/,
  ],
  [
    "content",
    /تحرير|محرر|كاتب|كتابه|باحث|تصميم|مصمم|مصور|مونتاج|نشر|محتوي|content|designer|editor|writer/,
  ],
  [
    "operations",
    /عمليات|مشاريع|مدير مشروع|تنسيق|تشغيل|توريد|مشتريات|جوده|project|operation|procurement|quality/,
  ],
  [
    "leadership",
    /اداره عامه|مدير عام|مدير تنفيذي|مساعده تنفيذيه|مساعد تنفيذي|تطوير الاعمال|اداره وتطوير|قياده|executive|\bceo\b|business development/,
  ],
];
/** Representation only: never changes an HR record or sends staff data to a model. */
export function routeStaffDepartment(
  jobTitle: string,
  registeredDepartment: string,
) {
  const title = normalized(jobTitle),
    registered = normalized(registeredDepartment);
  const scores = rules
    .map(([department, pattern]) => ({
      department,
      job: pattern.test(title),
      registered: pattern.test(registered),
    }))
    .map((v) => ({
      ...v,
      score:
        (v.job ? 8 : 0) +
        (v.registered ? (v.department === "leadership" ? 4 : 12) : 0),
    }));
  scores.sort((a, b) => b.score - a.score);
  const match = scores[0];
  return match.score
    ? {
        department: match.department,
        reason: match.job ? "بحسب المسمى وطبيعة العمل" : "بحسب القسم المسجل",
      }
    : {
        department: "leadership" as const,
        reason: "ضمن الفريق الإداري المشترك حتى تحديد التخصص",
      };
}

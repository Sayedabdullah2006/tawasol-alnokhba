import type { AgentId, OfficeSession } from "./domain";
import { departmentForSession } from "./departments";
export function needsStaffContext(text: string) {
  return /موظف|الفريق|راس العمل|رأس العمل|حضور|دوام|إجاز|اجاز|headcount|staff|employees/i.test(
    text,
  );
}
export function hostReadPlan(
  session: Pick<OfficeSession, "context">,
  agent: AgentId,
  question: string,
  now = new Date(),
  previousQuestions: string[] = [],
) {
  const department = departmentForSession(session);
  const text = question.replace(/[٠-٩]/g, (c) =>
    String("٠١٢٣٤٥٦٧٨٩".indexOf(c)),
  );
  const internal =
    /لدينا|عندنا|شركتنا|الشركة|النظام|السجل|الفعل|الحالي|كم |مهام|مهمة|فواتير|فاتورة|تحصيل|مبيعات|عملاء|رواتب|حضور|دوام|جدول|منشورات|نتائج|إحصائ|احصائ|أداء|اداء|موظف|استرداد|حملة|حملات|نشرت|نشرنا|ميزاني|مستحق|وضع|حالة|ملخص|dashboard|invoice|pipeline|tasks/i.test(
      text,
    );
  if (
    (department === "content" && !internal) ||
    (/ابحث|مصادر خارجية|بحث الويب|منافس|السوق|web|research/i.test(text) &&
      !internal)
  )
    return null;
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const date = new Date(`${day}T12:00:00Z`);
  let from = `${day.slice(0, 7)}-01`,
    until = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
      .toISOString()
      .slice(0, 10);
  const periodSelector =
    /20\d{2}-\d{2}|هذا الشهر|الشهر الحالي|الشهر الماضي|الشهر السابق|اليوم|أمس|امس|آخر\s*30\s*يوم|اخر\s*30\s*يوم|كل الفترات|كامل السجل|من البداية|منذ البداية|last month|all time|today|yesterday/i;
  const periodText = periodSelector.test(text)
    ? text
    : [...previousQuestions]
        .reverse()
        .map((q) => q.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))))
        .find((q) => periodSelector.test(q)) || text;
  const explicit = [
    ...periodText.matchAll(/\b20\d{2}-\d{2}(?:-\d{2})?\b/g),
  ].map((m) => m[0]);
  const validDay = (v: string) =>
    Number.isFinite(Date.parse(v)) &&
    new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v;
  if (explicit.length) {
    if (
      explicit.some(
        (v) =>
          !/^20\d{2}-(0[1-9]|1[0-2])(?:-\d{2})?$/.test(v) ||
          (v.length === 10 && !validDay(v)),
      )
    )
      throw new Error("الفترة المطلوبة تحتوي تاريخًا غير صحيح.");
    const first = explicit[0],
      last = explicit.at(-1)!;
    from = first.length === 7 ? first + "-01" : first;
    if (!validDay(from))
      throw new Error(
        "التاريخ غير صحيح؛ استخدم يومًا أو شهرًا صالحًا بصيغة 2026-11.",
      );
    const end =
      last.length === 7
        ? new Date(
            Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5, 7)), 1),
          )
        : new Date(last + "T12:00:00Z");
    if (last.length > 7) {
      if (!validDay(last)) throw new Error("تاريخ نهاية الفترة غير صحيح.");
      end.setUTCDate(end.getUTCDate() + 1);
    }
    until = end.toISOString().slice(0, 10);
  } else if (
    /كل الفترات|كامل السجل|من البداية|منذ البداية|all time/i.test(periodText)
  ) {
    from = "2000-01-01";
    date.setUTCDate(date.getUTCDate() + 1);
    until = date.toISOString().slice(0, 10);
  } else if (/الشهر الماضي|الشهر السابق|last month/i.test(periodText)) {
    until = from;
    from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1))
      .toISOString()
      .slice(0, 10);
  } else if (
    /اليوم|أمس|امس|آخر\s*30\s*يوم|اخر\s*30\s*يوم|today|yesterday/i.test(
      periodText,
    )
  ) {
    const days = /30/.test(periodText) ? 29 : 0;
    if (/أمس|امس|yesterday/i.test(periodText))
      date.setUTCDate(date.getUTCDate() - 1);
    const end = new Date(date);
    end.setUTCDate(end.getUTCDate() + 1);
    until = end.toISOString().slice(0, 10);
    date.setUTCDate(date.getUTCDate() - days);
    from = date.toISOString().slice(0, 10);
  }
  if (from >= until) throw new Error("بداية الفترة يجب أن تسبق نهايتها.");
  return {
    department,
    agent,
    from,
    until,
    includeStaff:
      department === "people" ||
      (department === "leadership" && needsStaffContext(text)),
  };
}

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type { AgentId, OfficeSession } from "./domain";
import { hostReadPlan } from "./host-read-policy";
export { needsStaffContext } from "./host-read-policy";
type Source = {
  source: string;
  href: string;
  status: string;
  [key: string]: unknown;
};
export async function readOfficeHostContext(
  session: OfficeSession & { created_by: string },
  agent: AgentId,
  question: string,
  previousQuestions: string[] = [],
) {
  const plan = hostReadPlan(
    session,
    agent,
    question,
    new Date(),
    previousQuestions,
  );
  if (!plan) return null;
  const db = await createServiceRoleClient(),
    workspace = process.env.VIRTUAL_OFFICE_WORKSPACE_ID || "nukhba";
  const { data, error } = await db.rpc("vo_host_department_context", {
    p_actor: session.created_by,
    p_workspace: workspace,
    p_department: plan.department,
    p_agent: agent,
    p_from: plan.from,
    p_until: plan.until,
  });
  if (error) throw error;
  const sections: Source[] = data.sections;
  if (plan.includeStaff) {
    const staff = await db.rpc("vo_host_staff_context", {
      p_actor: session.created_by,
      p_workspace: workspace,
    });
    if (staff.error) throw staff.error;
    sections.push({
      source: staff.data.source,
      href: "/admin/workforce/employees",
      status: "available",
      facts: staff.data,
      scope: "الحالة الوظيفية والحضور الحالي؛ ليست حركة توظيف خلال الفترة",
    });
  }
  for (const source of sections) {
    if (!/^\/(admin|employee)\//.test(source.href))
      throw new Error("مصدر غير صحيح");
    source.href = new URL(source.href, "https://nukhba.media").href;
  }
  const at = new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    calendar: "gregory",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(data.checkedAt));
  const evidence = sections
    .map(
      (s) =>
        `${s.source} (${s.status === "available" ? "قراءة فعلية" : "غير متاح للصلاحية الحالية"}): ${s.href}`,
    )
    .join("\n");
  return {
    data,
    citations: sections
      .filter((s) => s.status === "available")
      .filter((s, i, all) => all.findIndex((x) => x.href === s.href) === i)
      .map((s) => ({ title: s.source, url: s.href })),
    sourceMessage: `قراءة مباشرة من النظام بتاريخ ${at}. الفترة من ${plan.from} إلى ما قبل ${plan.until} بتوقيت الرياض.\n${evidence}\nقراءة فقط ضمن تخصص الموظف وصلاحيات الحساب؛ الإجماليات مستقلة عن قائمة السجلات المحدودة.`,
  };
}

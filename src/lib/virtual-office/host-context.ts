import "server-only";
import { createServiceRoleClient } from "@/lib/supabase-server";
import type { OfficeSession } from "./domain";
export function needsStaffContext(brief: string) {
  return /موظف|موظفي|الفريق|راس العمل|رأس العمل|الحضور|حاضر|الدوام|إجازات|اجازات|على راس|على رأس|headcount|staff|employees/i.test(
    brief,
  );
}
export async function readOfficeHostContext(
  session: OfficeSession & { created_by: string },
  history = "",
) {
  if (!needsStaffContext(`${session.brief}\n${history.slice(-12000)}`))
    return null;
  const db = await createServiceRoleClient();
  const { data, error } = await db.rpc("vo_host_staff_context", {
    p_actor: session.created_by,
    p_workspace: process.env.VIRTUAL_OFFICE_WORKSPACE_ID || "nukhba",
  });
  if (error) throw error;
  return {
    data,
    sourceMessage: `قراءة مباشرة من سجل الموظفين والحضور بتاريخ ${new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", calendar: "gregory", dateStyle: "short", timeStyle: "short" }).format(new Date(data.checkedAt))}. الموظفون النشطون وظيفيًا: ${data.counts.active}. هذه قراءة فقط.`,
  };
}

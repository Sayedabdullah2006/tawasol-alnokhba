import { apiError, requireAdmin, workforceActor } from "@/lib/workforce/server";
import { renderWorkforceEmail } from "../../../../../../supabase/functions/_shared/workforce-email";

export async function GET() {
  try {
    requireAdmin(await workforceActor());
    const mail = renderWorkforceEmail({
      email: "preview@example.com",
      name: "عضوة الفريق",
      kind: "assigned",
      title: "أُسندت إليك مهمة جديدة",
      href: "/employee/work/tasks",
      createdAt: "2026-10-18T12:00:00Z",
      taskTitle: "إعداد خطة محتوى ونشر أول سعودي",
      client: "أول سعودي",
      dueAt: "2026-10-19T17:00:00+03:00",
      deliverable:
        "تقويم نشر و5 أفكار محتوى وموجزا تنفيذ، مرفقة داخل المهمة للمراجعة.",
    });
    return new Response(mail.html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy":
          "default-src 'none'; img-src https://nukhba.media; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

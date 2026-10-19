// node --experimental-strip-types scripts/workforce-owner-email-test.mjs
// Pure rendering test: no database, provider calls, or outgoing emails.
import assert from "node:assert/strict";
import { renderWorkforceEmail } from "../supabase/functions/_shared/workforce-email.ts";

for (const kind of ["attendance_in", "attendance_out", "task_created", "task_activity", "employee_request"]) {
  const body = "نور — 2026-10-19 09:00 <script>";
  const mail = renderWorkforceEmail({
    email: "preview@example.com", name: "المدير", kind, title: "إشعار العمل", body,
    href: "/admin/workforce/attendance", createdAt: "2026-10-19T06:00:00Z",
    ...(kind.startsWith("task") ? { taskTitle: "مهمة موثقة" } : {}),
  });
  assert(mail.text.includes(body), `${kind}: missing event details in text`);
  assert(mail.html.includes("&lt;script&gt;"), `${kind}: missing escaped event details`);
  assert(!mail.html.includes("<script>"), `${kind}: unsafe HTML`);
  assert(mail.html.includes("https://nukhba.media/logo.png"));
  assert(mail.text.includes("https://nukhba.media/admin/workforce/attendance"));
}
console.log("PASS: clock/task/request details, admin links, logo and HTML escaping; no email sent");

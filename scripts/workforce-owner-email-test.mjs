// node --experimental-strip-types scripts/workforce-owner-email-test.mjs
// Pure rendering test: no database, provider calls, or outgoing emails.
import assert from "node:assert/strict";
import { renderWorkforceEmail } from "../supabase/functions/_shared/workforce-email.ts";

for (const kind of ["attendance_in", "attendance_out", "attendance_missing", "attendance_missing_admin", "due_24h", "overdue", "task_created", "task_activity", "employee_request"]) {
  const body = "نور — 2026-10-19 09:00 <script>";
  const mail = renderWorkforceEmail({
    email: "preview@example.com", name: "المدير", kind, title: "إشعار العمل", body,
    href: "/admin/workforce/attendance", createdAt: "2026-10-19T06:00:00Z",
    ...(kind.startsWith("task") || kind === "overdue" ? { taskTitle: "مهمة موثقة" } : {}),
  });
  assert(mail.text.includes(body), `${kind}: missing event details in text`);
  assert(mail.html.includes("&lt;script&gt;"), `${kind}: missing escaped event details`);
  assert(!mail.html.includes("<script>"), `${kind}: unsafe HTML`);
  assert(mail.html.includes("https://nukhba.media/logo.png"));
  assert(mail.text.includes("https://nukhba.media/admin/workforce/attendance"));
}
const transition = renderWorkforceEmail({
  email: "preview@example.com", name: "المدير", kind: "task_activity",
  title: "تغيرت حالة مهمة", taskTitle: "مهمة موثقة",
  body: "مهمة موثقة\nالمسؤول: نور\nالحالة السابقة: جديدة\nالحالة الجديدة: قيد التنفيذ",
  href: "/admin/workforce/tasks/preview", createdAt: "2026-10-19T06:00:00Z",
});
for (const value of ["المسؤول: نور", "الحالة السابقة: جديدة", "الحالة الجديدة: قيد التنفيذ"]) {
  assert(transition.text.includes(value));
  assert(transition.html.includes(value));
}
console.log("PASS: clock/task/request details, state transition, admin links, logo and HTML escaping; no email sent");

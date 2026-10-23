import "server-only";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { attendanceExemptPath, type ActionAccess } from "./action-access";
import { cache } from "react";
import { employeeRecords } from "./employee-records";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase-server";
import { WorkforceError } from "./validation";
import type { Employee, InternalRole } from "./types";

// Deduplicate only inside one server render; never cache an identity between requests.
export const workforceActor = cache(async function workforceActor() {
  const db = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new WorkforceError("سجل الدخول للمتابعة", 401);
  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "employee"].includes(profile.role))
    throw new WorkforceError("ليس لديك صلاحية الوصول", 403);
  const role = profile.role as InternalRole;
  let employee: Employee | null = null;
  if (role === "employee") {
    const { data, error: employeeError } = await db
      .from("wf_employees")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (employeeError)
      throw new WorkforceError(
        "تعذر التحقق من الملف الوظيفي؛ أعد المحاولة",
        503,
      );
    if (!data)
      throw new WorkforceError(
        "الحساب الوظيفي غير نشط. تواصل مع مدير النظام",
        403,
      );
    employee = data as Employee;
  }
  return {
    user,
    role,
    employee,
    db,
    canManageTasks: role === "admin" || employee?.can_manage_tasks === true,
  };
});
export type WorkforceActor = Awaited<ReturnType<typeof workforceActor>>;
export function requireAdmin(actor: WorkforceActor) {
  if (actor.role !== "admin")
    throw new WorkforceError("هذه العملية متاحة لمدير النظام فقط", 403);
}
export function requireEmployeeAccess(
  actor: WorkforceActor,
  employeeId: string,
) {
  if (actor.role !== "admin" && actor.employee?.id !== employeeId)
    throw new WorkforceError("الملف غير متاح", 404);
}
export async function assertMutation(request: Request) {
  const inTestMode =
    request.headers.has("x-workforce-test-run") ||
    /(?:^|;\s*)wf_test_run=/.test(request.headers.get("cookie") || "");
  if (
    inTestMode &&
    !/^\/api\/workforce\/(?:test-mode|journeys|notifications|requests|tasks(?:\/suggest|\/[0-9a-f-]+\/(?:attachments|performance))?|checklist|comments|time|members|attachments\/[0-9a-f-]+)$/i.test(
      new URL(request.url).pathname,
    )
  )
    throw new WorkforceError(
      "هذا القسم غير متاح في وضع اختبار المهام والطلبات الإدارية",
      409,
    );
  const origin = request.headers.get("origin");
  if (!origin) {
    await assertAttendanceMutation(request);
    return;
  }
  // Railway terminates TLS before Next. Validate against our configured public
  // origin rather than the internal request scheme or untrusted forwarded headers.
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const expected = configured
    ? new URL(configured).origin
    : new URL(request.url).origin;
  const development =
    process.env.NODE_ENV !== "production" &&
    origin === new URL(request.url).origin;
  if (origin !== expected && !development)
    throw new WorkforceError("مصدر الطلب غير مسموح", 403);
  await assertAttendanceMutation(request);
}
async function assertAttendanceMutation(request: Request) {
  if (!attendanceExemptPath(new URL(request.url).pathname))
    await requireWorkingAttendance(await workforceActor());
}
export async function requireWorkingAttendance(actor: WorkforceActor) {
  if (actor.role === "admin") return;
  const service = await createServiceRoleClient();
  const {data,error} = await service.rpc("wf_work_action_access", {p_actor:actor.user.id});
  if (error) throw error;
  const access = data as ActionAccess;
  if (!access?.allowed) throw new WorkforceError(access?.reason || "سجلي الحضور لبدء العمل",409);
  const device = (await cookies()).get("wf_work_device")?.value;
  if (!device || !access.deviceHash || createHash("sha256").update(device).digest("hex") !== access.deviceHash)
    throw new WorkforceError("إجراءات العمل متاحة من جهاز تسجيل الحضور فقط",409);
}
export function apiError(error: unknown) {
  if (error instanceof SyntaxError)
    return Response.json({ error: "صيغة الطلب غير صحيحة" }, { status: 400 });
  if (error instanceof WorkforceError)
    return Response.json({ error: error.message }, { status: error.status });
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  if (code === "P0002")
    return Response.json({ error: "السجل غير متاح" }, { status: 404 });
  // PT400/PT409 are explicit, user-facing domain errors from our checked RPCs.
  // Never return Postgres details, hints or raw constraint error messages.
  if (code === "PT400" || code === "PT409") {
    const message =
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
        ? error.message
        : "تعذر إتمام الإجراء؛ حدّث البيانات وتحقق من المتطلبات";
    return Response.json(
      { error: message },
      { status: code === "PT400" ? 400 : 409 },
    );
  }
  if (
    ["PT400", "23502", "23514", "22P02", "22003", "22007", "22008"].includes(
      code,
    )
  )
    return Response.json(
      { error: "تحقق من الحقول المطلوبة وصحة القيم والتواريخ" },
      { status: 400 },
    );
  if (code === "42501")
    return Response.json(
      { error: "ليس لديك صلاحية إتمام العملية" },
      { status: 403 },
    );
  if (["23505", "40001", "PT409"].includes(code))
    return Response.json(
      { error: "السجل موجود أو تغير منذ فتحه؛ حدّث الصفحة ثم حاول مجددًا" },
      { status: 409 },
    );
  if (code === "23503")
    return Response.json(
      { error: "السجل مرتبط ببيانات أخرى أو لم يعد متاحًا" },
      { status: 409 },
    );
  // Do not log request bodies, credentials, names or finance data.
  console.error("Workforce operation failed", { code: code || "unknown" });
  return Response.json(
    { error: "تعذر إتمام العملية؛ أعد المحاولة" },
    { status: 500 },
  );
}
export async function employeeDetail(actor: WorkforceActor, id: string) {
  requireEmployeeAccess(actor, id);
  const [employee, departments, changes, documents, bank] = await Promise.all([
    actor.db.from("wf_employees").select("*").eq("id", id).maybeSingle(),
    actor.db.from("wf_departments").select("*").order("name"),
    employeeRecords(actor, id, "changes"),
    employeeRecords(actor, id, "documents"),
    actor.db
      .from("wf_employee_bank_details")
      .select("iban,bank_name")
      .eq("employee_id", id)
      .maybeSingle(),
  ]);
  for (const result of [employee, departments, bank])
    if (result.error) throw result.error;
  if (!employee.data) throw new WorkforceError("الملف غير متاح", 404);
  let privateData = {};
  if (actor.role === "admin") {
    const [notes, events] = await Promise.all([
      actor.db
        .from("wf_employee_admin_notes")
        .select("notes")
        .eq("employee_id", id)
        .maybeSingle(),
      employeeRecords(actor, id, "events"),
    ]);
    if (notes.error) throw notes.error;
    privateData = {
      notes: notes.data?.notes ?? "",
      events: events.rows,
      eventsCursor: events.nextCursor,
    };
  }
  return {
    employee: employee.data,
    departments: departments.data,
    changes: changes.rows,
    changesCursor: changes.nextCursor,
    documents: documents.rows,
    documentsCursor: documents.nextCursor,
    bank: bank.data,
    ...privateData,
  };
}
export { createServiceRoleClient };

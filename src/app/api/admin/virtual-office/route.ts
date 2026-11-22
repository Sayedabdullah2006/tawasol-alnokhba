import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-server";
import {
  isAgentId,
  isOfficeUuid as uuid,
  OfficeError,
  parseBrief,
} from "@/lib/virtual-office/domain";
import {
  officeActor,
  officeFailure,
  officeResponse,
  sessionMessages,
  snapshot,
  workspaceId,
} from "@/lib/virtual-office/server";
import { runtimeInfo } from "@/lib/virtual-office/provider";
import { wakeOfficeWorker } from "@/lib/virtual-office/worker";
import { hostEmployeeTasks } from "@/lib/virtual-office/host-team";
import { parseDepartment } from "@/lib/virtual-office/departments";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 150;
async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new OfficeError("أرسل الطلب بصيغة JSON", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new OfficeError("الطلب فارغ");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 100000) {
        await reader.cancel();
        throw new OfficeError("الطلب أكبر من الحد المسموح", 413);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}
export async function GET(request: Request) {
  try {
    const actor = await officeActor();
    const params = new URL(request.url).searchParams;
    const department = parseDepartment(params.get("department"));
    const employee = params.get("employee");
    if (employee) {
      if (!uuid(employee)) throw new OfficeError("معرف الموظف غير صالح");
      return officeResponse({
        tasks: await hostEmployeeTasks(actor.db, employee),
      });
    }
    const id = params.get("session");
    if (id && !uuid(id)) throw new OfficeError("معرف الجلسة غير صالح");
    return officeResponse(
      id
        ? { messages: await sessionMessages(id, department) }
        : await snapshot(actor.db, department),
    );
  } catch (e) {
    return officeFailure(e);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await officeActor(request);
    if (Number(request.headers.get("content-length")) > 100000)
      throw new OfficeError("الطلب أكبر من الحد المسموح", 413);
    const raw = await readBody(request);
    if (raw.length > 60000)
      throw new OfficeError("الطلب أكبر من الحد المسموح", 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new OfficeError("طلب غير صالح");
    const department = parseDepartment(body.department);
    const officeWorkspace = workspaceId(department);
    const db = await createServiceRoleClient();
    if (body.action === "staffAppearance") {
      if (
        !uuid(body.employeeId) ||
        !["unset", "shemagh", "hijab", "hair"].includes(String(body.preset))
      )
        throw new OfficeError("اختر الموظف ومظهر الشخصية");
      const employee = await actor.db
        .from("wf_employees")
        .select("id")
        .eq("id", body.employeeId)
        .eq("status", "active")
        .maybeSingle();
      if (employee.error) throw employee.error;
      if (!employee.data) throw new OfficeError("الموظف غير متاح", 404);
      const result = await db.from("vo_staff_avatars").upsert({
        workspace_id: actor.workspaceId,
        employee_id: body.employeeId,
        preset: body.preset,
        updated_by: actor.id,
        updated_at: new Date().toISOString(),
      });
      if (result.error) throw result.error;
      return officeResponse({ saved: true });
    }
    if (body.action === "memory") {
      if (
        !isAgentId(body.agentId) ||
        typeof body.content !== "string" ||
        body.content.length > 8000
      )
        throw new OfficeError("ذاكرة الموظف غير صالحة أو تتجاوز ٨٠٠٠ حرف");
      const result = await db.from("vo_memories").upsert({
        workspace_id: officeWorkspace,
        agent_id: body.agentId,
        content: body.content.trim(),
        updated_by: actor.id,
        updated_at: new Date().toISOString(),
      });
      if (result.error) throw result.error;
      return officeResponse({ saved: true });
    }
    if (body.action === "create") {
      const input = parseBrief(body);
      if (!runtimeInfo().configured)
        throw new OfficeError(
          "مزود الذكاء الاصطناعي غير مهيأ على الخادم؛ أضف OPENAI_API_KEY لبدء التنفيذ",
          503,
        );
      const result = await db.rpc("vo_submit", {
        p_workspace: officeWorkspace,
        p_actor: actor.id,
        p_request: input.requestId,
        p_agent: input.agentId,
        p_kind: input.kind,
        p_brief: input.brief,
        p_context: {
          department,
          project: input.project,
          sourceText: input.sourceText,
          sourceUrls: input.sourceUrls,
          ...(["team", "meeting"].includes(input.kind)
            ? { workflow: "adaptive-v1" }
            : {}),
        },
      });
      if (result.error) throw result.error;
      after(wakeOfficeWorker);
      return officeResponse({ session: result.data }, 201);
    }
    if (
      ![
        "reply",
        "approve",
        "approve_plan",
        "revise_plan",
        "approve_handoff",
        "cancel",
        "retry",
      ].includes(String(body.action)) ||
      !uuid(body.sessionId) ||
      !uuid(body.requestId)
    )
      throw new OfficeError("إجراء أو معرف جلسة غير صالح");
    if (
      [
        "reply",
        "retry",
        "approve_plan",
        "revise_plan",
        "approve_handoff",
      ].includes(String(body.action)) &&
      !runtimeInfo().configured
    )
      throw new OfficeError("مزود الذكاء الاصطناعي غير مهيأ على الخادم", 503);
    if (
      body.action === "approve_handoff" &&
      (!Number.isInteger(body.step) ||
        Number(body.step) < 1 ||
        Number(body.step) > 6)
    )
      throw new OfficeError("حدّث التسليم قبل إسناد المرحلة التالية");
    if (
      ["approve_plan", "revise_plan"].includes(String(body.action)) &&
      (!Number.isInteger(body.planVersion) || Number(body.planVersion) < 1)
    )
      throw new OfficeError("حدّث الخطة قبل الموافقة أو طلب التعديل");
    if (
      body.action === "revise_plan" &&
      (typeof body.notes !== "string" ||
        body.notes.trim().length < 3 ||
        body.notes.length > 4000)
    )
      throw new OfficeError("وضح تعديل الخطة من ٣ إلى ٤٠٠٠ حرف");
    const result = await db.rpc("vo_session_action", {
      p_workspace: officeWorkspace,
      p_id: body.sessionId,
      p_action: body.action,
      p_request: body.requestId,
      p_content:
        ["approve_plan", "revise_plan"].includes(String(body.action)) ||
        (body.action === "approve_handoff" && Number(body.planVersion) > 0)
          ? JSON.stringify({
              step: body.step,
              planVersion: body.planVersion,
              notes: body.notes,
            })
          : body.action === "approve_handoff"
            ? String(body.step)
            : typeof body.brief === "string"
              ? body.brief
              : "",
    });
    if (result.error) throw result.error;
    if (
      [
        "reply",
        "retry",
        "approve_plan",
        "revise_plan",
        "approve_handoff",
      ].includes(String(body.action))
    )
      after(wakeOfficeWorker);
    return officeResponse({ session: result.data });
  } catch (e) {
    return officeFailure(e);
  }
}

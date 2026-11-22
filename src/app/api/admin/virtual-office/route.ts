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
} from "@/lib/virtual-office/server";
import { runtimeInfo } from "@/lib/virtual-office/provider";
import { wakeOfficeWorker } from "@/lib/virtual-office/worker";
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
    await officeActor();
    const id = new URL(request.url).searchParams.get("session");
    if (id && !uuid(id)) throw new OfficeError("معرف الجلسة غير صالح");
    return officeResponse(
      id ? { messages: await sessionMessages(id) } : await snapshot(),
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
    const db = await createServiceRoleClient();
    if (body.action === "memory") {
      if (
        !isAgentId(body.agentId) ||
        typeof body.content !== "string" ||
        body.content.length > 8000
      )
        throw new OfficeError("ذاكرة الموظف غير صالحة أو تتجاوز ٨٠٠٠ حرف");
      const result = await db
        .from("vo_memories")
        .upsert({
          workspace_id: actor.workspaceId,
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
        p_workspace: actor.workspaceId,
        p_actor: actor.id,
        p_request: input.requestId,
        p_agent: input.agentId,
        p_kind: input.kind,
        p_brief: input.brief,
        p_context: {
          project: input.project,
          sourceText: input.sourceText,
          sourceUrls: input.sourceUrls,
        },
      });
      if (result.error) throw result.error;
      after(wakeOfficeWorker);
      return officeResponse({ session: result.data }, 201);
    }
    if (
      !["reply", "approve", "cancel", "retry"].includes(String(body.action)) ||
      !uuid(body.sessionId) ||
      !uuid(body.requestId)
    )
      throw new OfficeError("إجراء أو معرف جلسة غير صالح");
    if (
      ["reply", "retry"].includes(String(body.action)) &&
      !runtimeInfo().configured
    )
      throw new OfficeError("مزود الذكاء الاصطناعي غير مهيأ على الخادم", 503);
    const result = await db.rpc("vo_session_action", {
      p_workspace: actor.workspaceId,
      p_id: body.sessionId,
      p_action: body.action,
      p_request: body.requestId,
      p_content: typeof body.brief === "string" ? body.brief : "",
    });
    if (result.error) throw result.error;
    if (["reply", "retry"].includes(String(body.action)))
      after(wakeOfficeWorker);
    return officeResponse({ session: result.data });
  } catch (e) {
    return officeFailure(e);
  }
}

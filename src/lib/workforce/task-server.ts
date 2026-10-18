import "server-only";
import {
  apiError,
  assertMutation,
  createServiceRoleClient,
  workforceActor,
} from "./server";
import { textField, uuid, WorkforceError } from "./validation";

export const privateResponse = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export function workPage(params: URLSearchParams) {
  const raw = params.get("page") ?? "1";
  if (!/^[1-9]\d{0,5}$/.test(raw))
    throw new WorkforceError("رقم الصفحة غير صحيح");
  const page = Number(raw);
  return { page, from: (page - 1) * 20, to: page * 20 - 1 };
}

export function workSearch(params: URLSearchParams) {
  return (params.get("q") ?? "")
    .trim()
    .replace(/[%_(),"\\]/g, " ")
    .slice(0, 100);
}

/** SQL rechecks actor eligibility, permissions, versions and idempotency atomically. */
export async function workCommand(
  request: Request,
  scope:
    | "board"
    | "task"
    | "checklist"
    | "columns"
    | "comments"
    | "members"
    | "time",
) {
  try {
    assertMutation(request);
    const actor = await workforceActor();
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new WorkforceError("صيغة الطلب غير صحيحة");
    const input = body as Record<string, unknown>;
    if (
      Object.keys(input).some(
        (key) =>
          !["id", "version", "command", "payload", "request_key"].includes(key),
      )
    )
      throw new WorkforceError("يتضمن الطلب حقولًا غير مسموحة");
    const command = textField(input.command, "الإجراء", 1, 40);
    const id = uuid(input.id);
    const key = uuid(input.request_key);
    if (
      command !== "create" &&
      (!Number.isSafeInteger(input.version) ||
        Number(input.version) < 1 ||
        Number(input.version) > 2147483647)
    )
      throw new WorkforceError("نسخة السجل غير صحيحة؛ حدّث الصفحة");
    if (
      !input.payload ||
      typeof input.payload !== "object" ||
      Array.isArray(input.payload) ||
      Buffer.byteLength(JSON.stringify(input.payload)) > 100000
    )
      throw new WorkforceError("بيانات الإجراء غير صحيحة أو كبيرة جدًا");
    const service = await createServiceRoleClient();
    const { data, error } = await service.rpc(`wf_${scope}_command`, {
      p_actor: actor.user.id,
      p_id: id,
      p_version: command === "create" ? null : input.version,
      p_command: command,
      p_payload: input.payload,
      p_key: key,
    });
    if (error) throw error;
    return privateResponse(data);
  } catch (error) {
    return apiError(error);
  }
}

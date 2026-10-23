import "server-only";
import {
  apiError,
  assertMutation,
  createServiceRoleClient,
  workforceActor,
} from "./server";
import { requestTestRun, requireTestTask } from "./test-mode";
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
    await assertMutation(request);
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
      (!(scope === "task" && command === "review") &&
        Buffer.byteLength(JSON.stringify(input.payload)) > 100000)
    )
      throw new WorkforceError("بيانات الإجراء غير صحيحة أو كبيرة جدًا");
    const service = await createServiceRoleClient();
    if ((scope === "task" && !["create", "delete"].includes(command)) || ["checklist", "comments", "members", "time"].includes(scope)) {
      const visible = await actor.db.from("wf_tasks").select("id").eq("id", id).maybeSingle();
      if (visible.error) throw visible.error;
      if (!visible.data) throw new WorkforceError("المهمة غير متاحة", 404);
    }
    const testRun = await requestTestRun(request, actor);
    if (testRun && scope !== "task") {
      if (!["checklist", "comments", "time", "members"].includes(scope))
        throw new WorkforceError("هذا الإجراء غير متاح في جولة الاختبار", 409);
      await requireTestTask(actor, testRun, id);
    }
    const { data, error } = await service.rpc(
      scope === "task" && command === "review"
        ? "wf_evaluated_task_command"
        : testRun && scope === "task"
        ? "wf_test_task_command"
        : `wf_${scope}_command`,
      {
        ...(testRun && scope === "task" ? { p_run: testRun } : {}),
        p_actor: actor.user.id,
        p_id: id,
        p_version: command === "create" ? null : input.version,
        p_command: command,
        p_payload: input.payload,
        p_key: key,
      },
    );
    if (error) throw error;
    return privateResponse(data);
  } catch (error) {
    return apiError(error);
  }
}

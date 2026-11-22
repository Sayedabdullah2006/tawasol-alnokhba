import {
  workforceActor,
  assertMutation,
  apiError,
  createServiceRoleClient,
} from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";
import {
  coordinationSnapshot,
  coordinationWorkspace,
} from "@/lib/virtual-office/coordination-server";
import { parseDepartment } from "@/lib/virtual-office/departments";
function department(value: string | null) {
  try {
    return parseDepartment(value);
  } catch {
    throw new WorkforceError("إدارة غير صحيحة");
  }
}
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams,
      task = params.get("task");
    return privateResponse(
      await coordinationSnapshot(
        await workforceActor(),
        department(params.get("department")),
        task ? uuid(task) : undefined,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
async function input(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new WorkforceError("أرسل الطلب بصيغة JSON", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new WorkforceError("الطلب فارغ");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 16000) {
        await reader.cancel();
        throw new WorkforceError("الطلب كبير جدًا", 413);
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    reader.releaseLock();
  }
}
export async function POST(request: Request) {
  try {
    await assertMutation(request);
    const actor = await workforceActor(),
      body = await input(request);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (k) =>
          !["command", "id", "version", "payload", "requestKey"].includes(k),
      ) ||
      ![
        "create",
        "approve",
        "reject",
        "accept",
        "resolve",
        "cancel",
        "route",
      ].includes(body.command)
    )
      throw new WorkforceError("إجراء تنسيق غير صحيح");
    if (
      !body.payload ||
      typeof body.payload !== "object" ||
      Array.isArray(body.payload)
    )
      throw new WorkforceError("بيانات التنسيق غير صحيحة");
    if (
      body.command !== "create" &&
      (!Number.isSafeInteger(body.version) || body.version < 1)
    )
      throw new WorkforceError("حدّث التنسيق قبل المتابعة");
    const { data, error } = await (
      await createServiceRoleClient()
    ).rpc("vo_coordination_command", {
      p_actor: actor.user.id,
      p_workspace: coordinationWorkspace(),
      p_command: body.command,
      p_id: body.command === "create" ? null : uuid(body.id),
      p_version: body.command === "create" ? null : body.version,
      p_payload: body.payload,
      p_key: uuid(body.requestKey),
    });
    if (error) throw error;
    return privateResponse(data, body.command === "create" ? 201 : 200);
  } catch (error) {
    return apiError(error);
  }
}

import { requestTestRun, requireTestTask } from "@/lib/workforce/test-mode";
import {
  apiError,
  assertMutation,
  createServiceRoleClient,
  workforceActor,
} from "@/lib/workforce/server";
import {
  attachmentTask,
  ATTACHMENT_BUCKET,
} from "@/lib/workforce/attachment-server";
import { privateResponse } from "@/lib/workforce/task-server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const actor = await workforceActor();
    const { data: file, error } = await actor.db
      .from("wf_task_attachments")
      .select("id,task_id,object_path,filename,mime_type,archived_at")
      .eq("id", uuid((await context.params).id))
      .maybeSingle();
    if (error) throw error;
    if (!file) throw new WorkforceError("المرفق غير متاح", 404);
    await attachmentTask(actor, file.task_id);
    const service = await createServiceRoleClient();
    const { data, error: storageError } = await service.storage
      .from(ATTACHMENT_BUCKET)
      .download(file.object_path);
    if (storageError || !data)
      throw storageError || new Error("Storage unavailable");
    const preview = new URL(request.url).searchParams.get("preview") === "true";
    const inline =
      preview &&
      ["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(
        file.mime_type,
      );
    return new Response(data, {
      headers: {
        "Content-Type": file.mime_type,
        "Content-Length": String(data.size),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; frame-ancestors 'self'; sandbox",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    assertMutation(request);
    const actor = await workforceActor(),
      id = uuid((await context.params).id);
    const body = await request.json();
    if (
      !body ||
      typeof body.archived !== "boolean" ||
      Object.keys(body).some((k) => k !== "archived")
    )
      throw new WorkforceError("إجراء غير صحيح");
    const { data: file, error } = await actor.db
      .from("wf_task_attachments")
      .select("task_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!file) throw new WorkforceError("المرفق غير متاح", 404);
    await requireTestTask(
      actor,
      await requestTestRun(request, actor),
      file.task_id,
    );
    await attachmentTask(actor, file.task_id, true);
    const service = await createServiceRoleClient();
    const result = await service.rpc("wf_attachment_command", {
      p_actor: actor.user.id,
      p_id: id,
      p_task: file.task_id,
      p_command: body.archived ? "archive" : "restore",
      p_payload: {},
    });
    if (result.error) throw result.error;
    return privateResponse({ id });
  } catch (e) {
    return apiError(e);
  }
}

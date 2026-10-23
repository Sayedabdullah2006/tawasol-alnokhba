import { requestTestRun, requireTestTask } from "@/lib/workforce/test-mode";
import {
  apiError,
  assertMutation,
  createServiceRoleClient,
  workforceActor,
} from "@/lib/workforce/server";
import {
  attachmentColumns,
  attachmentTask,
  attachmentForm,
  ATTACHMENT_BUCKET,
} from "@/lib/workforce/attachment-server";
import { MAX_TASK_ATTACHMENT_BYTES } from "@/lib/workforce/attachments";
import { validateWorkforceUpload } from "@/lib/workforce/file-upload-server";
import { privateResponse, workPage } from "@/lib/workforce/task-server";
import { textField, uuid, WorkforceError } from "@/lib/workforce/validation";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const actor = await workforceActor(),
      taskId = uuid((await context.params).id);
    const { canUpload } = await attachmentTask(actor, taskId);
    const params = new URL(request.url).searchParams,
      { page, from, to } = workPage(params);
    const submission = params.get("submission_id");
    let query = actor.db
      .from("wf_task_attachments")
      .select(
        `${attachmentColumns},links:wf_submission_attachments(submission_id)`,
        { count: "exact" },
      )
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to);
    if (submission) {
      const result = await actor.db
        .from("wf_task_submissions")
        .select("id")
        .eq("id", uuid(submission))
        .eq("task_id", taskId)
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new WorkforceError("التسليم غير متاح", 404);
      query = query
        .eq("links.submission_id", submission)
        .not("links", "is", null);
    } else if (params.get("archived") !== "true")
      query = query.is("archived_at", null);
    const { data, error, count } = await query;
    if (error) throw error;
    return privateResponse({
      attachments: (data || []).map(({ links, ...file }) => ({
        ...file,
        sealed: links.length > 0,
        canManage:
          canUpload &&
          !links.length &&
          (actor.role === "admin" || file.created_by === actor.user.id),
      })),
      count: count || 0,
      page,
      canUpload,
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request, context: Context) {
  let uploadedPath: string | undefined;
  let attachmentId: string | undefined;
  try {
    await assertMutation(request);
    const actor = await workforceActor(),
      taskId = uuid((await context.params).id);
    await requireTestTask(actor, await requestTestRun(request, actor), taskId);
    const access = await attachmentTask(actor, taskId, true);
    const form = await attachmentForm(request, MAX_TASK_ATTACHMENT_BYTES);
    attachmentId = uuid(form.get("request_key"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new WorkforceError("اختر ملفًا");
    const title = textField(
      form.get("title") || file.name,
      "عنوان المرفق",
      1,
      150,
    );
    const purpose = form.get("purpose") || "task";
    if (!["task", "delivery"].includes(String(purpose)))
      throw new WorkforceError("نوع المرفق غير صحيح");
    const checked = await validateWorkforceUpload(file, MAX_TASK_ATTACHMENT_BYTES);
    const service = await createServiceRoleClient();
    const { data: previous, error: previousError } = await service
      .from("wf_task_attachments")
      .select("id,task_id,created_by,sha256,filename,title,purpose")
      .eq("id", attachmentId)
      .maybeSingle();
    if (previousError) throw previousError;
    if (previous) {
      if (
        previous.task_id !== taskId ||
        previous.created_by !== actor.user.id ||
        previous.sha256 !== checked.sha256 ||
        previous.filename !== checked.filename ||
        previous.title !== title ||
        previous.purpose !== purpose
      )
        throw new WorkforceError("مفتاح الرفع مستخدم لملف آخر", 409);
      return privateResponse({ id: attachmentId });
    }
    if (!access.canUpload)
      throw new WorkforceError(
        "المرفقات للقراءة أثناء المراجعة أو الإكمال أو الأرشفة",
        409,
      );
    // Each attempt owns a distinct object: a losing concurrent retry can only clean up its own object.
    uploadedPath = `${taskId}/${crypto.randomUUID()}`;
    const { error: uploadError } = await service.storage
      .from(ATTACHMENT_BUCKET)
      .upload(uploadedPath, checked.bytes, {
        contentType: checked.mime,
        upsert: false,
      });
    if (uploadError) throw uploadError;
    const { data, error } = await service.rpc("wf_attachment_command", {
      p_actor: actor.user.id,
      p_id: attachmentId,
      p_task: taskId,
      p_command: "add",
      p_payload: {
        title,
        purpose,
        filename: checked.filename,
        sha256: checked.sha256,
        mime_type: checked.mime,
        size_bytes: file.size,
        object_path: uploadedPath,
      },
    });
    // Only remove this attempt's object after an authoritative lookup confirms it is not linked.
    const verify = await service
      .from("wf_task_attachments")
      .select("object_path")
      .eq("id", attachmentId)
      .maybeSingle();
    if (!verify.error && verify.data?.object_path !== uploadedPath)
      await service.storage.from(ATTACHMENT_BUCKET).remove([uploadedPath]);
    uploadedPath = undefined;
    if (error) throw error;
    return privateResponse({ id: data.id }, 201);
  } catch (e) {
    if (uploadedPath && attachmentId) {
      const service = await createServiceRoleClient();
      const verify = await service
        .from("wf_task_attachments")
        .select("object_path")
        .eq("id", attachmentId)
        .maybeSingle();
      if (!verify.error && verify.data?.object_path !== uploadedPath)
        await service.storage.from(ATTACHMENT_BUCKET).remove([uploadedPath]);
    }
    return apiError(e);
  }
}

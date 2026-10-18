import {
  apiError,
  createServiceRoleClient,
  workforceActor,
} from "@/lib/workforce/server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await workforceActor(),
      id = uuid((await params).id);
    const file = await actor.db
      .from("wf_knowledge_files")
      .select(
        "filename,mime_type,object_path,bucket,task_attachment_id,deleted_at,created_by",
      )
      .eq("id", id)
      .maybeSingle();
    if (file.error) throw file.error;
    if (!file.data) throw new WorkforceError("الملف غير متاح", 404);
    const service = await createServiceRoleClient(),
      result = await service.storage
        .from(file.data.bucket)
        .download(file.data.object_path);
    if (result.error || !result.data)
      throw result.error || new Error("Storage unavailable");
    const inline =
      new URL(request.url).searchParams.get("preview") === "true" &&
      [
        "image/png",
        "image/jpeg",
        "image/webp",
        "application/pdf",
        "text/plain",
        "text/csv",
      ].includes(file.data.mime_type);
    return new Response(result.data, {
      headers: {
        "Content-Type": `${file.data.mime_type}${file.data.mime_type.startsWith("text/") ? "; charset=utf-8" : ""}`,
        "Content-Length": String(result.data.size),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.data.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; frame-ancestors 'self'; sandbox",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

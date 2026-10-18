import {
  apiError,
  workforceActor,
  createServiceRoleClient,
} from "@/lib/workforce/server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";
import { ATTACHMENT_BUCKET } from "@/lib/workforce/attachment-server";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
) {
  try {
    const actor = await workforceActor(),
      { id, file } = await params;
    const result = await actor.db
      .from("wf_employee_requests")
      .select("attachments")
      .eq("id", uuid(id))
      .maybeSingle();
    if (result.error) throw result.error;
    const attachment = result.data?.attachments.find(
      (item: { id: string }) => item.id === uuid(file),
    );
    if (!attachment) throw new WorkforceError("المرفق غير متاح", 404);
    const service = await createServiceRoleClient(),
      download = await service.storage
        .from(ATTACHMENT_BUCKET)
        .download(attachment.object_path);
    if (download.error || !download.data) throw download.error;
    const inline =
      new URL(request.url).searchParams.get("preview") === "true" &&
      (attachment.mime_type === "application/pdf" ||
        ["image/png", "image/jpeg", "image/webp"].includes(
          attachment.mime_type,
        ));
    return new Response(download.data, {
      headers: {
        "Content-Type": attachment.mime_type,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

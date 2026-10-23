import {
  apiError,
  assertMutation,
  createServiceRoleClient,
  requireAdmin,
  workforceActor,
} from "@/lib/workforce/server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await workforceActor();
    const { data: document, error } = await actor.db
      .from("wf_employee_documents")
      .select("object_path,filename,mime_type")
      .eq("id", uuid((await context.params).id))
      .maybeSingle();
    if (error) throw error;
    if (!document) throw new WorkforceError("المستند غير متاح", 404);
    const service = await createServiceRoleClient();
    const { data, error: downloadError } = await service.storage
      .from("workforce-private")
      .download(document.object_path);
    if (downloadError || !data) throw downloadError;
    return new Response(data, {
      headers: {
        "Content-Type": document.mime_type,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await assertMutation(request);
    const actor = await workforceActor();
    requireAdmin(actor);
    const { archived } = await request.json();
    if (typeof archived !== "boolean")
      throw new WorkforceError("إجراء غير صحيح");
    const service = await createServiceRoleClient();
    const { data, error } = await service.rpc("wf_archive_document", {
      p_id: uuid((await context.params).id),
      p_actor: actor.user.id,
      p_archived: archived,
    });
    if (error) throw error;
    if (!data) throw new WorkforceError("المستند غير متاح", 404);
    return Response.json({ id: data });
  } catch (error) {
    return apiError(error);
  }
}

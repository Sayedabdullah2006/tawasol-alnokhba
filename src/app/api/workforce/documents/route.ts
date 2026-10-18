import {
  apiError,
  assertMutation,
  createServiceRoleClient,
  requireEmployeeAccess,
  workforceActor,
} from "@/lib/workforce/server";
import {
  dateField,
  textField,
  uuid,
  WorkforceError,
} from "@/lib/workforce/validation";
export async function POST(request: Request) {
  try {
    assertMutation(request);
    const actor = await workforceActor();
    if (Number(request.headers.get("content-length") ?? 0) > 11 * 1024 * 1024)
      throw new WorkforceError("الحد الأقصى للملف 10 ميجابايت", 413);
    const form = await request.formData();
    const employee_id = uuid(form.get("employee_id"));
    requireEmployeeAccess(actor, employee_id);
    const { data: employee } = await actor.db
      .from("wf_employees")
      .select("id")
      .eq("id", employee_id)
      .maybeSingle();
    if (!employee) throw new WorkforceError("الملف غير متاح", 404);
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size < 1 ||
      file.size > 10 * 1024 * 1024
    )
      throw new WorkforceError(
        "اختر ملف PDF أو صورة بحجم لا يتجاوز 10 ميجابايت",
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isPdf = String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
    const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    );
    const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const type = isPdf
      ? "application/pdf"
      : isPng
        ? "image/png"
        : isJpeg
          ? "image/jpeg"
          : null;
    if (!type || type !== file.type)
      throw new WorkforceError("محتوى الملف أو نوعه غير مسموح");
    const title = textField(form.get("title"), "عنوان المستند", 1, 150);
    const expires_on = dateField(form.get("expires_on"), true);
    const id = uuid(form.get("request_key"));
    const object_path = `${employee_id}/${id}.${isPdf ? "pdf" : isPng ? "png" : "jpg"}`;
    const service = await createServiceRoleClient();
    const { data: previous, error: previousError } = await service
      .from("wf_employee_documents")
      .select("id,employee_id,created_by,title,size_bytes")
      .eq("id", id)
      .maybeSingle();
    if (previousError) throw previousError;
    if (previous) {
      if (
        previous.employee_id !== employee_id ||
        previous.created_by !== actor.user.id ||
        previous.title !== title ||
        previous.size_bytes !== file.size
      )
        throw new WorkforceError("مفتاح رفع الملف مستخدم لعملية أخرى", 409);
      return Response.json({ id: previous.id });
    }
    const { error: uploadError } = await service.storage
      .from("workforce-private")
      .upload(object_path, bytes, { contentType: type, upsert: false });
    if (uploadError) throw uploadError;
    const { error } = await service
      .from("wf_employee_documents")
      .insert({
        id,
        employee_id,
        title,
        object_path,
        filename: file.name.replace(/[\r\n\\/]/g, "_").slice(0, 200),
        mime_type: type,
        size_bytes: file.size,
        employee_visible:
          actor.role === "employee" || form.get("employee_visible") !== "false",
        expires_on,
        created_by: actor.user.id,
      });
    if (error) {
      await service.storage.from("workforce-private").remove([object_path]);
      throw error;
    }
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

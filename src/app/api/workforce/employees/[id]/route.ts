import {
  apiError,
  assertMutation,
  createServiceRoleClient,
  employeeDetail,
  requireAdmin,
  requireEmployeeAccess,
  workforceActor,
} from "@/lib/workforce/server";
import {
  employeeFields,
  textField,
  uuid,
  WorkforceError,
} from "@/lib/workforce/validation";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(
      await employeeDetail(
        await workforceActor(),
        uuid((await context.params).id),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertMutation(request);
    const actor = await workforceActor();
    const id = uuid((await context.params).id);
    requireEmployeeAccess(actor, id);
    const body = await request.json();
    if (!Number.isInteger(body.version) || body.version < 1)
      throw new WorkforceError("حدّث الملف قبل الحفظ", 409);
    let patch: Record<string, unknown>;
    if (body.action === "status") {
      requireAdmin(actor);
      if (!["active", "suspended", "ended"].includes(body.status))
        throw new WorkforceError("الحالة غير صحيحة");
      patch = {
        status: body.status,
        status_reason: textField(body.reason, "سبب تغيير الحالة", 3, 2000),
      };
    } else if (body.action === "profile") {
      if (actor.role === "admin") patch = employeeFields(body);
      else {
        const forbidden = Object.keys(body).filter(
          (key) => !["action", "version", "phone", "city"].includes(key),
        );
        if (forbidden.length)
          throw new WorkforceError(
            "يمكن تعديل الهاتف والمدينة فقط؛ استخدم طلب تغيير للبيانات الحساسة",
            403,
          );
        patch = {
          phone: textField(body.phone, "الهاتف", 0, 30),
          city: textField(body.city, "المدينة", 0, 100),
        };
      }
    } else if (body.action === "notes") {
      requireAdmin(actor);
      const service = await createServiceRoleClient();
      const { error } = await service.rpc("wf_save_employee_notes", {
        p_employee: id,
        p_actor: actor.user.id,
        p_version: body.version,
        p_notes: textField(body.notes, "الملاحظات", 0, 10000),
      });
      if (error) throw error;
      return Response.json({ success: true });
    } else throw new WorkforceError("إجراء غير معروف");
    const service = await createServiceRoleClient();
    let query = service
      .from("wf_employees")
      .update({ ...patch, updated_by: actor.user.id })
      .eq("id", id)
      .eq("version", body.version);
    if (actor.role === "employee")
      query = query.eq("status", "active").eq("user_id", actor.user.id);
    const { data, error } = await query.select("id,version").maybeSingle();
    if (error) throw error;
    if (!data)
      throw new WorkforceError(
        "تغير الملف منذ فتحه؛ حدّث الصفحة قبل الحفظ",
        409,
      );
    return Response.json(data);
  } catch (error) {
    return apiError(error);
  }
}

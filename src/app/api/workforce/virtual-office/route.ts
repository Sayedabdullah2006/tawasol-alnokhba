import {
  workforceActor,
  assertMutation,
  apiError,
  createServiceRoleClient,
} from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";
import { employeeOfficeSnapshot } from "@/lib/virtual-office/employee-server";

export async function GET() {
  try {
    return privateResponse(
      await employeeOfficeSnapshot(await workforceActor()),
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    await assertMutation(request); // Existing origin, attendance and device restrictions remain in force.
    const actor = await workforceActor();
    if (!actor.employee)
      throw new WorkforceError("تغيير الحالة من حساب الموظف فقط", 403);
    if (Number(request.headers.get("content-length")) > 1024)
      throw new WorkforceError("الطلب كبير جدًا", 413);
    const raw = await request.text();
    if (raw.length > 1024) throw new WorkforceError("الطلب كبير جدًا", 413);
    const form = request.headers
      .get("content-type")
      ?.startsWith("application/x-www-form-urlencoded");
    const fields = form ? new URLSearchParams(raw) : null;
    if (
      fields &&
      [...fields.keys()].some((key) => fields.getAll(key).length !== 1)
    )
      throw new WorkforceError("بيانات الإجراء غير صحيحة");
    const body = fields ? Object.fromEntries(fields) : JSON.parse(raw);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => !["state", "sessionId"].includes(key)) ||
      !["available", "busy"].includes(body.state)
    )
      throw new WorkforceError("اختر متاح أو مشغول");
    const { error } = await (
      await createServiceRoleClient()
    ).rpc("vo_set_availability", {
      p_actor: actor.user.id,
      p_session: uuid(body.sessionId),
      p_state: body.state,
    });
    if (error) throw error;
    if (form)
      return Response.redirect(
        new URL(
          "/employee/virtual-office",
          process.env.NEXT_PUBLIC_SITE_URL || request.url,
        ),
        303,
      );
    return privateResponse(await employeeOfficeSnapshot(actor));
  } catch (error) {
    return apiError(error);
  }
}

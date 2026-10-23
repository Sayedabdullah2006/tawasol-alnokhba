import {
  apiError,
  assertMutation,
  createServiceRoleClient,
  requireAdmin,
  workforceActor,
} from "@/lib/workforce/server";
import {
  ibanField,
  textField,
  uuid,
  WorkforceError,
} from "@/lib/workforce/validation";
export async function GET(request: Request) {
  try {
    const actor = await workforceActor();
    requireAdmin(actor);
    const params = new URL(request.url).searchParams;
    const requestedPage = params.get("page") ?? "1";
    const focused = params.get("request") ? uuid(params.get("request")) : null;
    if (!/^[1-9]\d{0,5}$/.test(requestedPage))
      throw new WorkforceError("رقم الصفحة غير صحيح");
    const page = Number(requestedPage);
    const pageSize = 20;
    let query = actor.db
      .from("wf_profile_change_requests")
      .select("*,wf_employees(full_name)", { count: "exact" })
      .eq("status", "pending")
      .order("created_at")
      .order("id")
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (focused) query = query.eq("id", focused);
    const { data, error, count } = await query;
    if (error?.code === "PGRST103") {
      let totalQuery = actor.db
        .from("wf_profile_change_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (focused) totalQuery = totalQuery.eq("id", focused);
      const total = await totalQuery;
      if (total.error) throw total.error;
      return Response.json(
        { requests: [], count: total.count, page, pageSize },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (error) throw error;
    return Response.json(
      { requests: data, count, page, pageSize },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    await assertMutation(request);
    const actor = await workforceActor();
    if (!actor.employee)
      throw new WorkforceError("هذا الإجراء خاص بالموظف", 403);
    const body = await request.json();
    if (!["full_name", "iban", "bank_name"].includes(body.field))
      throw new WorkforceError("حقل غير مسموح");
    const proposed_value =
      body.field === "iban"
        ? ibanField(body.proposed_value)
        : textField(body.proposed_value, "القيمة المطلوبة", 2, 150);
    const request_key = uuid(body.request_key);
    const service = await createServiceRoleClient();
    const { data: previous } = await actor.db
      .from("wf_profile_change_requests")
      .select("id")
      .eq("request_key", request_key)
      .maybeSingle();
    if (previous) return Response.json(previous);
    const { data, error } = await service
      .from("wf_profile_change_requests")
      .insert({
        employee_id: actor.employee.id,
        field: body.field,
        proposed_value,
        reason: textField(body.reason, "السبب", 3, 2000),
        request_key,
      })
      .select("id")
      .single();
    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    await assertMutation(request);
    const actor = await workforceActor();
    requireAdmin(actor);
    const body = await request.json();
    if (!["approved", "rejected"].includes(body.decision))
      throw new WorkforceError("قرار غير صحيح");
    const service = await createServiceRoleClient();
    const { error } = await service.rpc("wf_decide_profile_change", {
      p_id: uuid(body.id),
      p_actor: actor.user.id,
      p_decision: body.decision,
      p_reason: textField(body.reason, "سبب القرار", 3, 2000),
    });
    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}

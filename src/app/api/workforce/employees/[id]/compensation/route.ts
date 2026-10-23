import {
  apiError,
  assertMutation,
  createServiceRoleClient,
  requireAdmin,
  requireEmployeeAccess,
  workforceActor,
} from "@/lib/workforce/server";
import { compensationInput } from "@/lib/workforce/compensation";
import { uuid, WorkforceError } from "@/lib/workforce/validation";
import { privateResponse, workPage } from "@/lib/workforce/task-server";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const actor = await workforceActor();
    const id = uuid((await context.params).id);
    requireEmployeeAccess(actor, id);
    const { data: employee, error: employeeError } = await actor.db
      .from("wf_employees")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (employeeError) throw employeeError;
    if (!employee) throw new WorkforceError("الموظف غير متاح", 404);
    const { page, from, to } = workPage(new URL(request.url).searchParams);
    const companyDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const query = () =>
      actor.db
        .from("wf_compensation_versions")
        .select("*")
        .eq("employee_id", id);
    const [latest, current, history] = await Promise.all([
      query().order("revision", { ascending: false }).limit(1).maybeSingle(),
      query()
        .lte("effective_from", companyDate)
        .order("effective_from", { ascending: false })
        .order("revision", { ascending: false })
        .limit(1)
        .maybeSingle(),
      actor.db
        .from("wf_compensation_versions")
        .select("*", { count: "exact" })
        .eq("employee_id", id)
        .order("revision", { ascending: false })
        .range(from, to),
    ]);
    for (const result of [latest, current, history])
      if (result.error && result.error.code !== "PGRST103") throw result.error;
    const normalize = (row: typeof latest.data) =>
      row ? { ...row, basic_salary: String(row.basic_salary) } : null;
    return privateResponse({
      latest: normalize(latest.data),
      current: normalize(current.data),
      history: (history.data ?? []).map(normalize),
      page,
      count: history.count ?? 0,
      companyDate,
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    await assertMutation(request);
    const actor = await workforceActor();
    requireAdmin(actor);
    const id = uuid((await context.params).id);
    const body = await request.json();
    if (
      !body ||
      !Number.isSafeInteger(body.revision) ||
      body.revision < 0 ||
      body.revision > 2147483647
    )
      throw new WorkforceError("نسخة إعداد المستحقات غير صحيحة");
    const payload = compensationInput(body.payload);
    const service = await createServiceRoleClient();
    const { data, error } = await service.rpc("wf_save_compensation", {
      p_actor: actor.user.id,
      p_employee: id,
      p_revision: body.revision,
      p_payload: payload,
      p_key: uuid(body.request_key),
    });
    if (error) throw error;
    return privateResponse(data);
  } catch (error) {
    return apiError(error);
  }
}

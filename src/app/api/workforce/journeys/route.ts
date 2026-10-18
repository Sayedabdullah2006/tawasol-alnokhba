import {
  apiError,
  assertMutation,
  createServiceRoleClient,
  workforceActor,
} from "@/lib/workforce/server";
import { privateResponse, workPage } from "@/lib/workforce/task-server";
import { requestTestRun } from "@/lib/workforce/test-mode";
import { uuid, WorkforceError } from "@/lib/workforce/validation";
import { defaultPreferences, journeySections } from "@/lib/workforce/journeys";
export async function GET(request: Request) {
  try {
    const actor = await workforceActor(),
      run = await requestTestRun(request, actor),
      params = new URL(request.url).searchParams,
      kind = params.get("kind") || "goal",
      { page, from, to } = workPage(params);
    if (!Object.hasOwn(journeySections, kind))
      throw new WorkforceError("قسم غير صحيح");
    const prefs = await actor.db
      .from("wf_notification_preferences")
      .select("version,settings")
      .eq("user_id", actor.user.id)
      .filter("test_run_id", run ? "eq" : "is", run || "null")
      .maybeSingle();
    if (prefs.error) throw prefs.error;
    if (kind === "preferences")
      return privateResponse({
        items: [],
        events: [],
        receipts: [],
        employees: [],
        reviews: [],
        advanceRequests: [],
        page,
        count: 0,
        admin: actor.role === "admin",
        userId: actor.user.id,
        preferences: prefs.data || {
          version: 0,
          settings: defaultPreferences(),
        },
      });
    let query = actor.db
      .from("wf_hr_items")
      .select("*", { count: "exact" })
      .eq("kind", kind)
      .filter("test_run_id", run ? "eq" : "is", run || "null")
      .order("due_on", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to);
    if (params.get("employee"))
      query = query.eq("employee_id", uuid(params.get("employee")));
    const status = params.get("status");
    if (status) query = query.eq("status", status);
    const rows = await query;
    if (rows.error) throw rows.error;
    const ids = (rows.data || []).map((r) => r.id),
      service = await createServiceRoleClient();
    const [events, receipts, staff, reviews, requests] = await Promise.all([
      ids.length
        ? actor.db
            .from("wf_hr_events")
            .select("id,item_id,action,amount,note,created_at")
            .in("item_id", ids)
            .order("id", { ascending: false })
            .limit(400)
        : { data: [], error: null },
      ids.length
        ? actor.db
            .from("wf_policy_receipts")
            .select("item_id,user_id,acknowledged_at")
            .in("item_id", ids)
        : { data: [], error: null },
      actor.role === "admin"
        ? service
            .from("wf_employees")
            .select("id,full_name")
            .eq("status", "active")
            .order("full_name")
        : { data: [], error: null },
      kind === "appeal"
        ? actor.db
            .from("wf_hr_items")
            .select("*")
            .eq("kind", "review")
            .eq("status", "published")
            .filter("test_run_id", run ? "eq" : "is", run || "null")
            .order("created_at", { ascending: false })
            .limit(100)
        : { data: [], error: null },
      kind === "advance" && actor.role === "admin"
        ? actor.db
            .from("wf_employee_requests")
            .select("id,title,amount,employee_id")
            .eq("kind", "advance")
            .eq("status", "approved")
            .filter("test_run_id", run ? "eq" : "is", run || "null")
            .limit(100)
        : { data: [], error: null },
    ]);
    for (const result of [events, receipts, staff, reviews, requests])
      if (result.error) throw result.error;
    return privateResponse({
      items: rows.data,
      events: events.data,
      receipts: receipts.data,
      employees: staff.data,
      reviews: reviews.data,
      advanceRequests: requests.data,
      count: rows.count,
      page,
      admin: actor.role === "admin",
      userId: actor.user.id,
      preferences: prefs.data || { version: 0, settings: defaultPreferences() },
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertMutation(request);
    const actor = await workforceActor(),
      run = await requestTestRun(request, actor),
      body = await request.json();
    if (!body || !Number.isSafeInteger(body.version) || body.version < 0)
      throw new WorkforceError("حدّث الصفحة قبل الحفظ");
    const service = await createServiceRoleClient();
    if (body.command === "preferences") {
      const r = await service.rpc("wf_preferences_command", {
        p_actor: actor.user.id,
        p_run: run,
        p_version: body.version,
        p_settings: body.settings,
      });
      if (r.error) throw r.error;
      return privateResponse(r.data);
    }
    if (
      typeof body.command !== "string" ||
      !body.payload ||
      typeof body.payload !== "object" ||
      Array.isArray(body.payload) ||
      JSON.stringify(body.payload).length > 20000
    )
      throw new WorkforceError("بيانات غير صحيحة");
    const r = await service.rpc("wf_hr_command", {
      p_actor: actor.user.id,
      p_run: run,
      p_id: uuid(body.id),
      p_version: body.version,
      p_command: body.command,
      p_payload: body.payload,
      p_key: uuid(body.request_key),
    });
    if (r.error) throw r.error;
    return privateResponse(r.data);
  } catch (e) {
    return apiError(e);
  }
}

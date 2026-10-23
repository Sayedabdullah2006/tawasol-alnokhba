import {
  apiError,
  assertMutation,
  createServiceRoleClient,
  workforceActor,
} from "@/lib/workforce/server";
import { privateResponse, workPage } from "@/lib/workforce/task-server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";

export async function GET(request: Request) {
  try {
    const actor = await workforceActor();
    const params = new URL(request.url).searchParams;
    if (params.get("summary") === "true") {
      const result = await actor.db
        .from("wf_notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", actor.user.id)
        .is("read_at", null);
      if (result.error) throw result.error;
      return privateResponse({
        unread: result.count || 0,
        recipientId: actor.user.id,
      });
    }
    const { page, from, to } = workPage(params);
    let query = actor.db
      .from("wf_notifications")
      .select("id,kind,title,body,href,read_at,created_at", { count: "exact" })
      .eq("recipient_id", actor.user.id)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to);
    if (params.get("unread") === "true") query = query.is("read_at", null);
    const [result, unread] = await Promise.all([
      query,
      actor.db
        .from("wf_notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", actor.user.id)
        .is("read_at", null),
    ]);
    if (result.error && result.error.code !== "PGRST103") throw result.error;
    if (unread.error) throw unread.error;
    return privateResponse({
      recipientId: actor.user.id,
      notifications: result.data ?? [],
      count: result.count ?? 0,
      unread: unread.count ?? 0,
      page,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertMutation(request);
    const actor = await workforceActor();
    const body = await request.json();
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((k) => !["id", "all"].includes(k)) ||
      (body.all !== true && !body.id) ||
      (body.all === true && body.id)
    )
      throw new WorkforceError("حدد إشعارًا أو جميع الإشعارات");
    const service = await createServiceRoleClient();
    let query = service
      .from("wf_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", actor.user.id)
      .is("read_at", null);
    if (body.all !== true) query = query.eq("id", uuid(body.id));
    const { error } = await query;
    if (error) throw error;
    return privateResponse({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

import {
  apiError,
  createServiceRoleClient,
  workforceActor,
} from "@/lib/workforce/server";
import { privateResponse, workPage } from "@/lib/workforce/task-server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await workforceActor();
    const id = uuid((await params).id);
    const search = new URL(request.url).searchParams;
    const { page, from, to } = workPage(search);
    const kind = search.get("kind") ?? "events";
    if (!["events", "submissions"].includes(kind))
      throw new WorkforceError("نوع السجل غير صحيح");
    const task = await actor.db
      .from("wf_tasks")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (task.error) throw task.error;
    if (!task.data) throw new WorkforceError("المهمة غير متاحة", 404);
    if (kind === "submissions") {
      const result = await actor.db
        .from("wf_task_submissions")
        .select(
          "id,summary,status,decision_reason,created_at,decided_at,submission_number",
          { count: "exact" },
        )
        .eq("task_id", id)
        .order("submission_number", { ascending: false })
        .range(from, to);
      if (result.error && result.error.code !== "PGRST103") throw result.error;
      return privateResponse({
        submissions: result.data ?? [],
        events: [],
        count: result.count ?? 0,
        page,
      });
    }
    const result = await actor.db
      .from("wf_task_events")
      .select("id,actor_id,action,summary,changed_fields,created_at", {
        count: "exact",
      })
      .eq("task_id", id)
      .order("id", { ascending: false })
      .range(from, to);
    if (result.error && result.error.code !== "PGRST103") throw result.error;
    // Only resolve work identities already present in this authorized task history.
    const ids = [...new Set((result.data ?? []).map((event) => event.actor_id))];
    const service = await createServiceRoleClient();
    const names = ids.length
      ? await service
          .from("wf_employees")
          .select("user_id,full_name")
          .in("user_id", ids)
      : { data: [], error: null };
    if (names.error) throw names.error;
    const byId = new Map(
      names.data?.map((person) => [person.user_id, person.full_name]),
    );
    const events = (result.data ?? []).map(({ actor_id, ...event }) => ({
      ...event,
      actorName: byId.get(actor_id) ?? "مدير النظام",
    }));
    return privateResponse({
      events,
      submissions: [],
      count: result.count ?? 0,
      page,
    });
  } catch (error) {
    return apiError(error);
  }
}

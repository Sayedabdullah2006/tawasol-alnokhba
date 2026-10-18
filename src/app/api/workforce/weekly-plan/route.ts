import {
  apiError,
  assertMutation,
  createServiceRoleClient,
  requireAdmin,
  workforceActor,
} from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";

export async function POST(request: Request) {
  try {
    assertMutation(request);
    const actor = await workforceActor();
    requireAdmin(actor);
    const body = await request.json();
    if (
      !body ||
      !Array.isArray(body.tasks) ||
      body.tasks.length < 1 ||
      body.tasks.length > 100 ||
      Object.keys(body).some((k) => !["tasks", "request_key"].includes(k))
    )
      throw new WorkforceError("الخطة تتطلب من مهمة إلى 100 مهمة");
    const service = await createServiceRoleClient();
    const { data, error } = await service.rpc("wf_assign_weekly_plan", {
      p_actor: actor.user.id,
      p_key: uuid(body.request_key),
      p_tasks: body.tasks,
    });
    if (error) throw error;
    return privateResponse(data);
  } catch (error) {
    return apiError(error);
  }
}

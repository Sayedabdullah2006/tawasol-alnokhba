import { apiError, requireAdmin, workforceActor } from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";
import {
  dateField,
  uuid,
  textField,
  WorkforceError,
} from "@/lib/workforce/validation";

export async function GET(request: Request) {
  try {
    const actor = await workforceActor();
    requireAdmin(actor);
    const params = new URL(request.url).searchParams;
    const from = dateField(params.get("due_from"), true);
    const to = dateField(params.get("due_to"), true);
    if (from && to && from > to)
      throw new WorkforceError("نهاية الفترة تسبق بدايتها");
    const employee = params.get("assignee_id");
    const { data, error } = await actor.db.rpc("wf_admin_dashboard", {
      p_from: from,
      p_to: to,
      p_employee: employee ? uuid(employee) : null,
      p_client:
        textField(params.get("client_name") ?? "", "العميل", 0, 150) || null,
    });
    if (error) throw error;
    return privateResponse(data);
  } catch (error) {
    return apiError(error);
  }
}

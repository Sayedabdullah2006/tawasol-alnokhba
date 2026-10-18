import {
  apiError,
  createServiceRoleClient,
  workforceActor,
} from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";

// Team work identity only; HR records, contact and pay remain private.
export async function GET() {
  try {
    await workforceActor();
    const service = await createServiceRoleClient();
    const result = await service
      .from("wf_employees")
      .select("id,full_name")
      .eq("status", "active")
      .order("full_name")
      .limit(1000);
    if (result.error) throw result.error;
    return privateResponse({ employees: result.data });
  } catch (error) {
    return apiError(error);
  }
}

import {
  apiError,
  createServiceRoleClient,
  requireAdmin,
  workforceActor,
} from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";

export async function GET() {
  try {
    requireAdmin(await workforceActor());
    const db = await createServiceRoleClient();
    const [settings, recent, ...counts] = await Promise.all([
      db
        .from("wf_notification_delivery_settings")
        .select("enabled,last_run_at")
        .single(),
      db
        .from("wf_notification_deliveries")
        .select(
          "id,status,attempts,last_error,sent_at,created_at,notification:wf_notifications(title)",
        )
        .order("created_at", { ascending: false })
        .limit(8),
      ...["pending", "processing", "sent", "failed"].map((status) =>
        db
          .from("wf_notification_deliveries")
          .select("id", { count: "exact", head: true })
          .eq("status", status),
      ),
    ]);
    for (const result of [settings, recent, ...counts])
      if (result.error) throw result.error;
    return privateResponse({
      settings: settings.data,
      recent: recent.data,
      counts: Object.fromEntries(
        ["pending", "processing", "sent", "failed"].map((key, i) => [
          key,
          counts[i].count || 0,
        ]),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}

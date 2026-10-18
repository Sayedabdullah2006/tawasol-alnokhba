import "server-only";
import type { WorkforceActor } from "./server";
import { uuid, WorkforceError } from "./validation";

export type RecordKind = "documents" | "changes" | "events";
export const recordPageSize = 20;

export async function employeeRecords(
  actor: WorkforceActor,
  employeeId: string,
  kind: RecordKind,
  cursor?: string | null,
) {
  if (actor.role !== "admin" && actor.employee?.id !== employeeId)
    throw new WorkforceError("الملف غير متاح", 404);
  if (kind === "events" && actor.role !== "admin")
    throw new WorkforceError("ليس لديك صلاحية الوصول", 403);
  let query =
    kind === "documents"
      ? actor.db
          .from("wf_employee_documents")
          .select(
            "id,employee_id,title,filename,size_bytes,employee_visible,expires_on,archived_at,created_at",
          )
          .eq("employee_id", employeeId)
      : kind === "changes"
        ? actor.db
            .from("wf_profile_change_requests")
            .select("*")
            .eq("employee_id", employeeId)
        : actor.db
            .from("wf_audit_events")
            .select("id,action,changed_fields,created_at")
            .eq("entity_table", "wf_employees")
            .eq("entity_id", employeeId);
  if (cursor) {
    if (cursor.length > 220) throw new WorkforceError("مؤشر الصفحة غير صحيح");
    let value: { id?: unknown; created_at?: unknown };
    try {
      value = JSON.parse(cursor);
    } catch {
      throw new WorkforceError("مؤشر الصفحة غير صحيح");
    }
    if (
      !value ||
      typeof value.created_at !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(
        value.created_at,
      ) ||
      !Number.isFinite(Date.parse(value.created_at))
    )
      throw new WorkforceError("مؤشر الصفحة غير صحيح");
    const id = kind === "events" ? String(value.id) : uuid(value.id);
    if (kind === "events" && !/^[1-9]\d{0,18}$/.test(id))
      throw new WorkforceError("مؤشر الصفحة غير صحيح");
    query = query.or(
      `created_at.lt.${value.created_at},and(created_at.eq.${value.created_at},id.lt.${id})`,
    );
  }
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(recordPageSize + 1);
  if (error) throw error;
  const rows = (data ?? []).slice(0, recordPageSize);
  const last = rows.at(-1);
  return {
    rows,
    nextCursor:
      data && data.length > recordPageSize && last
        ? JSON.stringify({ created_at: last.created_at, id: last.id })
        : null,
  };
}

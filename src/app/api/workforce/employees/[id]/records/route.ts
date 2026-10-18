import { apiError, workforceActor } from "@/lib/workforce/server";
import {
  employeeRecords,
  type RecordKind,
} from "@/lib/workforce/employee-records";
import { uuid, WorkforceError } from "@/lib/workforce/validation";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await workforceActor();
    const id = uuid((await context.params).id);
    const params = new URL(request.url).searchParams;
    const kind = params.get("kind");
    if (!kind || !["documents", "changes", "events"].includes(kind))
      throw new WorkforceError("نوع السجل غير صحيح");
    return Response.json(
      await employeeRecords(
        actor,
        id,
        kind as RecordKind,
        params.get("cursor"),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

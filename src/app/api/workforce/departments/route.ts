import {
  apiError,
  assertMutation,
  createServiceRoleClient,
  requireAdmin,
  workforceActor,
} from "@/lib/workforce/server";
import { textField } from "@/lib/workforce/validation";
export async function POST(request: Request) {
  try {
    await assertMutation(request);
    requireAdmin(await workforceActor());
    const body = await request.json();
    const service = await createServiceRoleClient();
    const { data, error } = await service
      .from("wf_departments")
      .insert({ name: textField(body.name, "اسم القسم", 1, 100) })
      .select()
      .single();
    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

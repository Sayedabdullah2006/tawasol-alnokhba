import "server-only";
import { cookies } from "next/headers";
import { createServiceRoleClient, type WorkforceActor } from "./server";
import { uuid, WorkforceError } from "./validation";
export const TEST_MODE_COOKIE = "wf_test_run";
export type TestRun = { id: string; active: boolean; expires_at: string };
export async function testRunAction(
  action: string,
  actor: WorkforceActor,
  run: string | null = null,
) {
  const service = await createServiceRoleClient();
  const { data, error } = await service.rpc("wf_test_run", {
    p_action: action,
    p_actor: actor.user.id,
    p_run: run,
  });
  if (error) throw error;
  return data as TestRun;
}
export async function requestTestRun(request: Request, actor: WorkforceActor) {
  const header = request.headers.get("x-workforce-test-run");
  const cookie = (await cookies()).get(TEST_MODE_COOKIE)?.value;
  if (header && cookie && header !== cookie)
    throw new WorkforceError("جولة الاختبار لا تطابق جلسة المتصفح", 409);
  const raw = header || cookie;
  if (!raw) return null;
  const id = uuid(raw);
  await testRunAction("assert", actor, id);
  return id;
}

/** A test browser may mutate descendants of its own fixtures, never real tasks. */
export async function requireTestTask(
  actor: WorkforceActor,
  run: string | null,
  taskId: string,
) {
  if (!run) return;
  const service = await createServiceRoleClient();
  const { data, error } = await service
    .from("wf_tasks")
    .select("test_run_id")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.test_run_id !== run)
    throw new WorkforceError(
      "هذا السجل حقيقي أو تابع لجولة أخرى. اخرج من وضع الاختبار للتعديل عليه",
      409,
    );
}

import { cookies } from "next/headers";
import {
  apiError,
  assertMutation,
  requireAdmin,
  workforceActor,
} from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";
import { TEST_MODE_COOKIE, testRunAction } from "@/lib/workforce/test-mode";
import { uuid, WorkforceError } from "@/lib/workforce/validation";
export async function GET() {
  try {
    const actor = await workforceActor(),
      id = (await cookies()).get(TEST_MODE_COOKIE)?.value;
    return privateResponse({
      run: id ? await testRunAction("status", actor, uuid(id)) : null,
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    await assertMutation(request);
    const actor = await workforceActor(),
      body = await request.json(),
      jar = await cookies();
    if (body.action === "leave") {
      jar.delete(TEST_MODE_COOKIE);
      return privateResponse({ run: null });
    }
    if (!["start", "join", "finish"].includes(body.action))
      throw new WorkforceError("إجراء غير صحيح");
    if (body.action !== "join") requireAdmin(actor);
    const id =
      body.action === "start"
        ? null
        : uuid(body.run || jar.get(TEST_MODE_COOKIE)?.value);
    const run = await testRunAction(body.action, actor, id);
    if (body.action === "finish") {
      jar.delete(TEST_MODE_COOKIE);
      return privateResponse({ run: null });
    }
    jar.set(TEST_MODE_COOKIE, run.id, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 86400,
    });
    return privateResponse({ run });
  } catch (e) {
    return apiError(e);
  }
}

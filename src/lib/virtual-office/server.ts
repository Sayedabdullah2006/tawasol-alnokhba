import "server-only";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase-server";
import {
  OFFICE_CONTRACT_VERSION,
  OfficeError,
  type OfficeSession,
} from "./domain";
import { runtimeInfo } from "./provider";
import { readHostTeam } from "./host-team";
import { officeActivities } from "./presentation";
import type { SupabaseClient } from "@supabase/supabase-js";

/** The only host-specific seam. Hamza supplies its verified actor/workspace here. */
export const workspaceId = () =>
  process.env.VIRTUAL_OFFICE_WORKSPACE_ID || "nukhba";
export async function officeActor(request?: Request) {
  const db = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new OfficeError("سجل الدخول للمتابعة", 401);
  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin")
    throw new OfficeError("المكتب متاح لإدارة تواصل النخبة", 403);
  if (request && request.method !== "GET") {
    const origin = request.headers.get("origin");
    // Next's internal URL can be localhost behind the hosting reverse proxy.
    // Host is browser-controlled for a same-origin form; never trust a supplied forwarded host.
    if (origin) {
      let sameHost = false;
      try {
        const parsed = new URL(origin);
        sameHost =
          ["http:", "https:"].includes(parsed.protocol) &&
          parsed.host ===
            (request.headers.get("host") || new URL(request.url).host);
      } catch {
        /* Invalid/null origin is not same-origin. */
      }
      if (!sameHost || request.headers.get("sec-fetch-site") === "cross-site")
        throw new OfficeError("مصدر الطلب غير مسموح", 403);
    }
  }
  return { id: user.id, workspaceId: workspaceId(), db };
}
export async function snapshot(hostDb: SupabaseClient) {
  const db = await createServiceRoleClient();
  const [sessions, memories] = await Promise.all([
    db
      .from("vo_sessions")
      .select(
        "id,workspace_id,agent_id,kind,title,brief,status,step,approved_step,progress,error_message,created_at,updated_at,context,input_tokens,output_tokens",
      )
      .eq("workspace_id", workspaceId())
      .order("updated_at", { ascending: false })
      .limit(100),
    db
      .from("vo_memories")
      .select("agent_id,content")
      .eq("workspace_id", workspaceId()),
  ]);
  if (sessions.error || memories.error) throw sessions.error || memories.error;
  const recent = sessions.data as OfficeSession[];
  // Bound the preview read to records from this verified workspace. Full content stays in the conversation.
  const previews = recent.length
    ? await db
        .from("vo_messages")
        .select("id,session_id,agent_id,kind,content,created_at")
        .in(
          "session_id",
          recent.slice(0, 24).map((s) => s.id),
        )
        .neq("kind", "event")
        .order("created_at", { ascending: false })
        .limit(96)
    : { data: [], error: null };
  if (previews.error) throw previews.error;
  let staff: Awaited<ReturnType<typeof readHostTeam>> = [],
    staffAvailable = true;
  try {
    staff = await readHostTeam(hostDb, workspaceId());
  } catch {
    staffAvailable = false;
  }
  return {
    contractVersion: OFFICE_CONTRACT_VERSION,
    sessions: sessions.data as OfficeSession[],
    memories: memories.data,
    runtime: runtimeInfo(),
    staff,
    staffAvailable,
    activities: officeActivities(recent, previews.data || []),
  };
}
export async function sessionMessages(id: string) {
  const db = await createServiceRoleClient();
  const { data: session, error } = await db
    .from("vo_sessions")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspaceId())
    .maybeSingle();
  if (error) throw error;
  if (!session) throw new OfficeError("الجلسة غير متاحة", 404);
  const result = await db
    .from("vo_messages")
    .select("id,session_id,agent_id,kind,content,citations,created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (result.error) throw result.error;
  return result.data.reverse();
}
export function officeResponse(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function officeFailure(error: unknown) {
  if (error instanceof OfficeError)
    return officeResponse({ error: error.message }, error.status);
  if (error instanceof SyntaxError)
    return officeResponse({ error: "صيغة الطلب غير صحيحة" }, 400);
  const e = error as { code?: string; message?: string };
  if (e?.code === "PT409" || e?.code === "PT400")
    return officeResponse({ error: e.message }, e.code === "PT409" ? 409 : 400);
  if (e?.code === "P0002")
    return officeResponse({ error: "الجلسة غير متاحة" }, 404);
  console.error("Virtual office operation failed", {
    code: e?.code || "unknown",
  });
  return officeResponse({ error: "تعذر إتمام العملية؛ أعد المحاولة" }, 503);
}

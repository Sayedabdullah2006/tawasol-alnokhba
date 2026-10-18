import { apiError, workforceActor } from "@/lib/workforce/server";
import { privateResponse, workCommand, workPage, workSearch } from "@/lib/workforce/task-server";

export async function GET(request: Request) {
  try {
    const actor = await workforceActor();
    const params = new URL(request.url).searchParams;
    const { page, from, to } = workPage(params);
    let query = actor.db.from("wf_boards").select("*", { count: "exact" }).order("title").order("id").range(from, to);
    query = params.get("archived") === "true" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
    const search = workSearch(params);
    if (search) query = query.ilike("title", `%${search}%`);
    const { data, error, count } = await query;
    if (error && error.code !== "PGRST103") throw error;
    return privateResponse({ boards: data ?? [], count: count ?? 0, page });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) { return workCommand(request, "board"); }

import {
  apiError,
  createServiceRoleClient,
  workforceActor,
} from "@/lib/workforce/server";
import {
  privateResponse,
  workPage,
  workSearch,
} from "@/lib/workforce/task-server";
import { uuid, WorkforceError } from "@/lib/workforce/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await workforceActor();
    const id = uuid((await params).id);
    const search = new URL(request.url).searchParams;
    const { page, from, to } = workPage(search);
    const task = await actor.db
      .from("wf_tasks")
      .select("id,assignee_id,co_assignee_ids,archived_at,board:wf_boards!inner(archived_at)")
      .eq("id", id)
      .maybeSingle();
    if (task.error) throw task.error;
    if (!task.data) throw new WorkforceError("المهمة غير متاحة", 404);
    const service = await createServiceRoleClient();
    const namesFor = async (ids: string[]) => {
      if (!ids.length) return new Map<string, string>();
      const result = await service
        .from("wf_employees")
        .select("user_id,full_name")
        .in("user_id", [...new Set(ids)]);
      if (result.error) throw result.error;
      return new Map<string, string>(
        result.data.map((row) => [row.user_id, row.full_name]),
      );
    };
    const commentId = search.get("comment_id");
    if (commentId) {
      const comment = await actor.db
        .from("wf_task_comments")
        .select("id")
        .eq("task_id", id)
        .eq("id", uuid(commentId))
        .maybeSingle();
      if (comment.error) throw comment.error;
      if (!comment.data) throw new WorkforceError("التعليق غير متاح", 404);
      const result = await actor.db
        .from("wf_task_comment_revisions")
        .select("version,body,archived,action,changed_by,created_at", {
          count: "exact",
        })
        .eq("comment_id", comment.data.id)
        .order("version", { ascending: false })
        .range(from, to);
      if (result.error && result.error.code !== "PGRST103") throw result.error;
      const names = await namesFor(
        (result.data ?? []).map((row) => row.changed_by),
      );
      return privateResponse({
        revisions: (result.data ?? []).map(({ changed_by, ...row }) => ({
          ...row,
          actorName: names.get(changed_by) ?? "مدير النظام",
        })),
        count: result.count ?? 0,
        page,
      });
    }
    const board = Array.isArray(task.data.board)
      ? task.data.board[0]
      : task.data.board;
    const writable =
      !task.data.archived_at &&
      !board?.archived_at &&
      (actor.role === "admin" ||
        task.data.assignee_id === actor.employee?.id || task.data.co_assignee_ids.includes(actor.employee?.id ?? ""));
    let query = actor.db
      .from("wf_task_comments")
      .select("id,body,version,author_id,created_at,edited_at,archived_at", {
        count: "exact",
      })
      .eq("task_id", id)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to);
    query =
      search.get("archived") === "true"
        ? query.not("archived_at", "is", null)
        : query.is("archived_at", null);
    const q = workSearch(search);
    if (q) query = query.ilike("body", `%${q}%`);
    const result = await query;
    if (result.error && result.error.code !== "PGRST103") throw result.error;
    const names = await namesFor(
      (result.data ?? []).map((row) => row.author_id),
    );
    return privateResponse({
      comments: (result.data ?? []).map(({ author_id, ...row }) => ({
        ...row,
        authorName: names.get(author_id) ?? "مدير النظام",
        canEdit: writable && author_id === actor.user.id && !row.archived_at,
        canArchive:
          writable && (actor.role === "admin" || author_id === actor.user.id),
      })),
      canComment: writable,
      count: result.count ?? 0,
      page,
    });
  } catch (error) {
    return apiError(error);
  }
}

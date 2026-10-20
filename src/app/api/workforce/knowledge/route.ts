import {
  apiError,
  assertMutation,
  createServiceRoleClient,
  workforceActor,
} from "@/lib/workforce/server";
import {
  privateResponse,
  workPage,
  workSearch,
} from "@/lib/workforce/task-server";
import {
  textField,
  uuid,
  WorkforceError,
  dateField,
} from "@/lib/workforce/validation";
import { attachmentForm } from "@/lib/workforce/attachment-server";
import { validateKnowledgeUpload } from "@/lib/workforce/knowledge-upload-server";
import { MAX_KNOWLEDGE_BYTES } from "@/lib/workforce/knowledge";
import type { KnowledgeFile } from "@/lib/workforce/knowledge";
import { knowledgeFolderCounts } from "@/lib/workforce/knowledge-folder-counts";
import { knowledgeNotificationOptions } from "@/lib/workforce/knowledge-notifications";
type KnowledgeRow = Omit<
  KnowledgeFile,
  "uploaderName" | "taskId" | "canManage" | "canTrash" | "sealed"
> & {
  attachment: null | {
    task_id: string;
    links: { submission_id: string }[];
    task: {
      assignee_id: string | null;
      co_assignee_ids: string[];
      archived_at: string | null;
      column: { kind: string };
      board: { archived_at: string | null };
    };
  };
};

export async function GET(request: Request) {
  try {
    const actor = await workforceActor(),
      params = new URL(request.url).searchParams,
      { page, from, to } = workPage(params);
    const folders = await actor.db
      .from("wf_knowledge_folders")
      .select("id,parent_id,name,system_key,version")
      .order("name");
    if (folders.error) throw folders.error;
    const folder = params.get("folder"),
      search = workSearch(params),
      trash = params.get("trash") === "true";
    if (folder && !folders.data.some((f) => f.id === uuid(folder)))
      throw new WorkforceError("المجلد غير متاح", 404);
    let query = actor.db
      .from("wf_knowledge_files")
      .select(
        "id,folder_id,title,filename,mime_type,size_bytes,created_at,created_by,deleted_at,version,task_attachment_id,attachment:wf_task_attachments(task_id,task:wf_tasks(assignee_id,co_assignee_ids,archived_at,column:wf_task_columns(kind),board:wf_boards(archived_at)),links:wf_submission_attachments(submission_id))",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to);
    query = trash
      ? query.not("deleted_at", "is", null)
      : query.is("deleted_at", null);
    const filtered =
      !!search || ["uploader", "from", "to"].some((key) => params.get(key));
    if (folder) {
      const ids = new Set([folder]);
      if (filtered) {
        let added = true;
        while (added) {
          added = false;
          for (const f of folders.data) {
            if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) {
              ids.add(f.id);
              added = true;
            }
          }
        }
      }
      query = query.in("folder_id", [...ids]);
    } else if (!filtered && !trash && params.get("all") !== "true")
      query = query.eq("folder_id", "00000000-0000-0000-0000-000000000000");
    if (search)
      query = query.or(`title.ilike.%${search}%,filename.ilike.%${search}%`);
    if (params.get("file")) query = query.eq("id", uuid(params.get("file")));
    if (params.get("uploader"))
      query = query.eq("created_by", uuid(params.get("uploader")));
    for (const [name, method] of [
      ["from", "gte"],
      ["to", "lte"],
    ] as const) {
      const day = dateField(params.get(name), true);
      if (day)
        query = query[method](
          "created_at",
          `${day}T${method === "gte" ? "00:00:00" : "23:59:59.999"}+03:00`,
        );
    }
    const result = await query.overrideTypes<
      KnowledgeRow[],
      { merge: false }
    >();
    if (result.error) throw result.error;
    const countedFolders = await knowledgeFolderCounts(folders.data, (start, end) =>
      actor.db.from("wf_knowledge_files")
        .select("folder_id", { count: "exact" })
        .is("deleted_at", null)
        .order("id")
        .range(start, end),
    );
    const service = await createServiceRoleClient();
    const [staff, admins] = await Promise.all([
      service
        .from("wf_employees")
        .select("user_id,full_name")
        .eq("status", "active")
        .order("full_name"),
      service.from("wf_task_assignment_admins").select("user_id,display_name"),
    ]);
    if (staff.error) throw staff.error;
    if (admins.error) throw admins.error;
    const identities = [
      ...staff.data.map((e) => ({ id: e.user_id, full_name: e.full_name })),
      ...admins.data.map((a) => ({ id: a.user_id, full_name: a.display_name })),
    ];
    const names = new Map(identities.map((p) => [p.id, p.full_name]));
    return privateResponse({
      folders: countedFolders,
      files: (result.data || []).map(({ attachment, ...file }) => {
        const manage =
          actor.role === "admin" || file.created_by === actor.user.id;
        const task = attachment?.task,
          sealed = !!attachment?.links.length;
        const sourceEditable =
          !task ||
          (!task.archived_at &&
            !task.board?.archived_at &&
            !["review", "done"].includes(task.column?.kind || "") &&
            (actor.role === "admin" ||
              task.assignee_id === actor.employee?.id || task.co_assignee_ids.includes(actor.employee?.id ?? "")));
        return {
          ...file,
          uploaderName: names.get(file.created_by) || "عضو الفريق",
          taskId: attachment?.task_id || null,
          canManage: manage,
          canTrash: manage && !sealed && sourceEditable,
          sealed,
        };
      }),
      uploaders: identities,
      notificationRecipients: staff.data.map(e => ({id: e.user_id, full_name: e.full_name})),
      count: result.count || 0,
      page,
      admin: actor.role === "admin",
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  let path: string | undefined, id: string | undefined;
  try {
    assertMutation(request);
    const actor = await workforceActor(),
      form = await attachmentForm(request, MAX_KNOWLEDGE_BYTES);
    const notification = knowledgeNotificationOptions(form);
    id = uuid(form.get("request_key"));
    const folder = uuid(form.get("folder_id")),
      file = form.get("file");
    if (!(file instanceof File)) throw new WorkforceError("اختر ملفًا");
    const checked = await validateKnowledgeUpload(file),
      title = textField(
        form.get("title") || checked.filename,
        "العنوان",
        1,
        250,
      ),
      service = await createServiceRoleClient();
    if (notification.recipients.length) {
      const recipients = await service.from("wf_employees").select("user_id")
        .eq("status", "active").in("user_id", notification.recipients);
      if (recipients.error) throw recipients.error;
      if (recipients.data.length !== notification.recipients.length)
        throw new WorkforceError("إحدى المستلمات غير متاحة");
    }
    const permitted = await actor.db
      .from("wf_knowledge_folders")
      .select("id")
      .eq("id", folder)
      .maybeSingle();
    if (permitted.error) throw permitted.error;
    if (!permitted.data) throw new WorkforceError("المجلد غير متاح", 404);
    const prior = await service
      .from("wf_knowledge_files")
      .select(
        "id,folder_id,created_by,sha256,filename,title,task_attachment_id",
      )
      .eq("id", id)
      .maybeSingle();
    if (prior.error) throw prior.error;
    if (prior.data) {
      const p = prior.data;
      if (
        p.created_by !== actor.user.id ||
        p.folder_id !== folder ||
        p.sha256 !== checked.sha256 ||
        p.filename !== checked.filename ||
        p.title !== title ||
        p.task_attachment_id
      )
        throw new WorkforceError("مفتاح الرفع مستخدم لملف آخر", 409);
      const notice = await service.rpc("wf_knowledge_file_notify", {
        p_actor: actor.user.id, p_file: id,
        p_recipients: notification.recipients, p_message: notification.message,
      });
      if (notice.error) throw notice.error;
      return privateResponse({ id });
    }
    path = `${actor.user.id}/${id}/${crypto.randomUUID()}`;
    const upload = await service.storage
      .from("workforce-knowledge-files")
      .upload(path, checked.bytes, {
        contentType: checked.mime,
        upsert: false,
      });
    if (upload.error) throw upload.error;
    const result = await service.rpc("wf_knowledge_file_create_notified", {
      p_actor: actor.user.id,
      p_id: id,
      p_folder: folder,
      p_title: title,
      p_filename: checked.filename,
      p_mime: checked.mime,
      p_size: file.size,
      p_path: path,
      p_sha256: checked.sha256,
      p_recipients: notification.recipients,
      p_message: notification.message,
    });
    const verified = await service
      .from("wf_knowledge_files")
      .select("object_path")
      .eq("id", id)
      .maybeSingle();
    if (!verified.error && verified.data?.object_path !== path)
      await service.storage.from("workforce-knowledge-files").remove([path]);
    path = undefined;
    if (result.error) throw result.error;
    return privateResponse({ id }, 201);
  } catch (error) {
    if (path && id) {
      const service = await createServiceRoleClient(),
        check = await service
          .from("wf_knowledge_files")
          .select("object_path")
          .eq("id", id)
          .maybeSingle();
      if (!check.error && check.data?.object_path !== path)
        await service.storage.from("workforce-knowledge-files").remove([path]);
    }
    return apiError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    assertMutation(request);
    const actor = await workforceActor(),
      body = await request.json();
    if (
      !body ||
      Object.keys(body).some(
        (k) => !["id", "command", "version", "payload"].includes(k),
      ) ||
      !body.payload ||
      typeof body.payload !== "object" ||
      Array.isArray(body.payload) ||
      JSON.stringify(body.payload).length > 4000
    )
      throw new WorkforceError("بيانات الإجراء غير صحيحة");
    const command = textField(body.command, "الإجراء", 1, 40);
    if (
      command !== "folder_create" &&
      (!Number.isSafeInteger(body.version) || body.version < 1)
    )
      throw new WorkforceError("حدّث الصفحة قبل الحفظ", 409);
    const service = await createServiceRoleClient(),
      result = await service.rpc("wf_knowledge_command", {
        p_actor: actor.user.id,
        p_id: uuid(body.id),
        p_version: body.version ?? null,
        p_command: command,
        p_payload: body.payload,
      });
    if (result.error) throw result.error;
    return privateResponse(result.data);
  } catch (error) {
    return apiError(error);
  }
}

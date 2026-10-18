import { createHash, randomUUID } from "node:crypto";
import {
  apiError,
  assertMutation,
  workforceActor,
  createServiceRoleClient,
} from "@/lib/workforce/server";
import {
  uuid,
  textField,
  dateField,
  WorkforceError,
} from "@/lib/workforce/validation";
import {
  attachmentForm,
  validateAttachment,
  ATTACHMENT_BUCKET,
} from "@/lib/workforce/attachment-server";
import {
  REQUEST_KINDS,
  REQUEST_STATUS,
  datedRequest,
  moneyRequest,
} from "@/lib/workforce/requests";
import { workPage, privateResponse } from "@/lib/workforce/task-server";
export async function GET(request: Request) {
  try {
    const actor = await workforceActor(),
      params = new URL(request.url).searchParams,
      { page, from, to } = workPage(params);
    let query = actor.db
      .from("wf_employee_requests")
      .select(
        "id,employee_id,kind,title,body,starts_at,ends_at,amount,attendance_session_id,leave_type,attachments,status,decision_reason,decided_at,created_at,version",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to);
    const status = params.get("status"),
      kind = params.get("kind"),
      id = params.get("request");
    if (status) {
      if (!Object.hasOwn(REQUEST_STATUS, status))
        throw new WorkforceError("حالة غير صحيحة");
      query = query.eq("status", status);
    }
    if (kind) {
      if (!Object.hasOwn(REQUEST_KINDS, kind))
        throw new WorkforceError("نوع غير صحيح");
      query = query.eq("kind", kind);
    }
    if (id) query = query.eq("id", uuid(id));
    const { data, error, count } = await query;
    if (error && error.code !== "PGRST103") throw error;
    const service = await createServiceRoleClient(),
      ids = [...new Set((data || []).map((row) => row.employee_id))];
    const names =
      actor.role === "admin" && ids.length
        ? await service
            .from("wf_employees")
            .select("id,full_name")
            .in("id", ids)
        : { data: [], error: null };
    if (names.error) throw names.error;
    return privateResponse({
      requests: (data || []).map(({ attachments, ...row }) => ({
        ...row,
        attachments: attachments.map((file: Record<string, unknown>) => ({
          id: file.id,
          filename: file.filename,
          mime_type: file.mime_type,
          size_bytes: file.size_bytes,
        })),
        employeeName: names.data?.find((name) => name.id === row.employee_id)
          ?.full_name,
      })),
      count: count || 0,
      page,
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertMutation(request);
    const actor = await workforceActor();
    if (!actor.employee)
      throw new WorkforceError("هذا الإجراء للموظفة فقط", 403);
    const form = await attachmentForm(request, 20 * 1024 * 1024),
      id = uuid(form.get("request_key")),
      kind = textField(form.get("kind"), "نوع الطلب", 1, 40);
    if (!Object.hasOwn(REQUEST_KINDS, kind))
      throw new WorkforceError("نوع طلب غير صحيح");
    const attendance_session_id = form.get("attendance_session_id")
      ? uuid(form.get("attendance_session_id"))
      : null;
    if (attendance_session_id) {
      const record = await actor.db
        .from("wf_attendance_sessions")
        .select("id")
        .eq("id", attendance_session_id)
        .eq("employee_id", actor.employee.id)
        .maybeSingle();
      if (record.error) throw record.error;
      if (!record.data) throw new WorkforceError("سجل الحضور غير متاح", 404);
    }
    const leave_type = form.get("leave_type") || "paid";
    if (!["paid", "unpaid"].includes(String(leave_type)))
      throw new WorkforceError("نوع الإجازة غير صحيح");
    const title = textField(form.get("title"), "العنوان", 3, 150),
      body = textField(form.get("body"), "التفاصيل", 3, 10000);
    const date = (key: string) => {
      const value = form.get(key);
      if (!value) return null;
      if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(
          value,
        ) ||
        !Number.isFinite(Date.parse(value))
      )
        throw new WorkforceError("التاريخ أو الوقت غير صحيح");
      dateField(value.slice(0, 10));
      return new Date(value).toISOString();
    };
    const starts_at = date("starts_at"),
      ends_at = date("ends_at");
    if (datedRequest(kind) && (!starts_at || !ends_at))
      throw new WorkforceError("حدد بداية الفترة ونهايتها");
    if (ends_at && (!starts_at || ends_at < starts_at))
      throw new WorkforceError("نهاية الفترة تسبق بدايتها");
    const rawAmount = form.get("amount");
    let amount: string | null = null;
    if (rawAmount) {
      if (
        typeof rawAmount !== "string" ||
        !/^\d{1,9}(?:\.\d{1,2})?$/.test(rawAmount) ||
        Number(rawAmount) <= 0 ||
        Number(rawAmount) > 100000000
      )
        throw new WorkforceError("المبلغ غير صحيح");
      amount = Number(rawAmount).toFixed(2);
    }
    if (moneyRequest(kind) && !amount) throw new WorkforceError("أدخل المبلغ");
    const files = form
      .getAll("files")
      .filter((file): file is File => file instanceof File && file.size > 0);
    if (files.length > 5) throw new WorkforceError("الحد الأقصى خمسة مرفقات");
    const checked = await Promise.all(files.map(validateAttachment));
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          kind,
          attendance_session_id,
          leave_type,
          title,
          body,
          starts_at,
          ends_at,
          amount,
          files: checked.map((file) => [file.filename, file.sha256]),
        }),
      )
      .digest("hex");
    const service = await createServiceRoleClient();
    const previous = await service
      .from("wf_employee_requests")
      .select("id,employee_id,fingerprint")
      .eq("id", id)
      .maybeSingle();
    if (previous.error) throw previous.error;
    if (previous.data) {
      if (
        previous.data.employee_id !== actor.employee.id ||
        previous.data.fingerprint !== fingerprint
      )
        throw new WorkforceError("مفتاح الطلب مستخدم لبيانات أخرى", 409);
      return Response.json({ id });
    }
    const attachments = checked.map((file) => {
      const fileId = randomUUID();
      return {
        id: fileId,
        filename: file.filename,
        mime_type: file.mime,
        size_bytes: file.bytes.length,
        object_path: `requests/${id}/${fileId}`,
      };
    });
    const uploaded: string[] = [];
    try {
      for (let index = 0; index < checked.length; index++) {
        const file = checked[index],
          attachment = attachments[index];
        const result = await service.storage
          .from(ATTACHMENT_BUCKET)
          .upload(attachment.object_path, file.bytes, {
            contentType: file.mime,
            upsert: false,
          });
        if (result.error) throw result.error;
        uploaded.push(attachment.object_path);
      }
      // Recheck active employment before writing after uploads.
      const active = await service
        .from("wf_employees")
        .select("id")
        .eq("id", actor.employee.id)
        .eq("status", "active")
        .single();
      if (active.error) throw new WorkforceError("الحساب غير نشط", 403);
      const result = await service.from("wf_employee_requests").insert({
        id,
        employee_id: actor.employee.id,
        kind,
        title,
        body,
        starts_at,
        ends_at,
        amount,
        attendance_session_id,
        leave_type,
        attachments,
        fingerprint,
      });
      if (result.error) throw result.error;
    } catch (e) {
      if (uploaded.length)
        await service.storage.from(ATTACHMENT_BUCKET).remove(uploaded);
      throw e;
    }
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(request: Request) {
  try {
    assertMutation(request);
    const actor = await workforceActor(),
      body = await request.json(),
      id = uuid(body.id);
    if (!Number.isInteger(body.version) || body.version < 1)
      throw new WorkforceError("نسخة الطلب غير صحيحة");
    const decision = textField(body.decision, "القرار", 1, 20);
    if (!["approved", "rejected", "cancelled"].includes(decision))
      throw new WorkforceError("قرار غير صحيح");
    if (actor.role !== "admin" && decision !== "cancelled")
      throw new WorkforceError("القرار للإدارة فقط", 403);
    const visible = await actor.db
      .from("wf_employee_requests")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (visible.error) throw visible.error;
    if (!visible.data) throw new WorkforceError("الطلب غير متاح", 404);
    const reason =
      decision === "cancelled"
        ? "ألغت الموظفة الطلب"
        : textField(body.reason, "سبب القرار", 3, 2000);
    const service = await createServiceRoleClient(),
      result = await service.rpc("wf_decide_employee_request", {
        p_id: id,
        p_actor: actor.user.id,
        p_version: body.version,
        p_decision: decision,
        p_reason: reason,
      });
    if (result.error) throw result.error;
    return Response.json({ id });
  } catch (e) {
    return apiError(e);
  }
}

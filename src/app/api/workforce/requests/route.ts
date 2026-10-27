import { requireMedicalReport } from "@/lib/workforce/sick-leave";
import { requireUnpaidLeaveAcknowledgment,unpaidLeaveDates } from '@/lib/workforce/unpaid-leave';
import { OFF_DUTY_REQUESTS } from "@/lib/workforce/action-access";
import { requireWorkingAttendance } from "@/lib/workforce/server";
import { missingHoursInput } from "@/lib/workforce/missing-hours";
import { requestTestRun } from "@/lib/workforce/test-mode";
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
        "id,employee_id,kind,title,body,starts_at,ends_at,work_day,missing_minutes,amount,overtime_details,expense_details,attendance_session_id,leave_type,attachments,status,decision_reason,decided_at,created_at,version",
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
    const estimates=await Promise.all((data||[]).filter(row=>row.kind==='leave'&&row.leave_type==='unpaid').map(async row=>{
      const quote=await service.rpc('wf_unpaid_leave_estimate',{p_actor:actor.user.id,p_request:row.id});
      return {id:row.id,...(quote.error?{unpaid_estimate_error:'تعذر احتساب الخصم؛ راجع إعدادات الراتب'}:{unpaid_estimate:quote.data})};
    }));
    return privateResponse({
      requests: (data || []).map(({ attachments, ...row }) => ({
        ...row,
        ...estimates.find(estimate=>estimate.id===row.id),
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
    await assertMutation(request);
    const actor = await workforceActor();
    if (!actor.employee)
      throw new WorkforceError("هذا الإجراء للموظفة فقط", 403);
    const testRun = await requestTestRun(request, actor);
    const form = await attachmentForm(request, 20 * 1024 * 1024),
      id = uuid(form.get("request_key")),
      kind = textField(form.get("kind"), "نوع الطلب", 1, 40);
    if (testRun && !["general","overtime","expenses"].includes(kind))
      throw new WorkforceError("اختر طلبًا إداريًا أثناء الاختبار", 400);
    if (!Object.hasOwn(REQUEST_KINDS, kind))
      throw new WorkforceError("نوع طلب غير صحيح");
    if (!OFF_DUTY_REQUESTS.has(kind)) await requireWorkingAttendance(actor);
    const credit=kind==='missing-hours'?missingHoursInput(form.get('work_day'),form.get('hours')):{work_day:null,missing_minutes:null};
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
    if (!["paid", "unpaid", "sick"].includes(String(leave_type)))
      throw new WorkforceError("نوع الإجازة غير صحيح");
    try { requireUnpaidLeaveAcknowledgment(kind,String(leave_type),form.get('unpaid_leave_ack')); } catch(e) { throw new WorkforceError((e as Error).message); }
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
    if(kind==='leave'&&leave_type==='unpaid'){
      const quote=await (await createServiceRoleClient()).rpc('wf_unpaid_leave_estimate',{p_actor:actor.user.id,...unpaidLeaveDates(starts_at!,ends_at!)});
      if(quote.error)throw quote.error;
    }
    const rawAmount = form.get("amount");
    if(kind==="overtime"&&rawAmount)throw new WorkforceError("قيمة خارج الدوام تُحسب تلقائيًا");
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
    if(kind==='expenses'&&!checked.some(file=>['application/pdf','image/png','image/jpeg','image/webp'].includes(file.mime)))
      throw new WorkforceError("أرفق فاتورة المصروف بصيغة PDF أو صورة");
    try { requireMedicalReport(kind,String(leave_type),checked); } catch (e) { throw new WorkforceError((e as Error).message); }
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          kind,
          ...credit,
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
      .select("id,employee_id,fingerprint,test_run_id")
      .eq("id", id)
      .maybeSingle();
    if (previous.error) throw previous.error;
    if (previous.data) {
      if (
        previous.data.employee_id !== actor.employee.id ||
        (testRun !== null && previous.data.test_run_id !== testRun) ||
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
        sha256: file.sha256,
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
        test_run_id: testRun,
        kind,
        title,
        ...credit,
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
    await assertMutation(request);
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
    const testRun = await requestTestRun(request, actor);
    const visible = await actor.db
      .from("wf_employee_requests")
      .select("id,test_run_id,kind,leave_type")
      .eq("id", id)
      .maybeSingle();
    if (visible.error) throw visible.error;
    if (!visible.data) throw new WorkforceError("الطلب غير متاح", 404);
    if (!OFF_DUTY_REQUESTS.has(visible.data.kind)) await requireWorkingAttendance(actor);
    if (testRun && visible.data.test_run_id !== testRun)
      throw new WorkforceError(
        "هذا الطلب حقيقي. اخرج من وضع الاختبار للتعديل عليه",
        409,
      );
    const reason =
      decision === "cancelled"
        ? "ألغت الموظفة الطلب"
        : textField(body.reason, "سبب القرار", 3, 2000);
    const service = await createServiceRoleClient();
    if(visible.data.kind==='leave'&&visible.data.leave_type==='unpaid'&&decision==='approved'){
      const quote=await service.rpc('wf_unpaid_leave_estimate',{p_actor:actor.user.id,p_request:id});if(quote.error)throw quote.error;
    }
    // Verify legacy invoice bytes from private storage before first approval.
    // New uploads already carry a server-computed hash; never trust client hashes.
    if(visible.data.kind==='expenses'&&decision==='approved'){
      const legacy=await service.from('wf_employee_requests').select('attachments,status,version').eq('id',id).single();
      if(legacy.error)throw legacy.error;
      if(legacy.data.status!=='pending'||legacy.data.version!==body.version)throw new WorkforceError('تمت معالجة الطلب؛ حدّث القائمة',409);
      const attachments=legacy.data.attachments as {id:string;filename:string;mime_type:string;size_bytes:number;object_path:string;sha256?:string}[];
      if(attachments.some(file=>!file.sha256)){
        for(const file of attachments){
          if(file.sha256)continue;
          if(!file.object_path.startsWith(`requests/${id}/`))throw new WorkforceError('الفاتورة غير متاحة',409);
          const stored=await service.storage.from(ATTACHMENT_BUCKET).download(file.object_path);
          if(stored.error||!stored.data)throw new WorkforceError('تعذر التحقق من الفاتورة',409);
          file.sha256=createHash('sha256').update(Buffer.from(await stored.data.arrayBuffer())).digest('hex');
        }
        const verified=await service.from('wf_employee_requests').update({attachments}).eq('id',id).eq('status','pending').eq('version',body.version).select('id').maybeSingle();
        if(verified.error)throw verified.error;
        if(!verified.data)throw new WorkforceError('تغير الطلب؛ حدّث القائمة',409);
      }
    }
    let result;
    if(visible.data.kind==="overtime"&&decision==="approved"){
      const period=(value:unknown)=>{
        if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw new WorkforceError("فترة خارج الدوام غير صحيحة");
        dateField(value.slice(0,10));return new Date(value).toISOString();
      };
      result=await service.rpc("wf_decide_overtime_request",{p_id:id,p_actor:actor.user.id,p_version:body.version,p_reason:reason,p_starts:period(body.starts_at),p_ends:period(body.ends_at)});
    }else result = await service.rpc("wf_decide_employee_request", {
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

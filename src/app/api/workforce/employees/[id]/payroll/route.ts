import {
  apiError,
  assertMutation,
  createServiceRoleClient,
  requireAdmin,
  requireEmployeeAccess,
  workforceActor,
} from "@/lib/workforce/server";
import { privateResponse } from "@/lib/workforce/task-server";
import { fixedCompensation } from "@/lib/workforce/compensation";
import {
  fromCents,
  moneyCents,
  moneyValue,
  payrollInput,
  payrollMonth,
} from "@/lib/workforce/payroll";
import { textField, uuid, WorkforceError } from "@/lib/workforce/validation";
import {attendancePayrollSnapshot} from "@/lib/workforce/payroll-server";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const actor = await workforceActor(),
      id = uuid((await context.params).id);
    requireEmployeeAccess(actor, id);
    const params = new URL(request.url).searchParams;
    if (params.get("history") === "true") {
      const page = Number(params.get("page") || 1);
      if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
        throw new WorkforceError("رقم الصفحة غير صحيح");
      const result = await actor.db.from("wf_monthly_payroll")
        .select("id,month,status,total_amount,paid_amount", { count: "exact" })
        .eq("employee_id", id).order("month", { ascending: false }).order("id")
        .range((page - 1) * 20, page * 20 - 1);
      if (result.error) throw result.error;
      const rows=await Promise.all((result.data??[]).map(async row=>{
        const snapshot=await attendancePayrollSnapshot(actor,id,row.month);
        return snapshot.statement?{id:row.id,month:row.month,status:snapshot.statement.status,total_amount:snapshot.statement.total_amount,paid_amount:snapshot.statement.paid_amount}:row;
      }));
      return privateResponse({ rows, count: result.count, page });
    }
    const month = payrollMonth(params.get("month"));
    const end = new Date(`${month}T12:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    const [employee, statement, terms] = await Promise.all([
      actor.db
        .from("wf_employees")
        .select("id,full_name,start_date,employment_ends_on")
        .eq("id", id)
        .maybeSingle(),
      attendancePayrollSnapshot(actor,id,month).then(value=>({data:value.statement,error:null,attendance:value.attendance})),
      actor.db
        .from("wf_compensation_versions")
        .select("basic_salary,allowances,effective_from")
        .eq("employee_id", id)
        .lte("effective_from", end.toISOString().slice(0, 10))
        .order("effective_from", { ascending: false })
        .order("revision", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    for (const result of [employee, statement, terms])
      if (result.error) throw result.error;
    if (!employee.data) throw new WorkforceError("الموظفة غير متاحة", 404);
    const result = statement.data;
    const [payments, events] = result
      ? await Promise.all([
          actor.db
            .from("wf_payroll_payments")
            .select("id,amount,reference,created_at", { count: "exact" })
            .eq("payroll_id", result.id)
            .order("created_at", { ascending: false })
            .order("id")
            .limit(20),
          actor.db
            .from("wf_payroll_events")
            .select("id,action,reason,created_at", { count: "exact" })
            .eq("payroll_id", result.id)
            .order("created_at", { ascending: false })
            .order("id")
            .limit(20),
        ])
      : [
          { data: [], count: 0, error: null },
          { data: [], count: 0, error: null },
        ];
    if (payments.error || events.error) throw payments.error || events.error;
    const defaults = terms.data
      ? {
          basic_amount: String(terms.data.basic_salary),
          allowances_amount: fromCents(
            moneyCents(
              fixedCompensation({
                basic_salary: String(terms.data.basic_salary),
                allowances: terms.data.allowances,
              }),
            ) - moneyCents(String(terms.data.basic_salary)),
          ),
          effective_from: terms.data.effective_from,
        }
      : null;
    return privateResponse({
      employee: employee.data,
      month,
      statement: result
        ? {
            ...result,
            basic_amount: String(result.basic_amount),
            allowances_amount: String(result.allowances_amount),
            total_amount: String(result.total_amount),
            gross_amount: String(result.gross_amount),
            deductions_amount: String(result.deductions_amount),
            paid_amount: String(result.paid_amount),
          }
        : null,
      defaults: employee.data.employment_ends_on&&month>=employee.data.employment_ends_on.slice(0,7)+"-01" ? (result?{basic_amount:String(result.basic_amount),allowances_amount:String(result.allowances_amount),effective_from:employee.data.employment_ends_on}:null):defaults,
      attendance: statement.attendance,
      payments: payments.data?.map((row) => ({
        ...row,
        amount: String(row.amount),
      })),
      payments_count: payments.count,
      events: events.data,
      events_count: events.count,
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    await assertMutation(request);
    const actor = await workforceActor();
    requireAdmin(actor);
    const employee = uuid((await context.params).id),
      body = await request.json();
    if (
      !body ||
      !Number.isSafeInteger(body.version) ||
      body.version < 0 ||
      body.version > 2147483647 ||
      !["save", "approve", "reopen", "pay"].includes(body.command)
    )
      throw new WorkforceError("إجراء الكشف غير صحيح");
    let payload;
    if (body.command === "save") payload = payrollInput(body.payload);
    else {
      if (
        !body.payload ||
        typeof body.payload !== "object" ||
        Array.isArray(body.payload) ||
        Object.keys(body.payload).some(
          (key) =>
            !(
              body.command === "pay"
                ? ["reason", "amount", "reference"]
                : ["reason"]
            ).includes(key),
        )
      )
        throw new WorkforceError("بيانات الإجراء غير صحيحة");
      payload = {
        reason: textField(body.payload.reason, "سبب الإجراء", 3, 2000),
        ...(body.command === "pay"
          ? {
              amount: moneyValue(body.payload.amount),
              reference: textField(
                body.payload.reference,
                "مرجع الصرف",
                3,
                500,
              ),
            }
          : {}),
      };
    }
    const service = await createServiceRoleClient();
    const { data, error } = await service.rpc("wf_payroll_command", {
      p_actor: actor.user.id,
      p_id: uuid(body.id),
      p_employee: employee,
      p_month: payrollMonth(body.month),
      p_version: body.version,
      p_command: body.command,
      p_payload: payload,
      p_key: uuid(body.request_key),
    });
    if (error) throw error;
    return privateResponse(data);
  } catch (error) {
    return apiError(error);
  }
}

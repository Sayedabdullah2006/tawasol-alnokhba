import {apiError,createServiceRoleClient,workforceActor} from "@/lib/workforce/server";
import {privateResponse} from "@/lib/workforce/task-server";
import {uuid,WorkforceError} from "@/lib/workforce/validation";
import {attendanceMonth,employeeMonthAttendance} from "@/lib/workforce/attendance-server";
import {attendancePayrollSnapshot} from "@/lib/workforce/payroll-server";
import {requireWorkSummaryAccess,employeeLeaveBalance} from "@/lib/workforce/summary-server";
export async function GET(request:Request){try{
 const actor=await workforceActor(),params=new URL(request.url).searchParams,id=uuid(params.get("employee_id")),month=attendanceMonth(params.get("month"));
 requireWorkSummaryAccess(actor,id);
 const db=await createServiceRoleClient();const employee=await db.from("wf_employees").select("id,full_name,start_date,status").eq("id",id).maybeSingle();
 if(employee.error)throw employee.error;if(!employee.data||actor.role!=="admin"&&id!==actor.employee?.id&&employee.data.status!=="active")throw new WorkforceError("الملخص غير متاح",404);
 const [attendance,payroll,leave]=await Promise.all([employeeMonthAttendance(db,id,employee.data.start_date,month,new Date(),actor),attendancePayrollSnapshot(actor,id,`${month}-01`,true),employeeLeaveBalance(actor,id)]);
 const s=payroll.statement,a=attendance.open;
 return privateResponse({employee:{id,full_name:employee.data.full_name},summary:attendance.summary,
  open:a?{meeting_id:a.meeting_id,meeting_until:a.meeting_until,overtime_request_id:a.overtime_request_id,checked_in:a.checked_in,checked_out:a.checked_out,policy_version:a.policy_version,cutoff_at:a.cutoff_at,last_seen_at:a.last_seen_at,next_confirmation_at:a.next_confirmation_at,break_started_at:a.break_started_at,break_paid_until:a.break_paid_until,unpaid_periods:a.unpaid_periods}:null,
  payroll:s?{month:s.month,status:s.status,total_amount:s.total_amount,paid_amount:s.paid_amount,gross_amount:s.gross_amount,basic_amount:s.basic_amount,allowances_amount:s.allowances_amount,attendance_amount:s.attendance_amount,attendance_details:s.attendance_details,insurance_details:s.insurance_details,daily_accrual:s.daily_accrual,overtime_amount:String(s.overtime_amount??0),reimbursement_amount:String(s.reimbursement_amount??0),deductions:s.deductions.map(d=>({kind:d.kind,amount:d.amount}))}:null,leave});
 }catch(error){return apiError(error);}}

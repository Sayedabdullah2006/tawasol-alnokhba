import "server-only";
import {createServiceRoleClient,requireEmployeeAccess,type WorkforceActor} from "./server";
import type {PayrollStatement} from "./payroll";
import type {AttendanceSettlement} from "./payroll-attendance";

export async function attendancePayrollSnapshot(actor:WorkforceActor,employeeId:string,month:string) {
 requireEmployeeAccess(actor,employeeId);
 const service=await createServiceRoleClient();
 const {data,error}=await service.rpc("wf_attendance_payroll_snapshot",{p_actor:actor.user.id,p_employee:employeeId,p_month:month});
 if(error)throw error;
 const value=data as {statement:(PayrollStatement&{attendance_amount:string;attendance_details:AttendanceSettlement})|null;attendance:AttendanceSettlement};
 if(value.statement) for(const key of ["basic_amount","allowances_amount","total_amount","gross_amount","deductions_amount","paid_amount","attendance_amount"] as const) value.statement[key]=String(value.statement[key]);
 return value;
}

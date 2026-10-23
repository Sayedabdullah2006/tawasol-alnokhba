import "server-only";
import {createServiceRoleClient,type WorkforceActor} from "./server";
import {WorkforceError} from "./validation";
import type {LeaveBalance} from "./leave";
export function requireWorkSummaryAccess(actor:WorkforceActor,id:string){
 if(actor.role!=="admin"&&actor.employee?.id!==id&&actor.employee?.can_view_team_summaries!==true)throw new WorkforceError("الملخص غير متاح",404);
}
export async function employeeLeaveBalance(actor:WorkforceActor,id:string){
 requireWorkSummaryAccess(actor,id);const service=await createServiceRoleClient();
 const {data,error}=await service.rpc("wf_leave_balance",{p_actor:actor.user.id,p_employee:id});if(error)throw error;return data as LeaveBalance;
}

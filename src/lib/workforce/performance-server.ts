import "server-only";
import {requireEmployeeAccess,createServiceRoleClient,type WorkforceActor} from "./server";
import {performanceFacts,evaluatePerformance,type PerformanceEvidence} from "./performance";
export async function employeePerformance(actor:WorkforceActor,employeeId:string,month:string,now=new Date()){
 requireEmployeeAccess(actor,employeeId);
 const [year,number]=month.split('-').map(Number),asOf=new Date(Math.min(now.getTime(),Date.UTC(year,number,1)-3*3600000-1));
 const service=await createServiceRoleClient();
 const {data,error}=await service.rpc("wf_performance_evidence",{p_actor:actor.user.id,p_employee:employeeId,p_asof:asOf.toISOString()});
 if(error)throw error;
 return evaluatePerformance(performanceFacts(data as PerformanceEvidence[],asOf),month,asOf);
}

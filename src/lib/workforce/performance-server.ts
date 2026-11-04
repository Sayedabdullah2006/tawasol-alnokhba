import "server-only";
import {requireEmployeeAccess,createServiceRoleClient,type WorkforceActor} from "./server";
import {performanceFacts,evaluatePerformance,type PerformanceEvidence,type PerformanceSummary} from "./performance";
import {evaluateSales,type SalesData} from './sales';
import {combinePerformance} from './overall-performance';
export async function employeeTaskPerformance(actor:WorkforceActor,employeeId:string,month:string,now=new Date(),required=5):Promise<PerformanceSummary>{
 requireEmployeeAccess(actor,employeeId);
 const [year,number]=month.split('-').map(Number),asOf=new Date(Math.min(now.getTime(),Date.UTC(year,number,1)-3*3600000-1));
 const service=await createServiceRoleClient();
 const {data,error}=await service.rpc("wf_performance_evidence",{p_actor:actor.user.id,p_employee:employeeId,p_asof:asOf.toISOString()});
 if(error)throw error;
 return evaluatePerformance(performanceFacts(data as PerformanceEvidence[],asOf),month,asOf,required);
}
export async function employeePerformance(actor:WorkforceActor,employeeId:string,month:string,now=new Date()):Promise<PerformanceSummary>{
 requireEmployeeAccess(actor,employeeId);
 const db=await createServiceRoleClient(),result=await db.rpc('wf_sales_snapshot',{p_actor:actor.user.id,p_month:month+'-01'});if(result.error)throw result.error;const raw=result.data as SalesData;
 const plan=raw.plans.find(p=>p.employee_id===employeeId),configured=!!plan&&!!raw.month&&raw.month.status!=='draft';
 const tasks=await employeeTaskPerformance(actor,employeeId,month,now,configured?Number(raw.month?.minimum_tasks??5):5);
 return {...tasks,overall:combinePerformance(tasks,configured?evaluateSales(plan!,raw.activities).total:null,Number(raw.month?.performance_sales_weight??60),configured)};
}

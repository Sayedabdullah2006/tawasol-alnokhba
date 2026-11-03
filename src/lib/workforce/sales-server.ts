import 'server-only';
import {createServiceRoleClient,type WorkforceActor} from './server';
import {scopeSalesData,type SalesData,type SalesActivity} from './sales';
import {employeeTaskPerformance} from './performance-server';
import {evaluateSales} from './sales';
import {combinePerformance} from './overall-performance';
export async function salesSnapshot(actor:WorkforceActor,month:string):Promise<SalesData>{
 const db=await createServiceRoleClient();const {data,error}=await db.rpc('wf_sales_snapshot',{p_actor:actor.user.id,p_month:month+'-01'});if(error)throw error;const scoped=scopeSalesData(data as SalesData&{_competitionFacts:SalesActivity[]});
 const performance=await Promise.all(scoped.plans.map(async plan=>{const tasks=await employeeTaskPerformance(actor,plan.employee_id,month);return {employee_id:plan.employee_id,eligible:tasks.eligible,required:tasks.required,overall:combinePerformance(tasks,evaluateSales(plan,scoped.activities).total,Number(scoped.month?.performance_sales_weight??60),scoped.month?.status!=='draft')};}));
 return {...scoped,performance};
}

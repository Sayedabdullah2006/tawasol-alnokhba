import 'server-only';
import {createServiceRoleClient,type WorkforceActor} from './server';
import {requireWorkSummaryAccess} from './summary-server';
import type {WeeklyHours} from './weekly-hours';
export async function employeeWeeklyHours(actor:WorkforceActor,employeeId:string,month:string){
 requireWorkSummaryAccess(actor,employeeId);
 const db=await createServiceRoleClient();
 const {data,error}=await db.rpc('wf_weekly_hours_snapshot',{p_actor:actor.user.id,p_employee:employeeId,p_month:`${month.slice(0,7)}-01`});
 if(error)throw error;return data as WeeklyHours;
}

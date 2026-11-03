import 'server-only';
import {createServiceRoleClient,type WorkforceActor} from './server';
import {scopeSalesData,type SalesData,type SalesActivity} from './sales';
export async function salesSnapshot(actor:WorkforceActor,month:string):Promise<SalesData>{
 const db=await createServiceRoleClient();const {data,error}=await db.rpc('wf_sales_snapshot',{p_actor:actor.user.id,p_month:month+'-01'});if(error)throw error;return scopeSalesData(data as SalesData&{_competitionFacts:SalesActivity[]});
}

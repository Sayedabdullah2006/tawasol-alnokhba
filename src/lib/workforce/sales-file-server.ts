import 'server-only';
import {createServiceRoleClient,type WorkforceActor} from './server';
export async function salesFileCommand(actor:WorkforceActor,opportunity:string,command:string,id:string|null=null,payload:Record<string,unknown>={}) {
 const service=await createServiceRoleClient();
 const {data,error}=await service.rpc('wf_sales_file_command',{p_actor:actor.user.id,p_opportunity:opportunity,p_command:command,p_id:id,p_payload:payload});
 if(error)throw error;
 return data;
}

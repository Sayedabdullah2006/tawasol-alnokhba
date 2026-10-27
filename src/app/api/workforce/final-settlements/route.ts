import {apiError,assertMutation,createServiceRoleClient,requireAdmin,workforceActor} from '@/lib/workforce/server';
import {privateResponse} from '@/lib/workforce/task-server';
import {uuid,WorkforceError} from '@/lib/workforce/validation';
export async function GET(request:Request){try{
 const actor=await workforceActor();requireAdmin(actor);const id=new URL(request.url).searchParams.get('request_id');
 if(!id){const rows=await actor.db.from('wf_employee_requests').select('id,employee_id,resignation_details').eq('kind','resignation').eq('status','approved').is('test_run_id',null).order('decided_at',{ascending:false}).limit(100);if(rows.error)throw rows.error;return privateResponse({requests:rows.data});}
 const result=await(await createServiceRoleClient()).rpc('wf_final_settlement',{p_actor:actor.user.id,p_request:uuid(id)});if(result.error)throw result.error;return privateResponse(result.data);
}catch(e){return apiError(e);}}
export async function POST(request:Request){try{
 await assertMutation(request);const actor=await workforceActor();requireAdmin(actor);const body=await request.json();
 if(!['quote','approve','reopen','pay'].includes(body.command)||!Number.isSafeInteger(body.version)||body.version<0)throw new WorkforceError('إجراء التسوية غير صحيح');
 const result=await(await createServiceRoleClient()).rpc('wf_final_settlement',{p_actor:actor.user.id,p_request:uuid(body.request_id),p_command:body.command,p_version:body.version,p_payload:body.payload??{},p_key:uuid(body.key)});if(result.error)throw result.error;return privateResponse(result.data);
}catch(e){return apiError(e);}}

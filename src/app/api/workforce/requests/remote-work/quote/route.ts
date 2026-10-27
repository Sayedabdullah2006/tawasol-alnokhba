import {assertMutation,workforceActor,createServiceRoleClient,apiError} from '@/lib/workforce/server';
import {privateResponse} from '@/lib/workforce/task-server';
import {remoteInput} from '@/lib/workforce/remote-work';
import {WorkforceError} from '@/lib/workforce/validation';
export async function POST(request:Request){try{
 await assertMutation(request);const actor=await workforceActor();if(!actor.employee)throw new WorkforceError('التقدير للموظفة صاحبة الطلب',403);
 const result=await(await createServiceRoleClient()).rpc('wf_remote_work_quote',{p_actor:actor.user.id,p_payload:remoteInput(await request.json())});
 if(result.error)throw result.error;return privateResponse({quote:result.data});
}catch(e){return apiError(e);}}

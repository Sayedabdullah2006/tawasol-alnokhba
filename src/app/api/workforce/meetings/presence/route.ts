import {createHash} from 'node:crypto';import {cookies} from 'next/headers';
import {workforceActor,createServiceRoleClient,assertMutation,apiError} from '@/lib/workforce/server';
import {privateResponse} from '@/lib/workforce/task-server';import {uuid,WorkforceError} from '@/lib/workforce/validation';
export async function POST(request:Request){try{
 await assertMutation(request);const actor=await workforceActor(),body=await request.json();
 if(!body||typeof body!=='object'||Object.keys(body).some(k=>!['meeting_id','command'].includes(k))||!['join','leave'].includes(body.command))throw new WorkforceError('إجراء الاجتماع غير صحيح');
 const device=(await cookies()).get('wf_work_device')?.value;
 if(actor.role!=='admin'&&!actor.employee?.allow_mobile_attendance&&!device)throw new WorkforceError('انضمي من جهاز تسجيل الحضور',409);
 const result=await (await createServiceRoleClient()).rpc('wf_meeting_presence',{p_actor:actor.user.id,p_meeting:uuid(body.meeting_id),p_command:body.command,p_device:device?createHash('sha256').update(device).digest('hex'):''});if(result.error)throw result.error;
 return privateResponse(result.data);
 }catch(error){return apiError(error);}}

import {workforceActor,requireAdmin,createServiceRoleClient,assertMutation,apiError} from '@/lib/workforce/server';
import {privateResponse} from '@/lib/workforce/task-server';
import {googleConnection,publicMeetingConnection,encryptMeetingSecret,meetingRoot} from '@/lib/workforce/meeting-server';
import {textField,WorkforceError} from '@/lib/workforce/validation';
export async function GET(request:Request){try{const actor=await workforceActor();requireAdmin(actor);return privateResponse(publicMeetingConnection(await googleConnection(actor),request,true));}catch(e){return apiError(e);}}
export async function POST(request:Request){try{
 await assertMutation(request);const actor=await workforceActor();requireAdmin(actor);const body=await request.json();
 if(body?.command!=='configure'||Object.keys(body).some(k=>!['command','client_id','client_secret'].includes(k)))throw new WorkforceError('إعداد غير صحيح');
 const clientId=textField(body.client_id,'معرّف Google',20,500),secret=textField(body.client_secret,'سر Google',10,1000);
 const result=await (await createServiceRoleClient()).rpc('wf_meeting_google',{p_actor:actor.user.id,p_command:'configure',p_payload:{client_id:clientId,client_secret_cipher:encryptMeetingSecret(secret,meetingRoot())}});if(result.error)throw result.error;
 return privateResponse(publicMeetingConnection(result.data,request,true));
 }catch(e){return apiError(e);}}

import {workforceActor,requireAdmin,createServiceRoleClient,assertMutation,apiError} from '@/lib/workforce/server';
import {privateResponse} from '@/lib/workforce/task-server';
import {zoomConnection,publicZoomConnection} from '@/lib/workforce/meeting-zoom-server';
import {ZoomMeetings,MeetingZoomError} from '@/lib/workforce/meeting-zoom';
import {encryptMeetingSecret,meetingRoot,meetingOrigin} from '@/lib/workforce/meeting-server';
import {textField,WorkforceError} from '@/lib/workforce/validation';
export async function GET(){try{const actor=await workforceActor();requireAdmin(actor);return privateResponse(publicZoomConnection(await zoomConnection(actor)));}catch(e){return apiError(e);}}
export async function POST(request:Request){try{
 await assertMutation(request);const actor=await workforceActor();requireAdmin(actor);const body=await request.json();
 if(!body||body.command!=='configure'||Object.keys(body).some(k=>!['command','account_id','client_id','client_secret'].includes(k)))throw new WorkforceError('إعداد غير صحيح');
 const accountId=textField(body.account_id,'معرّف حساب Zoom',8,200),clientId=textField(body.client_id,'معرّف تطبيق Zoom',8,200),clientSecret=textField(body.client_secret,'سر تطبيق Zoom',8,1000);
 const hostEmail='elitecnnct@gmail.com';const client=await ZoomMeetings.connect({accountId,clientId,clientSecret,hostEmail},fetch,meetingOrigin(request));
 await client.configureScreenSharing();
 const result=await (await createServiceRoleClient()).rpc('wf_meeting_zoom',{p_actor:actor.user.id,p_command:'configure',p_payload:{account_id:accountId,client_id:clientId,client_secret_cipher:encryptMeetingSecret(clientSecret,meetingRoot()),organizer_email:hostEmail}});if(result.error)throw result.error;
 return privateResponse(publicZoomConnection(result.data));
 }catch(e){return apiError(e instanceof MeetingZoomError?new WorkforceError(e.message,409):e);}}

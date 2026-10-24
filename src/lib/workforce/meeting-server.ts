import 'server-only';
import {OAuth2Client} from 'google-auth-library';
import {createServiceRoleClient,type WorkforceActor} from './server';
import {WorkforceError} from './validation';
import {googleMeetingId,GoogleMeetingCalendar,MeetingGoogleError,meetingTokenFailure,encryptMeetingSecret,decryptMeetingSecret,meetLink,type GoogleConnection} from './meeting-google';
import type {MeetingConnection,MeetingData} from './meetings';
export const meetingColumns='id,title,description,starts_at,ends_at,task_id,participant_ids,external_attendees,reminder_minutes,created_by,status,meet_url,google_event_id,google_etag,proposed_data,sync_state,sync_error,version,series_id,series_frequency';
export function meetingOrigin(request:Request){const origin=new URL(request.url).origin;if(process.env.NODE_ENV==='development'&&['localhost','127.0.0.1'].includes(new URL(origin).hostname))return origin;return new URL(process.env.APP_BASE_URL||'https://nukhba.media').origin;}
export const meetingCallback=(request:Request)=>`${meetingOrigin(request)}/api/workforce/meetings/google/callback`;
export function meetingRoot(){const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key||key.length<32)throw new WorkforceError('إعداد حماية الربط غير متاح',503);return key;}
export async function googleConnection(actor:WorkforceActor){const service=await createServiceRoleClient();const result=await service.rpc('wf_meeting_google',{p_actor:actor.user.id,p_command:'read'});if(result.error)throw result.error;return result.data as GoogleConnection;}
export function publicMeetingConnection(c:GoogleConnection,request:Request,admin=false):MeetingConnection{return {configured:!!(c.client_id&&c.client_secret_cipher),connected:!!c.refresh_token_cipher,expectedEmail:c.expected_email,organizerEmail:c.organizer_email,clientId:admin?c.client_id??'':undefined,redirectUri:meetingCallback(request)};}
export function oauthMeetingClient(c:GoogleConnection,request:Request){if(!c.client_id||!c.client_secret_cipher)throw new WorkforceError('أكملي إعداد Google من صفحة الاجتماعات',409);return new OAuth2Client(c.client_id,decryptMeetingSecret(c.client_secret_cipher,meetingRoot()),meetingCallback(request));}
export async function calendarClient(actor:WorkforceActor,request:Request){const c=await googleConnection(actor);if(!c.refresh_token_cipher)throw new WorkforceError('اربطي تقويم Google أولًا',409);const client=oauthMeetingClient(c,request);client.setCredentials({refresh_token:decryptMeetingSecret(c.refresh_token_cipher,meetingRoot())});try{const result=await client.getAccessToken();if(!result.token)throw Error();return new GoogleMeetingCalendar(result.token,fetch,meetingOrigin(request));}catch(error){const failure=meetingTokenFailure(error);console.warn('[meeting-google] token refresh failure',{reason:failure.code,status:failure.status});throw new WorkforceError(failure.message,failure.status);}}
export async function syncMeeting(actor:WorkforceActor,request:Request,id:string,version:number,cancel:boolean){
 const service=await createServiceRoleClient(),prepared=await service.rpc('wf_meeting_command',{p_actor:actor.user.id,p_id:id,p_version:version,p_command:cancel?'prepare_cancel':'prepare'});
 if(prepared.error)throw prepared.error;const {meeting,data,emails,lease}=prepared.data;
 try{
  const client=await calendarClient(actor,request);let event;
  if(cancel){await client.cancel(meeting.google_event_id||googleMeetingId(id));}
  else {event=await client.publish(id,version,data as MeetingData,emails);if(!meetLink(event)){const fresh=await client.read(event.id||meeting.google_event_id||googleMeetingId(id));if(fresh)event=fresh;}}
  const result=await service.rpc('wf_meeting_command',{p_actor:actor.user.id,p_id:id,p_version:version,p_command:'finish',p_payload:{lease,event_id:event?.id??meeting.google_event_id,meet_url:event?meetLink(event):null,etag:event?.etag??null}});if(result.error)throw result.error;return result.data;
 }catch(error){await service.rpc('wf_meeting_command',{p_actor:actor.user.id,p_id:id,p_version:version,p_command:'fail',p_payload:{lease}});if(error instanceof MeetingGoogleError)throw new WorkforceError(error.message,409);throw error;}
}
export {encryptMeetingSecret};

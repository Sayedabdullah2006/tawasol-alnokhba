import 'server-only';
import {createServiceRoleClient,type WorkforceActor} from './server';
import {ZoomMeetings,type ZoomCredentials} from './meeting-zoom';
import {decryptMeetingSecret} from './meeting-google';
import {meetingRoot,meetingOrigin} from './meeting-server';
import {WorkforceError} from './validation';
import type {ZoomMeetingConnection} from './meetings';

type StoredZoom={account_id:string|null;client_id:string|null;client_secret_cipher:string|null;expected_email:string;organizer_email:string|null;checked_at:string|null};
export async function zoomConnection(actor:WorkforceActor){const result=await (await createServiceRoleClient()).rpc('wf_meeting_zoom',{p_actor:actor.user.id,p_command:'read'});if(result.error)throw result.error;return result.data as StoredZoom;}
export function publicZoomConnection(c:StoredZoom):ZoomMeetingConnection{return {configured:!!(c.account_id&&c.client_id&&c.client_secret_cipher),connected:!!c.checked_at,expectedEmail:c.expected_email,organizerEmail:c.organizer_email,checkedAt:c.checked_at};}
export async function zoomClient(actor:WorkforceActor,request:Request){const c=await zoomConnection(actor);if(!c.account_id||!c.client_id||!c.client_secret_cipher||!c.checked_at)throw new WorkforceError('اربط حساب Zoom من إعدادات الاجتماعات',409);
 const credentials:ZoomCredentials={accountId:c.account_id,clientId:c.client_id,clientSecret:decryptMeetingSecret(c.client_secret_cipher,meetingRoot()),hostEmail:c.expected_email};return ZoomMeetings.connect(credentials,fetch,meetingOrigin(request));}

import {randomBytes} from 'node:crypto';
import {validZoomURL,type MeetingData} from './meetings';
import {meetingEntryURL} from './meeting-entry';

export class MeetingZoomError extends Error {}
export type ZoomCredentials={accountId:string;clientId:string;clientSecret:string;hostEmail:string};
export type ZoomEvent={id:number|string;join_url?:string;agenda?:string;settings?:{join_before_host?:boolean;waiting_room?:boolean;meeting_authentication?:boolean}};
type ZoomSettings={in_meeting?:{screen_sharing?:boolean;who_can_share_screen?:string;screen_sharing_host_only?:boolean};schedule_meeting?:{join_before_host?:boolean};email_notification?:Record<string,boolean>};
export function assertZoomEntry(event:ZoomEvent){if(!validZoomURL(event.join_url)||event.settings?.join_before_host!==true||event.settings.waiting_room!==false||event.settings.meeting_authentication===true)throw new MeetingZoomError('إعدادات Zoom تمنع الدخول دون المضيف؛ راجع غرفة الانتظار والدخول قبل المضيف');return event;}
export function zoomMeetingBody(id:string,version:number,data:MeetingData,origin='https://nukhba.media'){
 return {topic:data.title,type:2,start_time:new Date(data.starts_at).toISOString(),duration:Math.ceil((Date.parse(data.ends_at)-Date.parse(data.starts_at))/60000),timezone:'Asia/Riyadh',
  agenda:`${meetingEntryURL(id,origin)}\nنسخة ${version}\n${data.description}`.slice(0,2000),password:randomBytes(8).toString('hex').slice(0,10),
  settings:{join_before_host:true,jbh_time:0,waiting_room:false,meeting_authentication:false,use_pmi:false,host_video:false,participant_video:false,mute_upon_entry:true,auto_recording:'none',auto_start_meeting_summary:false,auto_start_ai_companion_questions:false,registrants_confirmation_email:false,registrants_email_notification:false,meeting_invitees:[],push_change_to_calendar:false,continuous_meeting_chat:{enable:false}}};
}
export class ZoomMeetings {
 private hostType=2;
 constructor(private token:string,private host:string,private fetcher:typeof fetch=fetch,private origin='https://nukhba.media'){}
 private async call(path:string,init:RequestInit={}){
  const response=await this.fetcher(`https://api.zoom.us/v2${path}`,{...init,cache:'no-store',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json',...init.headers}});
  if(response.status===404&&(!init.method||init.method==='DELETE'))return null;
  if(!response.ok)throw new MeetingZoomError(response.status===401||response.status===403?'تعذر الوصول إلى Zoom؛ راجع تفعيل التطبيق وصلاحياته':response.status===429?'بلغ Zoom حد الطلبات مؤقتًا؛ أعد المحاولة لاحقًا':'تعذرت مزامنة Zoom؛ أعد المحاولة');
  return response.status===204?{}:await response.json();
 }
 static async connect(credentials:ZoomCredentials,fetcher:typeof fetch=fetch,origin='https://nukhba.media'){
  const response=await fetcher('https://zoom.us/oauth/token',{method:'POST',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{Authorization:`Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'account_credentials',account_id:credentials.accountId})});
  if(!response.ok)throw new MeetingZoomError('تعذر تفويض Zoom؛ راجع بيانات التطبيق وتفعيله');
  const result=await response.json();if(typeof result.access_token!=='string'||!result.access_token)throw new MeetingZoomError('لم يمنح Zoom صلاحية الربط');
  const client=new ZoomMeetings(result.access_token,credentials.hostEmail,fetcher,origin);
  const user=await client.call(`/users/${encodeURIComponent(credentials.hostEmail)}`);
  if(user?.email?.toLowerCase()!==credentials.hostEmail.toLowerCase()||user.status!=='active')throw new MeetingZoomError('اختر حساب Zoom المنظّم المعتمد والمفعّل');
  client.hostType=user.type;
  return client;
 }
 async checkScreenSharing(){const settings=await this.call(`/users/${encodeURIComponent(this.host)}/settings`) as ZoomSettings|null;
  if(settings?.in_meeting?.screen_sharing!==true||settings.in_meeting.who_can_share_screen!=='all')throw new MeetingZoomError('فعّل مشاركة الشاشة لجميع المشاركين في إعدادات حساب Zoom');
 }
 async configureScreenSharing(){await this.call(`/users/${encodeURIComponent(this.host)}/settings`,{method:'PATCH',body:JSON.stringify({in_meeting:{screen_sharing:true,who_can_share_screen:'all'},email_notification:{jbh_reminder:false,schedule_for_reminder:false,cancel_meeting_reminder:false}})});await this.checkScreenSharing();}
 async read(id:string){return await this.call(`/meetings/${encodeURIComponent(id)}`) as ZoomEvent|null;}
 // Zoom has no create idempotency key. A site UUID in the agenda recovers an
 // ambiguous successful POST; fail closed if the entire scheduled list is unreadable.
 async find(id:string){let page='';const matches:ZoomEvent[]=[];for(let i=0;i<20;i++){
  const result=await this.call(`/users/${encodeURIComponent(this.host)}/meetings?type=scheduled&page_size=100${page?`&next_page_token=${encodeURIComponent(page)}`:''}`);
  if(!result||!Array.isArray(result.meetings))throw new MeetingZoomError('تعذر التحقق من الاجتماعات السابقة؛ أعد المزامنة');
  matches.push(...result.meetings.filter((m:ZoomEvent)=>m.agenda?.split('\n')[0]===meetingEntryURL(id,this.origin)));
  if(matches.length>1)throw new MeetingZoomError('وجد أكثر من اجتماع مرتبط؛ راجع الربط قبل المتابعة');
  page=result.next_page_token;if(!page)return matches.length?await this.read(String(matches[0].id)):null;
 }throw new MeetingZoomError('تعذر إكمال التحقق من الاجتماعات السابقة');}
 async publish(id:string,version:number,data:MeetingData,existingId:string|null,checkpoint:(id:string)=>Promise<void>){
  if(this.hostType===1&&Date.parse(data.ends_at)-Date.parse(data.starts_at)>40*60000)throw new MeetingZoomError('حساب Zoom الأساسي يسمح باجتماع حتى 40 دقيقة؛ قلّل المدة أو رقّ حساب المنظّم');
  await this.checkScreenSharing();
  let event=existingId?await this.read(existingId):await this.find(id);
  if(existingId&&!event)throw new MeetingZoomError('حُذف الاجتماع من Zoom؛ أنشئ اجتماعًا جديدًا');
  const body=zoomMeetingBody(id,version,data,this.origin);
  if(event){await checkpoint(String(event.id));const {password,...update}=body;void password;await this.call(`/meetings/${event.id}`,{method:'PATCH',body:JSON.stringify(update)});}
  else {event=await this.call(`/users/${encodeURIComponent(this.host)}/meetings`,{method:'POST',body:JSON.stringify(body)}) as ZoomEvent;await checkpoint(String(event.id));}
  const fresh=await this.read(String(event.id));if(!fresh)throw new MeetingZoomError('تعذر التحقق من رابط الاجتماع');return assertZoomEntry(fresh);
 }
 async cancel(id:string,existingId:string|null){const event=existingId?{id:existingId}:await this.find(id);if(event)await this.call(`/meetings/${encodeURIComponent(String(event.id))}?schedule_for_reminder=false&cancel_meeting_reminder=false`,{method:'DELETE'});}
}

import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from 'node:crypto';
import {validMeetURL,type MeetingData} from './meetings';
import {meetingEntryURL} from './meeting-entry';
export type GoogleConnection={client_id:string|null;client_secret_cipher:string|null;refresh_token_cipher:string|null;expected_email:string;organizer_email:string|null;google_subject:string|null};
export class MeetingGoogleError extends Error{}
export function meetingTokenFailure(error:unknown){
 const response=(error&&typeof error==='object'&&'response' in error?error.response:null) as {data?:{error?:unknown};status?:number}|null;
 const code=typeof response?.data?.error==='string'?response.data.error:'';
 if(code==='invalid_grant')return {code,status:409,message:'ألغت Google التفويض أو انتهت صلاحيته؛ أعيدي ربط الحساب من إعدادات الاجتماعات'};
 if(['invalid_client','unauthorized_client','deleted_client'].includes(code))return {code,status:409,message:'تعذر التحقق من إعدادات تطبيق Google؛ راجعي بيانات الربط في إعدادات الاجتماعات'};
 if(code==='admin_policy_enforced'||code==='access_denied')return {code,status:409,message:'سياسة حساب Google تمنع الوصول؛ راجعي صلاحيات التطبيق'};
 return {code:response?.status===429?'rate_limited':'temporarily_unavailable',status:503,message:'تعذر الاتصال بـ Google مؤقتًا؛ أعيدي المحاولة. لا يلزم إعادة الربط الآن'};
}
export function encryptMeetingSecret(value:string,root:string){if(root.length<32)throw new MeetingGoogleError('مفتاح حماية الربط غير متاح');const key=Buffer.from(hkdfSync('sha256',root,'nukhba-meetings','oauth-secrets-v1',32)),iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from('wf-meetings-v1'));return ['v1',iv.toString('base64url'),Buffer.concat([c.update(value,'utf8'),c.final()]).toString('base64url'),c.getAuthTag().toString('base64url')].join('.');}
export function decryptMeetingSecret(value:string,root:string){try{const [v,iv,text,tag]=value.split('.');if(v!=='v1'||root.length<32)throw Error();const key=Buffer.from(hkdfSync('sha256',root,'nukhba-meetings','oauth-secrets-v1',32)),d=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));d.setAAD(Buffer.from('wf-meetings-v1'));d.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([d.update(Buffer.from(text,'base64url')),d.final()]).toString('utf8');}catch{throw new MeetingGoogleError('تعذر فتح بيانات Google؛ أعيدي الربط من إعدادات الاجتماعات');}}
export type GoogleEvent={id?:string;etag?:string;status?:string;hangoutLink?:string;conferenceData?:{entryPoints?:{entryPointType:string;uri:string}[];createRequest?:{status?:{statusCode:string}}};extendedProperties?:{private?:Record<string,string>}};
export function googleMeetingId(id:string){return `nf${id.replaceAll('-','')}`;}
export function meetLink(event:GoogleEvent){const url=event.hangoutLink||event.conferenceData?.entryPoints?.find(p=>p.entryPointType==='video')?.uri;return validMeetURL(url)?url:null;}
function escapeHTML(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function googleMeetingBody(id:string,version:number,data:MeetingData,emails:string[],origin='https://nukhba.media'){
 const entry=meetingEntryURL(id,origin);
 return {summary:data.title,description:`<p><a href="${escapeHTML(entry)}">الانضمام عبر موقع تواصل النخبة</a></p><p>للموظفات: افتحي الرابط من نفس جهاز ومتصفح تسجيل الحضور، لتفعيل حماية جلسة الدوام عند الانضمام عبر الموقع. الدخول المباشر من Google Meet لا يفعّل الحماية.</p>${data.description?`<p>${escapeHTML(data.description).replace(/\r?\n/g,'<br>')}</p>`:''}`,source:{title:'الانضمام عبر موقع تواصل النخبة',url:entry},start:{dateTime:data.starts_at,timeZone:'Asia/Riyadh'},end:{dateTime:data.ends_at,timeZone:'Asia/Riyadh'},reminders:{useDefault:false},attendees:[...new Set(emails.map(e=>e.toLowerCase()))].map(email=>({email})),extendedProperties:{private:{wfMeetingId:id,wfVersion:String(version)}}};
}
export class GoogleMeetingCalendar {
 private accessToken:string;private fetcher:typeof fetch;private siteOrigin:string;
 constructor(accessToken:string,fetcher:typeof fetch=fetch,siteOrigin='https://nukhba.media'){this.accessToken=accessToken;this.fetcher=fetcher;this.siteOrigin=siteOrigin;}
 private async call(path:string,init:RequestInit={}){const response=await this.fetcher(`https://www.googleapis.com/calendar/v3/calendars/primary/events${path.startsWith('?')?'':'/'}${path}`,{...init,signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${this.accessToken}`,'Content-Type':'application/json',...init.headers}});if(!response.ok){if(response.status===404||response.status===410)return null;throw new MeetingGoogleError(response.status===401||response.status===403?'تعذر الوصول لتقويم Google؛ راجعي الربط والصلاحيات':'تعذرت مزامنة Google؛ أعيدي المحاولة');}if(response.status===204)return {};return await response.json() as GoogleEvent;}
 async read(id:string){return await this.call(encodeURIComponent(id));}
 async publish(id:string,version:number,data:MeetingData,emails:string[]){
  const eventId=googleMeetingId(id),existing=await this.read(eventId);
  if(existing?.status==='cancelled')throw new MeetingGoogleError('هذا الاجتماع ألغي في Google؛ أنشئي اجتماعًا جديدًا');
  if(existing?.extendedProperties?.private?.wfVersion===String(version))return existing;
  const body=googleMeetingBody(id,version,data,emails,this.siteOrigin);
  if(existing){const result=await this.call(`${eventId}?conferenceDataVersion=1&sendUpdates=all`,{method:'PATCH',headers:existing.etag?{'If-Match':existing.etag}:{},body:JSON.stringify(body)});if(!result)throw new MeetingGoogleError('الاجتماع غير متاح في Google');return result;}
  try{const result=await this.call('?conferenceDataVersion=1&sendUpdates=all',{method:'POST',body:JSON.stringify({...body,id:eventId,conferenceData:{createRequest:{requestId:id,conferenceSolutionKey:{type:'hangoutsMeet'}}}})});if(!result)throw Error();return result;}catch(error){const recovered=await this.read(eventId);if(recovered?.extendedProperties?.private?.wfVersion===String(version))return recovered;throw error;}
 }
 async cancel(id:string){await this.call(`${encodeURIComponent(id)}?sendUpdates=all`,{method:'DELETE'});}
}

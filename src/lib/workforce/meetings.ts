export type MeetingData={title:string;description:string;starts_at:string;ends_at:string;task_id:string|null;participant_ids:string[];external_attendees:string[];reminder_minutes:number};
export type Meeting=MeetingData&{id:string;created_by:string;status:'draft'|'scheduled'|'cancelled';meet_url:string|null;google_event_id:string|null;google_etag:string|null;provider?:'google'|'zoom';zoom_meeting_id?:string|null;proposed_data:MeetingData|null;sync_state:'idle'|'syncing'|'error';sync_error:string|null;version:number;series_id?:string|null;series_frequency?:'daily'|'weekly'|'monthly'|null};
export type MeetingAttendance={meeting_id:string;user_id:string;joined_at:string;left_at:string|null};
export function meetingPresenceLabel(meeting:Meeting,entry:MeetingAttendance|undefined,now:number){return entry?'سجّل الانضمام':now>=Date.parse(meeting.ends_at)?'لم يسجّل الانضمام':now>=Date.parse(meeting.starts_at)?'لم ينضم بعد':'بانتظار الموعد';}
export type MeetingPerson={id:string;full_name:string};
export type MeetingConnection={configured:boolean;connected:boolean;expectedEmail:string;organizerEmail:string|null;clientId?:string;redirectUri:string};
export type ZoomMeetingConnection={configured:boolean;connected:boolean;organizerEmail:string|null;expectedEmail:string;checkedAt:string|null};
export function validMeetURL(value:unknown):value is string{return typeof value==='string'&&/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(value);}
export function validZoomURL(value:unknown):value is string{return typeof value==='string'&&/^https:\/\/(?:[a-z0-9-]+\.)?zoom\.us\/j\/[0-9]{9,11}(?:\?pwd=[A-Za-z0-9._~-]+)?$/.test(value);}
export function validMeetingURL(value:unknown):value is string{return validMeetURL(value)||validZoomURL(value);}
export function meetingBrowserURL(value:unknown){if(validMeetURL(value))return value;if(!validZoomURL(value))return null;const url=new URL(value);url.pathname=`/wc/${url.pathname.split('/')[2]}/join`;url.searchParams.set('prefer','1');return url.href;}
export function meetingDate(value:string){return new Date(value).toLocaleString('ar-SA',{calendar:'gregory',timeZone:'Asia/Riyadh',dateStyle:'medium',timeStyle:'short'});}
export function localMeetingDate(value:string){return new Date(Date.parse(value)+3*3600000).toISOString().slice(0,16);}
export function meetingDefaults():MeetingData {const start=new Date(Math.ceil((Date.now()+3600000)/1800000)*1800000);return {title:'',description:'',starts_at:start.toISOString(),ends_at:new Date(+start+1800000).toISOString(),task_id:null,participant_ids:[],external_attendees:[],reminder_minutes:15};}

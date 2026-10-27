import type {WorkforceMail} from './workforce-email.ts';

export type CalendarOccurrence={id:string;title:string;description:string;startsAt:string;endsAt:string;recurrenceAt:string;sequence:number};
export type MeetingCalendarSnapshot={uid:string;recurring:boolean;master:boolean;cancelled:boolean;external:boolean;occurrences:CalendarOccurrence[]};
const site='https://nukhba.media',uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encode=new TextEncoder();
const siteEntry=/^https:\/\/nukhba\.media\/meetings\/(?:[0-9a-f-]{36}|invite\/[0-9a-f-]{36}\?expires=\d{10}&token=[A-Za-z0-9_-]{43})$/i;
function base64(bytes:Uint8Array){return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));}
function base64url(bytes:Uint8Array){return base64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function key(secret:string){if(secret.length<32)throw Error('Meeting signing key unavailable');return crypto.subtle.importKey('raw',encode.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function guestMeetingURL(id:string,endsAt:string,secret:string){
 if(!uuid.test(id)||!Number.isFinite(Date.parse(endsAt)))throw Error('Invalid guest meeting');
 const expires=Math.floor(Date.parse(endsAt)/1000)+7*86400;
 const token=base64url(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),encode.encode(`nukhba-meeting-guest:v1:${id}:${expires}`))));
 return `${site}/meetings/invite/${id}?expires=${expires}&token=${token}`;
}
export async function verifyGuestMeetingURL(id:string,expires:string,token:string,secret:string,now=Date.now()){
 if(!uuid.test(id)||!/^\d{10}$/.test(expires)||Number(expires)*1000<now||!/^[A-Za-z0-9_-]{43}$/.test(token))return false;
 try{const signature=Uint8Array.from(atob(token.replace(/-/g,'+').replace(/_/g,'/')+'='),c=>c.charCodeAt(0));return await crypto.subtle.verify('HMAC',await key(secret),signature,encode.encode(`nukhba-meeting-guest:v1:${id}:${expires}`));}catch{return false;}
}
const utc=(value:string)=>{const date=new Date(value);if(!Number.isFinite(+date))throw Error('Invalid calendar date');return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');};
const text=(value:string)=>value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function fold(line:string){const lines:string[]=[];let part='',size=0;for(const ch of line){const n=encode.encode(ch).length;if(size+n>75){lines.push(part);part=' ';size=1;}part+=ch;size+=n;}lines.push(part);return lines.join('\r\n');}
export function renderMeetingCalendar(calendar:MeetingCalendarSnapshot,email:string,stamp:string,links:Record<string,string>){
 if(!uuid.test(calendar.uid)||(!calendar.recurring&&calendar.occurrences.length!==1)||!calendar.occurrences.length||calendar.occurrences.length>24||!/^[^\s<>:;,\r\n]+@[^\s<>:;,\r\n]+\.[^\s<>:;,\r\n]+$/.test(email))throw Error('Invalid calendar invitation');
 const occurrences=[...calendar.occurrences].sort((a,b)=>Date.parse(a.recurrenceAt)-Date.parse(b.recurrenceAt));
 for(const o of occurrences){if(!uuid.test(o.id)||!Number.isInteger(o.sequence)||o.sequence<0||Date.parse(o.endsAt)<=Date.parse(o.startsAt)||!siteEntry.test(links[o.id]||''))throw Error('Invalid calendar occurrence');}
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Nukhba Media//Workforce Meetings//AR','CALSCALE:GREGORIAN',`METHOD:${calendar.cancelled?'CANCEL':'REQUEST'}`,'X-WR-TIMEZONE:Asia/Riyadh'];
 function event(o:CalendarOccurrence,master=false){
  const link=links[o.id],start=master?o.recurrenceAt:o.startsAt,end=master?new Date(Date.parse(o.recurrenceAt)+Date.parse(o.endsAt)-Date.parse(o.startsAt)).toISOString():o.endsAt;
  lines.push('BEGIN:VEVENT',`UID:${calendar.uid}@nukhba.media`,`DTSTAMP:${utc(stamp)}`,`SEQUENCE:${master?0:o.sequence}`,`DTSTART:${utc(start)}`,`DTEND:${utc(end)}`);
  if(calendar.recurring&&!master)lines.push(`RECURRENCE-ID:${utc(o.recurrenceAt)}`);
  if(master&&occurrences.length>1)lines.push(`RDATE:${occurrences.map(o=>utc(o.recurrenceAt)).join(',')}`);
  lines.push(`SUMMARY:${text(o.title)}`,`DESCRIPTION:${text([o.description,'الانضمام من موقع تواصل النخبة:',link].filter(Boolean).join('\n'))}`,`URL:${link}`,`LOCATION:${text(link)}`,'ORGANIZER;CN="Nukhba Media":mailto:noreply@nukhba.media',`ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:${email}`,`STATUS:${calendar.cancelled?'CANCELLED':'CONFIRMED'}`,'TRANSP:OPAQUE','END:VEVENT');
 }
 if(calendar.recurring&&calendar.master)event(occurrences[0],true);
 for(const o of occurrences)event(o);
 lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
export async function prepareMeetingCalendarMail(mail:WorkforceMail,secret:string){
 const calendar=mail.meetingCalendar;
 if(!calendar||!['meeting_event','meeting_guest'].includes(mail.kind))return {mail,attachments:undefined};
 const links:Record<string,string>={};for(const o of calendar.occurrences)links[o.id]=calendar.external?await guestMeetingURL(o.id,o.endsAt,secret):`${site}/meetings/${o.id}`;
 const content=renderMeetingCalendar(calendar,mail.email,mail.createdAt,links);
 let prepared=mail;
 if(calendar.external){const occurrences=[...calendar.occurrences].sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));prepared={...mail,href:links[occurrences[0].id],body:occurrences.map(o=>`${o.title}\n${new Date(o.startsAt).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh',calendar:'gregory',dateStyle:'medium',timeStyle:'short'})}\n${links[o.id]}`).join('\n\n')};}
 return {mail:prepared,attachments:[{filename:'meeting.ics',content:base64(encode.encode(content)),content_type:`text/calendar; charset=utf-8; method=${calendar.cancelled?'CANCEL':'REQUEST'}`}]};
}

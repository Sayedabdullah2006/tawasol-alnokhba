import test from 'node:test';import assert from 'node:assert/strict';
import {GoogleMeetingCalendar,googleMeetingId,meetLink,encryptMeetingSecret,decryptMeetingSecret} from '../src/lib/workforce/meeting-google.ts';
const id='10000000-0000-4000-8000-000000000001',data={title:'جلسة مراجعة',description:'المخرجات',starts_at:'2026-10-25T09:00:00+03:00',ends_at:'2026-10-25T10:00:00+03:00',participant_ids:[],external_attendees:[],task_id:null,reminder_minutes:15};
test('Google create, retry, edit and cancel use stable identity and one invitation per version',async()=>{
 let stored=null;const writes=[];
 const fetcher=async(url,init)=>{assert.ok(url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events'));assert.equal(init.headers.Authorization,'Bearer fixture');
  const method=init.method||'GET';if(method==='GET')return Response.json(stored||{},{status:stored?200:404});
  writes.push({url,method,body:init.body&&JSON.parse(init.body)});
  if(method==='DELETE'){stored=null;return new Response(null,{status:204});}
  stored={...JSON.parse(init.body),id:googleMeetingId(id),etag:'one',hangoutLink:'https://meet.google.com/abc-defg-hij'};return Response.json(stored);
 };
 const api=new GoogleMeetingCalendar('fixture',fetcher);
 assert.equal(meetLink(await api.publish(id,1,data,['A@example.com','a@example.com'])), 'https://meet.google.com/abc-defg-hij');
 await api.publish(id,1,data,['a@example.com']);assert.equal(writes.length,1);assert.equal(writes[0].body.attendees.length,1);
 assert.equal(writes[0].body.reminders.useDefault,false);assert.ok(writes[0].url.endsWith('sendUpdates=all'));
 await api.publish(id,2,{...data,title:'تحديث الجلسة'},['a@example.com']);assert.equal(writes[1].method,'PATCH');
 await api.cancel(googleMeetingId(id));assert.equal(writes[2].method,'DELETE');
});
test('ambiguous successful create recovers without duplicate invitation; unsafe Meet URLs fail closed',async()=>{
 let stored=null,created=0;
 const api=new GoogleMeetingCalendar('fixture',async(url,init)=>{
  if(init.method==='POST'){created++;stored={id:googleMeetingId(id),extendedProperties:{private:{wfVersion:'1'}},hangoutLink:'https://meet.google.com/abc-defg-hij'};throw Error('transport interrupted');}
  return Response.json(stored||{},{status:stored?200:404});
 });
 await api.publish(id,1,data,[]);await api.publish(id,1,data,[]);assert.equal(created,1);
 assert.equal(meetLink({hangoutLink:'https://meet.google.com.evil.test/abc-defg-hij'}),null);
 assert.equal(meetLink({conferenceData:{entryPoints:[{entryPointType:'video',uri:'https://meet.google.com/abc-defg-hij'}]}}),'https://meet.google.com/abc-defg-hij');
});
test('OAuth secrets are authenticated encrypted; wrong key or changed cipher cannot decode',()=>{
 const key='a'.repeat(64),plain='fixture-refresh-token',cipher=encryptMeetingSecret(plain,key);
 assert.ok(!cipher.includes(plain));assert.equal(decryptMeetingSecret(cipher,key),plain);assert.notEqual(encryptMeetingSecret(plain,key),cipher);
 assert.throws(()=>decryptMeetingSecret(cipher,'b'.repeat(64)));assert.throws(()=>decryptMeetingSecret(cipher.replace('v1.','v2.'),key));
});

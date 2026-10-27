import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ZoomMeetings,zoomMeetingBody,assertZoomEntry} from '../src/lib/workforce/meeting-zoom.ts';
import {validMeetingURL,validZoomURL,meetingBrowserURL} from '../src/lib/workforce/meetings.ts';
import {createMeetingsDB,scheduled,meetingCommand,meetingPresence,meetingData} from './helpers/meetings-db.mjs';
import {ids,command,clock,snapshot,at} from './helpers/work-session-db.mjs';
import {renderWorkforceEmail} from '../supabase/functions/_shared/workforce-email.ts';
const id='10000000-0000-4000-8000-000000000001',zoomId='81234567890',url=`https://us06web.zoom.us/j/${zoomId}?pwd=exampleToken`;
const migrate=()=>readFile(new URL('../supabase/migrations/20261027092037_zoom_meeting_provider.sql',import.meta.url),'utf8');
const ready={id:zoomId,join_url:url,start_time:meetingData().starts_at,settings:{join_before_host:true,waiting_room:false,meeting_authentication:false}};
async function setup(){const db=await createMeetingsDB();await db.exec('reset role;'+await migrate()+';set role service_role;');return db;}
async function config(db,actor=ids.admin){return db.query('select wf_meeting_zoom($1,$2,$3)',[actor,'configure',{account_id:'account-fixture',client_id:'client-fixture',client_secret_cipher:'x'.repeat(60),organizer_email:'elitecnnct@gmail.com'}]);}
async function publish(db,actor=ids.admin,data=meetingData()){await meetingCommand(db,id,0,'save',data,actor);const p=await meetingCommand(db,id,1,'prepare',{},actor);await db.query('select wf_meeting_zoom_checkpoint($1,$2,1,$3,$4)',[actor,id,p.lease,zoomId]);return meetingCommand(db,id,1,'finish',{lease:p.lease,meet_url:url},actor);}

test('Zoom payload allows entry without host, excludes invitation recipients and automatic recording; unsafe URLs rejected',()=>{
 const body=zoomMeetingBody(id,1,meetingData());assert.equal(body.settings.join_before_host,true);assert.equal(body.settings.waiting_room,false);assert.equal(body.settings.meeting_authentication,false);assert.equal(body.settings.auto_recording,'none');assert.deepEqual(body.settings.meeting_invitees,[]);assert.equal(body.settings.push_change_to_calendar,false);assert.ok(body.agenda.startsWith(`https://nukhba.media/meetings/${id}`));assert.equal(body.duration,180);assert.equal(body.start_time,'2026-10-24T09:00:00');assert.equal(body.timezone,'Asia/Riyadh');
 assert.ok(validMeetingURL(url));assert.ok(validMeetingURL('https://meet.google.com/abc-defg-hij'));
 for(const value of ['https://zoom.us.evil.test/j/81234567890','http://zoom.us/j/81234567890','https://zoom.us/s/81234567890?zak=host','https://evil.zoom.us.evil/j/81234567890','https://zoom.us/j/81234567890?pwd=a&zak=b'])assert.equal(validZoomURL(value),false);
 for(const settings of [{join_before_host:false,waiting_room:false},{join_before_host:true,waiting_room:true},{join_before_host:true,waiting_room:false,meeting_authentication:true}])assert.throws(()=>assertZoomEntry({...ready,settings}));
});

test('Zoom create, update, cancellation and recovery reuse a single resource; participant/host URLs never leave the adapter',async()=>{
 const writes=[];let stored=null;
 const fetcher=async(target,init={})=>{const path=new URL(target).pathname,method=init.method||'GET';
  if(path.endsWith('/settings'))return Response.json({in_meeting:{screen_sharing:true,who_can_share_screen:'all'}});
  if(method==='GET'&&path.endsWith('/meetings'))return Response.json({meetings:stored?[stored]:[],next_page_token:''});
  if(method==='GET')return stored?Response.json(stored):Response.json({},{status:404});
  const body=init.body&&JSON.parse(init.body);writes.push({method,body});
  if(method==='POST'){stored={...ready,agenda:body.agenda};return Response.json({...stored,start_url:'https://zoom.us/s/secret'});}
  if(method==='PATCH'){stored={...stored,agenda:body.agenda};return new Response(null,{status:204});}
  stored=null;return new Response(null,{status:204});
 };
 const api=new ZoomMeetings('fixture','elitecnnct@gmail.com',fetcher),checkpoints=[];
 assert.equal((await api.publish(id,1,meetingData(),null,async n=>checkpoints.push(n))).join_url,url);
 await api.publish(id,1,meetingData(),null,async n=>checkpoints.push(n));
 await api.publish(id,2,meetingData({title:'جلسة جديدة'}),zoomId,async()=>{});
 assert.equal(writes.filter(x=>x.method==='POST').length,1);assert.ok(writes.filter(x=>x.method==='PATCH').every(x=>!('password' in x.body)));
 await api.cancel(id,zoomId);assert.equal(writes.at(-1).method,'DELETE');assert.deepEqual(checkpoints,[zoomId,zoomId]);
});

test('screen-sharing policy and unreadable recovery lists fail before creating a meeting',async()=>{
 let posts=0;const api=new ZoomMeetings('fixture','elitecnnct@gmail.com',async(u,i={})=>{if(i.method==='POST')posts++;return Response.json({in_meeting:{screen_sharing:true,who_can_share_screen:'host'}});});await assert.rejects(()=>api.publish(id,1,meetingData(),null,async()=>{}));assert.equal(posts,0);
 const incomplete=new ZoomMeetings('fixture','elitecnnct@gmail.com',async(u,i={})=>{if(i.method==='POST')posts++;return Response.json(new URL(u).pathname.endsWith('/settings')?{in_meeting:{screen_sharing:true,who_can_share_screen:'all'}}:{},{status:new URL(u).pathname.endsWith('/settings')?200:503});});await assert.rejects(()=>incomplete.publish(id,1,meetingData(),null,async()=>{}));assert.equal(posts,0);
});

test('only admin configures Zoom; old meetings remain Google and new Noor meetings preserve task linkage and session protection',async()=>{
 const db=await createMeetingsDB();try{
  await command(db,{command:'in'});await command(db,{command:'in'},ids.monwa);const legacy=await scheduled(db);
  await db.exec('reset role;'+await migrate()+';set role service_role;');
  assert.equal((await db.query('select provider from wf_meetings where id=$1',[legacy])).rows[0].provider,'google');
  const original=await db.query('select meet_url,google_event_id from wf_meetings where id=$1',[legacy]);await config(db);
  for(const actor of [ids.noor,ids.monwa])await assert.rejects(()=>config(db,actor));
  const m=await publish(db,ids.noor);assert.equal(m.provider,'zoom');assert.equal(m.task_id,ids.shared);assert.equal(m.zoom_meeting_id,zoomId);assert.equal(m.google_event_id,null);
  for(const actor of [ids.noor,ids.monwa]){await assert.rejects(()=>meetingPresence(db,id,'join',actor,'b'.repeat(64)));await meetingPresence(db,id,'join',actor);}
  await clock(db,'11:30');for(const actor of [ids.noor,ids.monwa])assert.ok((await snapshot(db,actor)).session);
  const notifications=(await db.query("select count(*)::int n from wf_notifications where event_key like 'meeting-event:'||$1||'%'",[id])).rows[0].n;assert.equal(notifications,3);
  assert.deepEqual((await db.query('select meet_url,google_event_id from wf_meetings where id=$1',[legacy])).rows,original.rows);
  const cancelled=await meetingCommand(db,id,1,'prepare_cancel');await meetingCommand(db,id,1,'finish',{lease:cancelled.lease});assert.equal((await db.query('select status from wf_meetings where id=$1',[id])).rows[0].status,'cancelled');
 }finally{await db.close();}
});

test('Zoom lease, URL identity and role checks cannot be bypassed; connection and checkpoints are private',async()=>{
 const db=await setup();try{
  await config(db);await meetingCommand(db,id,0,'save',meetingData());const p=await meetingCommand(db,id,1,'prepare');
  await assert.rejects(()=>db.query('select wf_meeting_zoom_checkpoint($1,$2,1,$3,$4)',[ids.monwa,id,p.lease,zoomId]));
  await assert.rejects(()=>db.query('select wf_meeting_zoom_checkpoint($1,$2,1,$3,$4)',[ids.admin,id,crypto.randomUUID(),zoomId]));
  await assert.rejects(()=>meetingCommand(db,id,1,'finish',{lease:p.lease,meet_url:url}));
  await db.query('select wf_meeting_zoom_checkpoint($1,$2,1,$3,$4)',[ids.admin,id,p.lease,zoomId]);
  await assert.rejects(()=>meetingCommand(db,id,1,'finish',{lease:p.lease,meet_url:url.replace(zoomId,'89999999999')}));
  await assert.rejects(()=>meetingCommand(db,id,1,'finish',{lease:p.lease,meet_url:'https://meet.google.com/abc-defg-hij'}));
  for(const role of ['authenticated','anon']){await db.exec('reset role;set role '+role);await assert.rejects(()=>db.query('select * from workforce_private.zoom_meeting_connection'));await assert.rejects(()=>config(db));}
 }finally{await db.close();}
});

test('external guest queue deduplicates, hides secrets, requires worker lease and retries without real email transport',async()=>{
 const db=await setup();try{
  await db.exec('reset role;alter table wf_notification_delivery_settings add column worker_token uuid,add column worker_until timestamptz;set role service_role;');
  await config(db);await publish(db,ids.admin,meetingData({external_attendees:['guest@example.com',ids.noor+'@example.com']}));
  let rows=(await db.query('select * from workforce_private.meeting_guest_deliveries')).rows;assert.equal(rows.length,1);assert.equal(rows[0].email,'guest@example.com');
  const p=await meetingCommand(db,id,1,'prepare');await meetingCommand(db,id,1,'finish',{lease:p.lease,meet_url:url});
  assert.equal((await db.query('select count(*)::int n from workforce_private.meeting_guest_deliveries')).rows[0].n,1);
  const token=crypto.randomUUID();assert.deepEqual((await db.query('select wf_claim_meeting_guest_deliveries($1,8) v',[token])).rows[0].v,[]);
  await db.query("update wf_notification_delivery_settings set worker_token=$1,worker_until=now()+interval '3 minutes'",[token]);
  const claimed=(await db.query('select wf_claim_meeting_guest_deliveries($1,8) v',[token])).rows[0].v;assert.equal(claimed.length,1);assert.equal(claimed[0].externalMeeting,true);
  const rendered=renderWorkforceEmail(claimed[0].snapshot);assert.ok(rendered.html.includes(meetingBrowserURL(url).replaceAll("&","&amp;")));assert.ok(!rendered.html.includes('start_url'));assert.ok(!rendered.text.includes('نفس جهاز'));
  assert.equal((await db.query('select wf_finish_meeting_guest_delivery($1,$2,$3) v',[claimed[0].id,crypto.randomUUID(),'sent'])).rows[0].v,false);
  assert.equal((await db.query('select wf_finish_meeting_guest_delivery($1,$2,$3) v',[claimed[0].id,token,'retry'])).rows[0].v,true);
  rows=(await db.query('select * from workforce_private.meeting_guest_deliveries')).rows;assert.equal(rows[0].status,'pending');assert.equal(rows[0].attempts,1);
  await meetingCommand(db,id,1,'save',meetingData({title:'تغيير الموعد',external_attendees:[]}));
  assert.equal((await db.query('select count(*)::int n from workforce_private.meeting_guest_deliveries')).rows[0].n,1);
  await db.query('select wf_claim_meeting_guest_deliveries($1,8)',[token]);assert.equal((await db.query('select status from workforce_private.meeting_guest_deliveries')).rows[0].status,'cancelled');
  await db.exec('reset role;set role authenticated;');await assert.rejects(()=>db.query('select * from workforce_private.meeting_guest_deliveries'));
 }finally{await db.close();}
});

test('staff invitation actions stay site-first; external invitation URLs are strictly allowlisted',()=>{
 const base={email:'fixture@example.com',name:'نور',title:'موعد اجتماع',createdAt:'2026-10-27T09:00:00Z'};
 const staff=renderWorkforceEmail({...base,kind:'meeting_event',href:`/employee/meetings?meeting=${id}`});assert.ok(staff.text.includes(`https://nukhba.media/employee/meetings?meeting=${id}`));assert.ok(!staff.html.includes('https://zoom.us/'));
 const guest=renderWorkforceEmail({...base,kind:'meeting_guest',href:'https://zoom.us.evil.test/j/81234567890'});assert.ok(!guest.html.includes('zoom.us.evil'));assert.ok(guest.text.includes('https://nukhba.media/meetings'));
});


test('a lost Zoom create response recovers by site UUID without a second POST',async()=>{
 let stored=null,posts=0;
 const api=new ZoomMeetings('fixture','elitecnnct@gmail.com',async(u,i={})=>{
  const path=new URL(u).pathname;
  if(path.endsWith('/settings'))return Response.json({in_meeting:{screen_sharing:true,who_can_share_screen:'all'}});
  if(i.method==='POST'){posts++;stored={...ready,agenda:JSON.parse(i.body).agenda};throw new Error('lost response');}
  if(i.method==='PATCH')return new Response(null,{status:204});
  if(path.endsWith('/meetings'))return Response.json({meetings:stored?[stored]:[],next_page_token:''});
  return Response.json(stored);
 });
 await assert.rejects(()=>api.publish(id,1,meetingData(),null,async()=>{}));
 assert.equal((await api.publish(id,1,meetingData(),null,async()=>{})).join_url,url);assert.equal(posts,1);
});


test('Basic organizer cannot schedule beyond the real 40-minute limit',async()=>{
 let writes=0;
 const client=await ZoomMeetings.connect({accountId:'fixture',clientId:'fixture',clientSecret:'fixture',hostEmail:'elitecnnct@gmail.com'},async(u,i={})=>{
  if(String(u)==='https://zoom.us/oauth/token')return Response.json({access_token:'fixture'});
  if(i.method&&i.method!=='GET')writes++;
  return Response.json({email:'elitecnnct@gmail.com',status:'active',type:1});
 });
 await assert.rejects(()=>client.publish(id,1,meetingData(),null,async()=>{}),/40/);assert.equal(writes,0);
});

test('running meetings give a clear cancellation action; already deleted meetings are idempotent',async()=>{
 const busy=new ZoomMeetings('fixture','elitecnnct@gmail.com',async()=>Response.json({code:3002},{status:400}));await assert.rejects(()=>busy.cancel(id,zoomId),/أنه/);
 const deleted=new ZoomMeetings('fixture','elitecnnct@gmail.com',async()=>Response.json({code:3001},{status:400}));await deleted.cancel(id,zoomId);assert.equal(await deleted.read(zoomId),null);
});


test('browser entry bypasses the Zoom app launcher and preserves the passcode; emails request site authorization first',()=>{
 const target=meetingBrowserURL(url),parsed=new URL(target);assert.equal(parsed.pathname,'/wc/'+zoomId+'/join');assert.equal(parsed.searchParams.get('pwd'),'exampleToken');assert.equal(parsed.searchParams.get('prefer'),'1');
 assert.equal(meetingBrowserURL('https://meet.google.com/abc-defg-hij'),'https://meet.google.com/abc-defg-hij');assert.equal(meetingBrowserURL('https://zoom.us.evil.test/j/'+zoomId),null);
 for(const role of ['admin/workforce','employee']){
  const rendered=renderWorkforceEmail({kind:'meeting_event',email:'fixture@example.com',name:'عضو الفريق',title:'موعد اجتماع',href:'/'+role+'/meetings?meeting='+id,createdAt:'2026-10-27T10:00:00Z'});
  assert.ok(rendered.text.includes('meeting='+id+'&join=1'));assert.ok(!rendered.html.includes('https://zoom.us/'));assert.ok(rendered.text.includes('الانضمام من المتصفح'));
 }
 const cancelled=renderWorkforceEmail({kind:'meeting_event',email:'fixture@example.com',name:'عضو الفريق',title:'ألغي الاجتماع',href:'/employee/meetings?meeting='+id,createdAt:'2026-10-27T10:00:00Z'});assert.ok(!cancelled.text.includes('join=1'));
});

 test('Zoom readback rejects a shifted provider time instead of publishing an incorrect appointment',async()=>{const api=new ZoomMeetings('fixture','elitecnnct@gmail.com',async(u,i={})=>{if(new URL(u).pathname.endsWith('/settings'))return Response.json({in_meeting:{screen_sharing:true,who_can_share_screen:'all'}});if(i.method==='PATCH')return new Response(null,{status:204});return Response.json({...ready,start_time:'2026-10-24T03:00:00Z'});});await assert.rejects(()=>api.publish(id,1,meetingData(),zoomId,async()=>{}),/توقيت Zoom/);});

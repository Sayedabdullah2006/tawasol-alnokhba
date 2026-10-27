import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMeetingsDB,meetingCommand,meetingData} from './helpers/meetings-db.mjs';
import {ids} from './helpers/work-session-db.mjs';
const migration=n=>readFile(new URL(`../supabase/migrations/${n}.sql`,import.meta.url),'utf8');
async function setup(){const db=await createMeetingsDB();await db.exec('reset role;'+await migration('20261027092037_zoom_meeting_provider')+await migration('20261027113040_meeting_series_workdays_digest')+`;update workforce_private.zoom_meeting_connection set checked_at=now(),client_secret_cipher='fixture';set role service_role;`);return db;}
const data=extra=>meetingData({starts_at:'2026-10-25T10:00:00+03:00',ends_at:'2026-10-25T10:30:00+03:00',...extra});
const series=async(db,frequency='daily',count=8,payload=data())=>(await db.query('select wf_meeting_series($1,$2,$3,$4,$5) v',[ids.admin,crypto.randomUUID(),payload,frequency,count])).rows[0].v;
async function publish(db,m){const p=await meetingCommand(db,m.id,m.version,'prepare');const z='8'+m.id.replace(/[^0-9]/g,'').padEnd(10,'0').slice(0,10);await db.query('select wf_meeting_zoom_checkpoint($1,$2,$3,$4,$5)',[ids.admin,m.id,m.version,p.lease,z]);await meetingCommand(db,m.id,m.version,'finish',{lease:p.lease,meet_url:`https://zoom.us/j/${z}?pwd=fixture`});}
test('daily/monthly series exclude Friday and Saturday, preserve count/Riyadh time and reject weekend starts',async()=>{const db=await setup();try{
 const rows=await series(db);assert.equal(rows.length,8);assert.deepEqual(rows.map(m=>m.starts_at.slice(0,10)),['2026-10-25','2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-11-01','2026-11-02','2026-11-03']);
 const months=await series(db,'monthly',5,data({starts_at:'2026-10-29T10:00:00+03:00',ends_at:'2026-10-29T10:30:00+03:00'}));assert.equal(months.length,5);assert.ok(months.every(m=>![5,6].includes(new Date(m.starts_at).getUTCDay())));assert.ok(months.every(m=>m.starts_at.includes('T07:00:00')));
 await assert.rejects(()=>series(db,'weekly',3,data({starts_at:'2026-10-30T10:00:00+03:00',ends_at:'2026-10-30T10:30:00+03:00'})),/الجمعة والسبت/);
 }finally{await db.close();}});
test('a series emits one notification/email per staff and one external invitation after full success; retries never duplicate',async()=>{const db=await setup();try{
 const rows=await series(db,'daily',4,data({external_attendees:['guest@example.com',ids.noor+'@example.com']}));
 for(const m of rows.slice(0,3))await publish(db,m);
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from workforce_private.meeting_guest_deliveries')).rows[0].n,0);
 await publish(db,rows[3]);
 const notices=(await db.query('select * from wf_notifications')).rows;assert.equal(notices.length,3);assert.ok(notices.every(n=>n.event_key==='meeting-series:'+rows[0].series_id&&n.body.includes('2026-10-28')));
 assert.equal((await db.query('select count(*)::int n from wf_notification_deliveries')).rows[0].n,3);
 assert.equal((await db.query('select count(*)::int n from workforce_private.meeting_guest_deliveries')).rows[0].n,1);
 await db.query('select workforce_private.announce_meeting_series($1)',[rows[0].series_id]);assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,3);
 await db.query('select wf_claim_notification_deliveries(8)');assert.equal((await db.query("select count(*)::int n from wf_notification_deliveries where status='pending'")).rows[0].n,3);
 // A genuine edit still announces the affected occurrence, while leaving the series digest unique.
 await meetingCommand(db,rows[0].id,1,'save',data({title:'موعد معدل'}));await publish(db,{...rows[0],version:2});assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,6);
 await db.exec('reset role;set role authenticated;');await assert.rejects(()=>db.query('select workforce_private.announce_meeting_series($1)',[rows[0].series_id]));
 }finally{await db.close();}});


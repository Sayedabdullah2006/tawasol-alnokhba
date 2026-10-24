import test from 'node:test';import assert from 'node:assert/strict';
import {createMeetingsDB,meetingCommand,meetingData,meetingPresence,scheduled} from './helpers/meetings-db.mjs';
import {ids,command,clock,snapshot} from './helpers/work-session-db.mjs';
import {meetingPresenceLabel} from '../src/lib/workforce/meetings.ts';
const series=async(db,id,data=meetingData(),frequency='weekly',count=4,actor=ids.admin)=>(await db.query('select wf_meeting_series($1,$2,$3,$4,$5) v',[actor,id,data,frequency,count])).rows[0].v;
test('recurring drafts are atomic and idempotent; roles, payload and count are checked without outbound messages',async()=>{
 const db=await createMeetingsDB();try{
  await command(db,{command:'in'});const id=crypto.randomUUID(),rows=await series(db,id,meetingData(),'weekly',4,ids.noor);
  assert.equal(rows.length,4);assert.ok(rows.every(m=>m.series_id===id&&m.status==='draft'&&m.task_id===ids.shared));
  assert.equal(Date.parse(rows[1].starts_at)-Date.parse(rows[0].starts_at),7*86400000);
  assert.deepEqual((await series(db,id,meetingData(),'weekly',4,ids.noor)).map(m=>m.id),rows.map(m=>m.id));
  await assert.rejects(()=>series(db,id,meetingData({title:'تغيير غير مقصود'}),'weekly',4,ids.noor));
  await assert.rejects(()=>series(db,crypto.randomUUID(),meetingData(),'weekly',4,ids.monwa));
  for(const n of [null,1,25])await assert.rejects(()=>series(db,crypto.randomUUID(),meetingData(),'daily',n));
  await assert.rejects(()=>series(db,crypto.randomUUID(),meetingData({participant_ids:[]}), 'daily',4));
  assert.equal((await db.query('select count(*)::int n from wf_meetings')).rows[0].n,4);
  assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from wf_notification_deliveries')).rows[0].n,0);
 }finally{await db.close();}
});
test('monthly recurrence anchors the original day through short months; daily recurrence preserves Riyadh hours',async()=>{
 const db=await createMeetingsDB();try{
  const rows=await series(db,crypto.randomUUID(),meetingData({starts_at:'2027-01-31T10:00:00+03:00',ends_at:'2027-01-31T11:00:00+03:00'}),'monthly',3);
  assert.deepEqual(rows.map(m=>m.starts_at.slice(0,10)),['2027-01-31','2027-02-28','2027-03-31']);
  const daily=await series(db,crypto.randomUUID(),meetingData(),'daily',3);assert.equal(Date.parse(daily[2].starts_at)-Date.parse(daily[0].starts_at),2*86400000);
 }finally{await db.close();}
});
test('each occurrence has independent invitations, reminders, attendance protection and cancellation',async()=>{
 const db=await createMeetingsDB();try{
  const rows=await series(db,crypto.randomUUID(),meetingData(),'daily',2);
  await db.exec("reset role;update workforce_private.google_meeting_connection set refresh_token_cipher='fixture';set role service_role;");
  for(const m of rows){const p=await meetingCommand(db,m.id,1,'prepare');await meetingCommand(db,m.id,1,'finish',{lease:p.lease,event_id:'nf'+m.id.replaceAll('-',''),meet_url:'https://meet.google.com/abc-defg-hij'});}
  const n=await command(db,{command:'in'});await assert.rejects(()=>meetingPresence(db,rows[1].id));await meetingPresence(db,rows[0].id);await clock(db,'11:30');assert.equal((await snapshot(db)).session.id,n.session.id);
  const cancelled=await meetingCommand(db,rows[1].id,1,'prepare_cancel');await meetingCommand(db,rows[1].id,1,'finish',{lease:cancelled.lease});
  assert.equal((await db.query('select status from wf_meetings where id=$1',[rows[0].id])).rows[0].status,'scheduled');
  const notices=(await db.query('select href from wf_notifications')).rows;assert.ok(notices.every(n=>n.href.includes('?meeting=')));
  assert.equal((await db.query('select count(*)::int n from wf_notification_deliveries')).rows[0].n,0);
 }finally{await db.close();}
});
test('presence labels do not infer financial absence and admin joining is recorded',async()=>{
 const db=await createMeetingsDB();try{
  const id=await scheduled(db),m=meetingData();assert.equal(meetingPresenceLabel(m,undefined,Date.parse(m.ends_at)),'لم يسجّل الانضمام');
  await meetingPresence(db,id,'join',ids.admin);assert.equal((await db.query('select count(*)::int n from wf_meeting_attendance where user_id=$1',[ids.admin])).rows[0].n,1);
 }finally{await db.close();}
});

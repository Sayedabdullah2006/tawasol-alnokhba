import test from 'node:test';import assert from 'node:assert/strict';
import {createMeetingsDB,meetingCommand,meetingPresence,meetingData,scheduled} from './helpers/meetings-db.mjs';
import {ids,command,clock,snapshot,at,device} from './helpers/work-session-db.mjs';
import {attendanceEnd,workedSeconds} from '../src/lib/workforce/attendance-summary.ts';
test('manager and Noor manage meetings; Monwa and clients cannot; RLS hides non-participant meetings',async()=>{
 const db=await createMeetingsDB();try{
  await command(db,{command:'in'});const id=crypto.randomUUID();
  const m=await meetingCommand(db,id,0,'save',meetingData({participant_ids:[ids.noor]}),ids.noor);assert.equal(m.status,'draft');
  await assert.rejects(()=>meetingCommand(db,id,1,'save',meetingData(),ids.monwa));
  await assert.rejects(()=>meetingCommand(db,id,0,'save',meetingData()));
  await db.exec('reset role');const client=crypto.randomUUID();await db.query("insert into profiles values($1,'client','عميل')",[client]);await db.exec('set role service_role');
  await assert.rejects(()=>meetingCommand(db,crypto.randomUUID(),0,'save',meetingData(),client));
  for(const [actor,count] of [[ids.admin,1],[ids.noor,1],[ids.monwa,0],[client,0]]){
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role authenticated');
   assert.equal((await db.query('select count(*)::int n from wf_meetings')).rows[0].n,count);
   await assert.rejects(()=>db.query('select wf_meeting_command($1,$2,1,$3,$4)',[actor,id,'save',meetingData()]));await db.exec('reset role;set role service_role');
  }
 }finally{await db.close();}
});
test('joining from attendance device protects heartbeat and confirmation until meeting end; no double time and manual checkout still works',async()=>{
 const db=await createMeetingsDB();try{
  const n=await command(db,{command:'in'}),m=await command(db,{command:'in'},ids.monwa),id=await scheduled(db);
  await assert.rejects(()=>meetingPresence(db,id,'join',ids.noor,'b'.repeat(64)));
  await meetingPresence(db,id);await meetingPresence(db,id);await meetingPresence(db,id,'join',ids.monwa);
  assert.equal((await db.query('select count(*)::int n from wf_work_segments where session_id=$1 and ends_at is null',[n.session.id])).rows[0].n,1);
  await clock(db,'11:30');let own=await snapshot(db);assert.ok(own.session);assert.equal(Date.parse(own.session.next_confirmation_at),Date.parse(at('12:00')));
  assert.equal(attendanceEnd(own.session,Date.parse(at('11:30'))),Date.parse(at('11:30')));
  await assert.rejects(()=>command(db,{command:'break',session_id:n.session.id}));
  await assert.rejects(()=>command(db,{command:'task',session_id:n.session.id,task_id:ids.shared}));
  assert.equal(workedSeconds([{...own.session,checked_out:null}],Date.parse(at('09:00')),Date.parse(at('12:00')),Date.parse(at('11:30'))),150*60);
  const out=await command(db,{command:'out',session_id:m.session.id},ids.monwa);assert.equal(out.session,null);
  await clock(db,'12:06');own=await snapshot(db);assert.equal(own.session,null);assert.equal(Date.parse(own.lastSession.checked_out),Date.parse(at('12:00')));
 }finally{await db.close();}
});
test('ordinary sessions do not receive meeting protection, and invitation alone is insufficient',async()=>{
 const db=await createMeetingsDB();try{
  await command(db,{command:'in'});await scheduled(db);await clock(db,'09:06');
  assert.equal((await snapshot(db)).session,null);
 }finally{await db.close();}
});
test('paid break, late start, confirmation due, meeting bounds and return to work retain normal safeguards',async()=>{
 const db=await createMeetingsDB();try{
  const s=await command(db,{command:'in'}),id=await scheduled(db);await command(db,{command:'break',session_id:s.session.id});
  await assert.rejects(()=>meetingPresence(db,id));await command(db,{command:'resume',session_id:s.session.id});
  await meetingPresence(db,id);await clock(db,'09:20');await meetingPresence(db,id,'leave');await meetingPresence(db,id,'leave');
  await command(db,{command:'break',session_id:s.session.id});await command(db,{command:'resume',session_id:s.session.id});
  await db.query('update wf_attendance_sessions set next_confirmation_at=$1,last_seen_at=$1 where id=$2',[at('09:20'),s.session.id]);
  await assert.rejects(()=>meetingPresence(db,id));await command(db,{command:'confirm',session_id:s.session.id});await meetingPresence(db,id);
  await clock(db,'12:01');await assert.rejects(()=>meetingPresence(db,id));
 }finally{await db.close();}
});
test('meeting cancellation and participant removal release protection; sync leases and failed retries avoid duplicate inbox/mail',async()=>{
 const db=await createMeetingsDB();try{
  await command(db,{command:'in'});const id=await scheduled(db);await meetingPresence(db,id);
  assert.equal((await db.query('select count(*)::int n from wf_notification_deliveries')).rows[0].n,0);
  const edit=await meetingCommand(db,id,1,'save',meetingData({participant_ids:[ids.monwa,ids.admin]}));
  const prepare=await meetingCommand(db,id,edit.version,'prepare');await assert.rejects(()=>meetingCommand(db,id,edit.version,'prepare'));
  await meetingCommand(db,id,edit.version,'fail',{lease:prepare.lease});const retry=await meetingCommand(db,id,edit.version,'prepare');
  await meetingCommand(db,id,edit.version,'finish',{lease:retry.lease,event_id:'fixture',meet_url:'https://meet.google.com/abc-defg-hij'});
  const current=await snapshot(db);assert.equal(Date.parse(current.session.meeting_until),Date.parse(at('09:00')));
  const cancel=await meetingCommand(db,id,edit.version,'prepare_cancel');await meetingCommand(db,id,edit.version,'finish',{lease:cancel.lease});
  await assert.rejects(()=>meetingPresence(db,id));
  assert.equal((await db.query('select count(*)::int n from wf_notification_deliveries')).rows[0].n,0);
 }finally{await db.close();}
});
test('reminders deduplicate and cancel queued mail after reschedule; final cutoff bounds long meetings',async()=>{
 const db=await createMeetingsDB();try{
  const id=await scheduled(db,meetingData({starts_at:at('09:15'),ends_at:at('10:00')}));
  const generate=async()=>(await db.query('select wf_generate_notification_reminders($1) v',[at('09:00')])).rows[0].v.created;
  assert.equal(await generate(),3);assert.equal(await generate(),0);
  assert.equal((await db.query('select count(*)::int n from wf_notification_deliveries')).rows[0].n,3);
  const cancel=await meetingCommand(db,id,1,'prepare_cancel');await meetingCommand(db,id,1,'finish',{lease:cancel.lease});
  assert.equal((await db.query('select wf_claim_notification_deliveries(8) n')).rows[0].n,0);
  await clock(db,'17:30');const s=await command(db,{command:'in'});const late=await scheduled(db,meetingData({starts_at:at('17:00'),ends_at:at('19:00')}));
  const joined=await meetingPresence(db,late);assert.equal(Date.parse(joined.protected_until),Date.parse(at('18:00')));
  await clock(db,'18:01');const ended=await snapshot(db);assert.equal(ended.session,null);assert.equal(Date.parse(ended.lastSession.checked_out),Date.parse(at('18:00')));
 }finally{await db.close();}
});
test('abandoned or ambiguous Google attempts remain recoverable and cannot silently discard a possible invitation',async()=>{
 const db=await createMeetingsDB();try{
  const id=crypto.randomUUID();await meetingCommand(db,id,0,'save',meetingData());
  await assert.rejects(()=>meetingCommand(db,id,1,'finish',{lease:null}));
  await db.exec("reset role;update workforce_private.google_meeting_connection set refresh_token_cipher='fixture';set role service_role;");
  const first=await meetingCommand(db,id,1,'prepare');await clock(db,'09:03');
  const second=await meetingCommand(db,id,1,'prepare');assert.notEqual(first.lease,second.lease);
  await assert.rejects(()=>meetingCommand(db,id,1,'finish',{lease:first.lease}));
  await meetingCommand(db,id,1,'fail',{lease:second.lease});
  await assert.rejects(()=>meetingCommand(db,id,1,'cancel_draft'));
  const changed=await meetingCommand(db,id,1,'save',meetingData({title:'تحديث بعد انقطاع الاتصال'}));assert.equal(changed.sync_state,'error');
  await assert.rejects(()=>meetingCommand(db,id,changed.version,'cancel_draft'));
  const cancel=await meetingCommand(db,id,changed.version,'prepare_cancel');
  const ended=await meetingCommand(db,id,changed.version,'finish',{lease:cancel.lease});assert.equal(ended.status,'cancelled');
 }finally{await db.close();}
});

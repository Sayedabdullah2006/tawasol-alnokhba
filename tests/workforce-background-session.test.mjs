import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createOvertimeDB} from './helpers/overtime-db.mjs';import {ids,command,snapshot} from './helpers/work-session-db.mjs';
const setTime=(db,time)=>db.query("select set_config('test.clock',$1,false)",[`2026-10-24T${time}+03:00`]);
async function setup(){
 const db=await createOvertimeDB();await db.exec(`reset role;
 create function workforce_private.fixed_paid_holiday(date) returns text language sql as $$select null::text$$;
 create function public.wf_comments_command(p_actor uuid,p_body text) returns void language plpgsql as $$begin return;end$$;
 alter table wf_attendance_settings add column if not exists schedule_mode text default 'flexible';`);
 for(const name of ['20261023022342_three_daily_work_confirmations','20261023205919_attendance_action_gate','20261024061024_six_pm_attendance_cutoff'])await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'));
 await db.exec('set role service_role');return db;
}
test('opening the reminder on another device cannot confirm or keep the session alive, but the original browser can confirm',async()=>{
 const db=await setup();try{
 for(const actor of [ids.noor,ids.monwa]){
  await setTime(db,'12:59:00');const start=await command(db,{command:'in'},actor);const id=start.session.id;
  await setTime(db,'13:00:00');
  for(const name of ['confirm','heartbeat'])await assert.rejects(()=>command(db,{command:name,session_id:id,device:'b'.repeat(64)},actor),{code:'42501'});
  let current=await snapshot(db,actor);assert.equal(current.session.last_seen_at,start.session.last_seen_at);assert.equal(current.session.next_confirmation_at,start.session.next_confirmation_at);
  current=await command(db,{command:'confirm',session_id:id},actor);
  assert.equal(new Date(current.session.next_confirmation_at).toISOString(),'2026-10-24T12:00:00.000Z');
  await command(db,{command:'out',session_id:id},actor);
 }
 }finally{await db.close()}
});
test('background connection needs no clicks or task switching; delayed heartbeats below five minutes keep both employees present',async()=>{
 const db=await setup();try{
 for(const actor of [ids.noor,ids.monwa]){
  await setTime(db,'12:00:00');let d=await command(db,{command:'in'},actor);const id=d.session.id;
  for(const time of ['12:01:00','12:04:59','12:08:58','12:12:57','12:16:56']){
   await setTime(db,time);d=await command(db,{command:'heartbeat',session_id:id},actor);
   assert.equal(d.session.id,id);assert.equal(d.session.checked_out,null);
  }
  assert.equal(Number(d.todaySeconds),16*60+56);
  await command(db,{command:'out',session_id:id},actor);
 }
 }finally{await db.close()}
});
test('missing confirmation is distinct from disconnect; confirmation succeeds through the five-minute grace while early/repeated confirmation is rejected',async()=>{
 const db=await setup();try{
  await setTime(db,'10:59:00');let d=await command(db,{command:'in'});const id=d.session.id;
  await assert.rejects(()=>command(db,{command:'confirm',session_id:id}),/لم يحن/);
  for(const time of ['11:00:00','11:01:00','11:02:00','11:03:00','11:04:59']){await setTime(db,time);d=await command(db,{command:'heartbeat',session_id:id});assert.ok(d.session);}
  d=await command(db,{command:'confirm',session_id:id});assert.equal(new Date(d.session.next_confirmation_at).toISOString(),'2026-10-24T10:00:00.000Z');
  await assert.rejects(()=>command(db,{command:'confirm',session_id:id}),/لم يحن/);
  await command(db,{command:'out',session_id:id});
  await setTime(db,'12:59:00');d=await command(db,{command:'in'});const second=d.session.id;
  for(const time of ['13:00:00','13:01:00','13:02:00','13:03:00','13:04:59']){await setTime(db,time);await command(db,{command:'heartbeat',session_id:second});}
  await setTime(db,'13:05:00');d=await command(db,{command:'heartbeat',session_id:second});
  assert.equal(d.session,null);assert.equal(d.lastSession.close_reason,'confirmation_missed');assert.equal(new Date(d.lastSession.checked_out).toISOString(),'2026-10-24T10:00:00.000Z');
 }finally{await db.close()}
});
test('paid break defers confirmation until resume; a truly silent connection closes at last heartbeat and never reopens itself',async()=>{
 const db=await setup();try{
  await setTime(db,'10:59:00');let d=await command(db,{command:'in'});const id=d.session.id;
  await command(db,{command:'break',session_id:id});
  await setTime(db,'11:28:00');d=await command(db,{command:'heartbeat',session_id:id});assert.ok(d.session.break_started_at);
  await setTime(db,'11:29:00');d=await command(db,{command:'resume',session_id:id});
  assert.equal(d.session.break_started_at,null);assert.equal(new Date(d.session.next_confirmation_at).toISOString(),'2026-10-24T08:29:00.000Z');
  d=await command(db,{command:'confirm',session_id:id});assert.equal(new Date(d.session.next_confirmation_at).toISOString(),'2026-10-24T10:00:00.000Z');
  await setTime(db,'11:34:00');d=await snapshot(db);assert.equal(d.session,null);assert.equal(d.lastSession.close_reason,'connection_lost');
  assert.equal(new Date(d.lastSession.checked_out).toISOString(),'2026-10-24T08:29:00.000Z');
  d=await command(db,{command:'heartbeat',session_id:id});assert.equal(d.session,null);
  assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close()}
});

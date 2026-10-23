import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWorkDB,ids,command,snapshot,clock,at} from './helpers/work-session-db.mjs';
async function setup(){
 const db=await createWorkDB();
 await db.exec('reset role; create table wf_paid_calendar_days(day date);');
 const holidays=await readFile(new URL('../supabase/migrations/20261022233702_fixed_paid_holidays.sql',import.meta.url),'utf8');
 await db.exec(holidays.slice(0,holidays.indexOf('create or replace function public.wf_work_command')));
 await db.exec(await readFile(new URL('../supabase/migrations/20261023022342_three_daily_work_confirmations.sql',import.meta.url),'utf8'));
 await db.exec('set role service_role');return db;
}
const time=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
test('Noor and Monwa get only three confirmations, with full paid day and unchanged 17:00 cutoff',async()=>{
 const db=await setup();try{
 const sessions=new Map();const counts=new Map();
 for(const actor of [ids.noor,ids.monwa]){const s=await command(db,{command:'in'},actor);sessions.set(actor,s.session.id);counts.set(actor,[]);assert.equal(Date.parse(s.session.next_confirmation_at),Date.parse(at('11:00')));}
 for(let m=541;m<=1020;m++){
  await clock(db,time(m));
  for(const actor of [ids.noor,ids.monwa]){
   let s=await command(db,{command:'heartbeat',session_id:sessions.get(actor)},actor);
   if(s.session&&Date.parse(s.now)>=Date.parse(s.session.next_confirmation_at)){
    counts.get(actor).push(time(m));s=await command(db,{command:'confirm',session_id:s.session.id},actor);
   }
  }
 }
 for(const actor of [ids.noor,ids.monwa]){
  assert.deepEqual(counts.get(actor),['11:00','13:00','15:00']);const s=await snapshot(db,actor);
  assert.equal(s.session,null);assert.equal(s.lastSession.close_reason,'day_end');assert.equal(s.todaySeconds,8*3600);
 }
 }finally{await db.close()}
});
test('late entry and reconnect skip past slots; missed confirmation keeps five-minute grace',async()=>{
 const db=await setup();try{
 await clock(db,'12:57');let s=await command(db,{command:'in'});let id=s.session.id;
 assert.equal(Date.parse(s.session.next_confirmation_at),Date.parse(at('13:00')));
 for(let m=778;m<=784;m++){await clock(db,time(m));s=await command(db,{command:'heartbeat',session_id:id});}
 assert.ok(s.session);await clock(db,'13:05');s=await command(db,{command:'heartbeat',session_id:id});
 assert.equal(s.session,null);assert.equal(s.lastSession.close_reason,'confirmation_missed');assert.equal(Date.parse(s.lastSession.checked_out),Date.parse(at('13:00')));
 s=await command(db,{command:'in'});id=s.session.id;assert.equal(Date.parse(s.session.next_confirmation_at),Date.parse(at('15:00')));
 await clock(db,'13:06');await command(db,{command:'heartbeat',session_id:id});await clock(db,'13:11');s=await snapshot(db);
 assert.equal(s.session,null);assert.equal(s.lastSession.close_reason,'connection_lost');
 await clock(db,'16:00');s=await command(db,{command:'in'});assert.equal(Date.parse(s.session.next_confirmation_at),Date.parse(at('17:00')));
 }finally{await db.close()}
});
test('paid break spanning a confirmation defers it until return without extending 17:00',async()=>{
 const db=await setup();try{
 await clock(db,'10:50');let s=await command(db,{command:'in'});const id=s.session.id;
 await command(db,{command:'break',session_id:id});await clock(db,'11:20');s=await command(db,{command:'resume',session_id:id});
 assert.equal(s.breakUsedSeconds,1800);assert.equal(Date.parse(s.session.next_confirmation_at),Date.parse(at('11:20')));
 s=await command(db,{command:'confirm',session_id:id});assert.equal(Date.parse(s.session.next_confirmation_at),Date.parse(at('13:00')));
 assert.equal(Date.parse(s.session.cutoff_at),Date.parse(at('17:00')));
 const denied=await db.query("select has_function_privilege('authenticated','workforce_private.next_daily_work_confirmation(date,timestamptz)','execute') allowed");assert.equal(denied.rows[0].allowed,false);
 }finally{await db.close()}
});

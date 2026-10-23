import test from 'node:test';import assert from 'node:assert/strict';
import {createWorkDB,ids,command,snapshot} from './helpers/work-session-db.mjs';
import {isFriday} from '../src/lib/workforce/work-session.ts';
const tick=(db,value)=>db.query("select set_config('test.clock',$1,false)",[value]);

test('Friday blocks both punches for Noor and Monwa using Riyadh time including UTC boundaries',async()=>{
 const db=await createWorkDB();try{
 await db.exec("set timezone='UTC';");
 for(const now of ['2026-10-22T21:00:00Z','2026-10-23T09:00:00+03:00','2026-10-23T20:59:59Z']){
  await tick(db,now);assert.equal(isFriday(now),true);
  for(const actor of [ids.noor,ids.monwa])for(const name of ['in','out'])await assert.rejects(()=>command(db,{command:name},actor),/الجمعة إجازة/);
 }
 assert.equal((await db.query('select count(*)::int n from wf_attendance_sessions')).rows[0].n,0);
 await tick(db,'2026-10-23T21:00:00Z');assert.equal(isFriday('2026-10-23T21:00:00Z'),false);
 const started=await command(db,{command:'in'});assert.ok(started.session);await command(db,{command:'out',session_id:started.session.id});
 }finally{await db.close();}
});

test('Friday retries and legacy checkout are rejected; expired Thursday sessions close at their own deadline',async()=>{
 const db=await createWorkDB();try{
 await tick(db,'2026-10-22T16:59:00+03:00');const key=crypto.randomUUID(),s=await command(db,{command:'in',request_key:key});
 await tick(db,'2026-10-23T09:00:00+03:00');
 await assert.rejects(()=>command(db,{command:'in',request_key:key}),/الجمعة إجازة/);
 await assert.rejects(()=>command(db,{command:'out',session_id:s.session.id}),/الجمعة إجازة/);
 const d=await snapshot(db);assert.equal(d.session,null);assert.ok(Date.parse(d.lastSession.checked_out)<=Date.parse('2026-10-22T17:00:00+03:00'));
 await db.query("insert into wf_attendance_sessions(id,employee_id,business_date,checked_in,source) values(gen_random_uuid(),$1,'2026-10-22','2026-10-22T13:00:00+03:00','clock')",[ids.em]);
 const legacy=await snapshot(db,ids.monwa);assert.equal(legacy.session.policy_version,0);
 await assert.rejects(()=>command(db,{command:'out',session_id:legacy.session.id},ids.monwa),/الجمعة إجازة/);
 assert.equal((await snapshot(db,ids.monwa)).session.checked_out,null);
 }finally{await db.close();}
});

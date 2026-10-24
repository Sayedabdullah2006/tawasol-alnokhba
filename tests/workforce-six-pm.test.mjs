import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createOvertimeDB} from './helpers/overtime-db.mjs';
import {ids,command,clock} from './helpers/work-session-db.mjs';

async function setup(){
 const db=await createOvertimeDB();
 await db.exec(`reset role;
 create function workforce_private.fixed_paid_holiday(date) returns text language sql as $$select null::text$$;
 create function public.wf_comments_command(p_actor uuid,p_body text) returns void language plpgsql as $$begin return;end$$;
 alter table wf_attendance_settings add column if not exists schedule_mode text default 'flexible';
 `);
 for(const name of ['20261023022342_three_daily_work_confirmations','20261023205919_attendance_action_gate','20261024091000_six_pm_attendance_cutoff'])
  await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'));
 await db.exec('set role service_role');return db;
}
test('both employees may check in after five; session, confirmation fallback and close stop exactly at six',async()=>{
 const db=await setup();try{
  assert.equal((await db.query("select workforce_private.regular_work_end('2026-10-23')::text old, workforce_private.regular_work_end('2026-10-24')::text current")).rows[0].old,'17:00:00');
  for(const actor of [ids.noor,ids.monwa]){
   await clock(db,'17:55');let d=await command(db,{command:'in'},actor);const id=d.session.id;
   assert.equal(new Date(d.session.cutoff_at).toISOString(),'2026-10-24T15:00:00.000Z');
   assert.equal(d.session.next_confirmation_at,d.session.cutoff_at);
   await clock(db,'17:59');await command(db,{command:'heartbeat',session_id:id},actor);
   await clock(db,'18:01');d=await command(db,{command:'heartbeat',session_id:id},actor);
   assert.equal(d.session,null);assert.equal(d.lastSession.close_reason,'day_end');assert.equal(Number(d.todaySeconds),300);
   await assert.rejects(()=>command(db,{command:'in'},actor),/نهاية الدوام/);
  }
  assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close()}
});
test('payroll settles the current day at six, retains an eight-hour target, and approved overtime stays separate',async()=>{
 const db=await setup();try{
  await clock(db,'17:59');
  let p=(await db.query("select workforce_private.attendance_payroll($1,'2026-10-01') p",[ids.en])).rows[0].p;
  const before=Number(p.required_seconds);
  await clock(db,'18:00');p=(await db.query("select workforce_private.attendance_payroll($1,'2026-10-01') p",[ids.en])).rows[0].p;
  assert.equal(Number(p.required_seconds)-before,8*3600);
  await db.query("insert into wf_employee_requests(employee_id,kind,status,title,starts_at,ends_at) values($1,'overtime','approved','مراجعة','2026-10-24T18:00:00+03:00','2026-10-24T19:00:00+03:00')",[ids.en]);
  await clock(db,'18:10');const d=await command(db,{command:'in'});assert.ok(d.session.overtime_request_id);
  assert.equal(new Date(d.session.cutoff_at).toISOString(),'2026-10-24T16:00:00.000Z');
  assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close()}
});
test('overtime cannot overlap the extended ordinary window; historical cutoff and eight-hour target remain intact',async()=>{
 const db=await setup();try{
  await assert.rejects(()=>db.query("insert into wf_employee_requests(employee_id,kind,status,title,starts_at,ends_at) values($1,'overtime','pending','مراجعة','2026-10-24T17:30:00+03:00','2026-10-24T18:30:00+03:00')",[ids.en]),/فترة الدوام/);
  await db.query("insert into wf_employee_requests(employee_id,kind,status,title,starts_at,ends_at) values($1,'overtime','pending','مراجعة','2026-10-24T18:00:00+03:00','2026-10-24T19:00:00+03:00')",[ids.en]);
  await db.query("select set_config('test.clock','2026-10-22T16:59:00+03:00',false)");
  const d=await command(db,{command:'in'});assert.equal(new Date(d.session.cutoff_at).toISOString(),'2026-10-22T14:00:00.000Z');
  const p=(await db.query("select workforce_private.attendance_payroll($1,'2026-10-01') p",[ids.en])).rows[0].p;
  assert.ok(p);assert.equal((await db.query('select coalesce(daily_minutes,480)::int minutes from wf_attendance_settings limit 1')).rows[0]?.minutes??480,480);
 }finally{await db.close()}
});

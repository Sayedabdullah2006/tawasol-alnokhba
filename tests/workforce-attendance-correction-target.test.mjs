import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLeaveSummaryDB} from './helpers/leave-summary-db.mjs';
import {ids} from './helpers/work-session-db.mjs';
import {workedSeconds} from '../src/lib/workforce/attendance-summary.ts';
const migration=new URL('../supabase/migrations/20261026173242_resolve_attendance_correction_overlap.sql',import.meta.url);
const time=value=>`2026-10-18T${value}+03:00`;
async function setup(){
 const db=await createLeaveSummaryDB();
 await db.exec("reset role;alter table wf_attendance_sessions add column credit_request_id uuid,add column overtime_request_id uuid;");
 await db.exec(await readFile(migration,'utf8'));
 await db.exec('set role service_role;');return db;
}
const period=(db,start='17:11:18',end='17:11:51',employee=ids.en)=>db.query(
 "insert into wf_attendance_sessions(id,employee_id,business_date,checked_in,checked_out,source,updated_by) values(gen_random_uuid(),$1,'2026-10-18',$2,$3,'clock',$4) returning id",
 [employee,time(start),end?time(end):null,ids.noor]).then(r=>r.rows[0].id);
const request=(db,start='15:10:00',end='19:00:00',linked=null,employee=ids.en)=>db.query(
 "insert into wf_employee_requests(id,employee_id,kind,status,starts_at,ends_at,attendance_session_id) values(gen_random_uuid(),$1,'attendance-correction','pending',$2,$3,$4) returning id",
 [employee,time(start),time(end),linked]).then(r=>r.rows[0].id);
const decide=(db,id,actor=ids.admin,decision='approved',version=1)=>db.query(
 "select wf_decide_employee_request($1,$2,$3,$4,'تصحيح حضور معتمد')",[id,actor,version,decision]);

test('Noor first-day correction updates the unique overlapping record on approval only; no duplicate hours',async()=>{
 const db=await setup();try{
  const existing=await period(db),id=await request(db);
  assert.equal((await db.query('select attendance_session_id from wf_employee_requests where id=$1',[id])).rows[0].attendance_session_id,null);
  assert.equal((await db.query('select count(*)::int n from wf_attendance_sessions')).rows[0].n,1);
  await decide(db,id);
  const r=(await db.query('select * from wf_employee_requests where id=$1',[id])).rows[0];
  assert.equal(r.status,'approved');assert.equal(r.attendance_session_id,existing);
  const rows=(await db.query('select * from wf_attendance_sessions')).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].id,existing);
  assert.equal(Date.parse(rows[0].checked_in),Date.parse(time('15:10:00')));
  assert.equal(Date.parse(rows[0].checked_out),Date.parse(time('19:00:00')));
  assert.equal(workedSeconds(rows,Date.parse(time('00:00:00')),Date.parse(time('23:59:59')),Date.parse(time('23:59:59'))),230*60);
  assert.equal(rows[0].source,'correction');
  await assert.rejects(()=>decide(db,id,ids.admin,'approved',r.version),/تمت معالجة/);
  assert.equal((await db.query('select count(*)::int n from wf_attendance_sessions')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close()}
});
test('two overlapping records require an explicit, non-overlapping correction and retain all original data',async()=>{
 const db=await setup();try{
  const a=await period(db,'09:00:00','10:00:00');await period(db,'11:00:00','12:00:00');
  const id=await request(db,'08:30:00','12:30:00');
  await assert.rejects(()=>decide(db,id),/2 سجلات.*09:00:00.*11:00:00/);
  assert.equal((await db.query('select status from wf_employee_requests where id=$1',[id])).rows[0].status,'pending');
  assert.equal((await db.query('select count(*)::int n from wf_attendance_sessions')).rows[0].n,2);
  const precise=await request(db,'08:30:00','10:30:00',a);await decide(db,precise);
  assert.equal((await db.query('select count(*)::int n from wf_attendance_sessions')).rows[0].n,2);
 }finally{await db.close()}
});
test('no overlap adds missing period; touching endpoints do not count as overlap; another employee cannot be modified',async()=>{
 const db=await setup();try{
  const own=await period(db,'09:00:00','10:00:00'),other=await period(db,'12:00:00','13:00:00',ids.em);
  const id=await request(db,'10:00:00','11:00:00');await decide(db,id);
  assert.equal((await db.query('select count(*)::int n from wf_attendance_sessions where employee_id=$1',[ids.en])).rows[0].n,2);
  const bad=await request(db,'12:00:00','13:00:00',other);await assert.rejects(()=>decide(db,bad),/غير متاح/);
  const self=await request(db,'08:30:00','10:30:00',own);await assert.rejects(()=>decide(db,self,ids.noor));
  assert.equal((await db.query("select has_function_privilege('authenticated','workforce_private.attendance_correction_target(uuid,uuid,timestamptz,timestamptz)','execute') n")).rows[0].n,false);
 }finally{await db.close()}
});
test('open sessions and approved credit/overtime ledgers are never implicitly overwritten; rejection is inert',async()=>{
 const db=await setup();try{
  const open=await period(db,'17:00:00',null);const id=await request(db);
  await assert.rejects(()=>decide(db,id),/حضور مفتوح/);
  await decide(db,id,ids.admin,'rejected');
  assert.equal((await db.query('select checked_out from wf_attendance_sessions where id=$1',[open])).rows[0].checked_out,null);
  await db.exec("reset role;update wf_attendance_sessions set checked_out=checked_in+interval '1 minute',credit_request_id=gen_random_uuid();set role service_role;");
  const credit=await request(db);await assert.rejects(()=>decide(db,credit),/ساعات مفقودة/);
  const explicit=await request(db,'15:10:00','19:00:00',open);await assert.rejects(()=>decide(db,explicit),/ساعات مفقودة/);
 }finally{await db.close()}
});

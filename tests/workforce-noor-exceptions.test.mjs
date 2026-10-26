import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMeetingsDB,scheduled,meetingData,meetingPresence} from './helpers/meetings-db.mjs';
import {ids,command,snapshot} from './helpers/work-session-db.mjs';
import {createPerformanceDB,addTask,ids as taskIds,version} from './helpers/performance-db.mjs';
import {workedSeconds} from '../src/lib/workforce/attendance-summary.ts';
const migration=await readFile(new URL('../supabase/migrations/20261026131357_noor_flexible_attendance_task_permissions.sql',import.meta.url),'utf8');
const taskStart=migration.indexOf('-- Task permission patch'),dataStart=migration.indexOf('-- Apply only');
const at=time=>`2026-10-26T${time}:00+03:00`;
const clock=(db,time)=>db.query("select set_config('test.clock',$1,false)",[at(time)]);
async function setup(){
 const db=await createMeetingsDB();
 await db.exec(`reset role;alter table wf_employees add column email text;
 update wf_employees set email=case when id='${ids.en}' then 'noormahmoudbajunaid@hotmail.com' else 'monwa@example.com' end;
 create function workforce_private.fixture_employment_notice() returns trigger language plpgsql as $$begin raise exception 'unexpected notification';end$$;
 create trigger wf_employment_change_notifications after update on wf_employees for each row execute function workforce_private.fixture_employment_notice();
 `);
 // The complete attendance migration, excluding the task seam tested separately
 // against the full task-command fixture below. No production env/network exists.
 await db.exec(migration.slice(0,taskStart)+migration.slice(dataStart));
 await db.exec("set role service_role");
 await clock(db,'09:00');return db;
}
test('only Noor works after six and can control one attendance from phone or laptop',async()=>{
 const db=await setup();try{
  await clock(db,'18:30');
  let d=await command(db,{command:'in'});const session=d.session.id;
  assert.deepEqual(d.attendancePolicy,{anyDevice:true,flexibleDay:true});
  assert.equal(Date.parse(d.session.cutoff_at),Date.parse('2026-10-27T00:00:00+03:00'));
  assert.equal(Date.parse(d.session.next_confirmation_at),Date.parse(at('20:30')));
  await assert.rejects(()=>command(db,{command:'in'},ids.monwa),/نهاية الدوام/);
  await assert.rejects(()=>command(db,{command:'in',device:'b'.repeat(64)}),/مسجل/);
  await clock(db,'18:31');
  await command(db,{command:'activity',session_id:session,device:'b'.repeat(64),title:'متابعة العملاء'});
  await clock(db,'18:32');d=await command(db,{command:'out',session_id:session,device:'b'.repeat(64)});
  assert.equal(Number(d.todaySeconds),120);assert.equal(d.session,null);
  assert.equal((await db.query('select count(*)::int n from wf_attendance_sessions')).rows[0].n,1);
  await clock(db,'17:00');d=await command(db,{command:'in'},ids.monwa);
  assert.deepEqual(d.attendancePolicy,{anyDevice:false,flexibleDay:false});
  await assert.rejects(()=>command(db,{command:'out',session_id:d.session.id,device:'b'.repeat(64)},ids.monwa));
  assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close()}
});
test('Noor earns eight regular hours across six, keeps paid break and three confirmations; payroll matches',async()=>{
 const db=await setup();try{
  await clock(db,'14:00');let d=await command(db,{command:'in'});const session=d.session.id;let confirmations=0;
  for(let minute=14*60+1;minute<=22*60;minute++){
   const time=`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
   await clock(db,time);
   d=await command(db,{command:'heartbeat',session_id:session,device:(minute%2?'a':'b').repeat(64)});
   if(minute===15*60) d=await command(db,{command:'break',session_id:session});
   if(minute===15*60+30) d=await command(db,{command:'resume',session_id:session});
   if(d.session&&!d.session.break_started_at&&Date.parse(d.now)>=Date.parse(d.session.next_confirmation_at)){
    d=await command(db,{command:'confirm',session_id:session});confirmations++;
   }
  }
  d=await command(db,{command:'out',session_id:session});assert.equal(confirmations,3);
  assert.equal(d.breakUsedSeconds,1800);assert.equal(Number(d.todaySeconds),8*3600);
  const periods=(await db.query('select * from wf_attendance_sessions')).rows;
  assert.equal(workedSeconds(periods,Date.parse(at('00:00')),Date.parse('2026-10-27T00:00:00+03:00'),Date.parse(at('22:00'))),28800);
  await db.query("select set_config('test.clock','2026-10-27T00:01:00+03:00',false)");
  const p=(await db.query("select workforce_private.attendance_payroll($1,'2026-10-01') p",[ids.en])).rows[0].p;
  assert.ok(!p.missing_days.some(day=>day.day==='2026-10-26'));
  assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close()}
});
test('historical cutoff, Friday and disconnection stay enforced; midnight closes only the current day',async()=>{
 const db=await setup();try{
  assert.deepEqual((await db.query("select workforce_private.employee_work_end($1,'2026-10-25')::text old,workforce_private.employee_work_end($1,'2026-10-26')::text current",[ids.en])).rows[0],{old:'18:00:00',current:'24:00:00'});
  await clock(db,'22:00');let d=await command(db,{command:'in'});await clock(db,'22:06');d=await snapshot(db);
  assert.equal(d.session,null);assert.equal(d.lastSession.close_reason,'connection_lost');
  await clock(db,'23:58');d=await command(db,{command:'in'});const id=d.session.id;
  await clock(db,'23:59');await command(db,{command:'heartbeat',session_id:id});
  await db.query("select set_config('test.clock','2026-10-27T00:01:00+03:00',false)");
  d=await snapshot(db);assert.equal(d.session,null);assert.equal(d.lastSession.close_reason,'day_end');
  assert.equal(Date.parse(d.lastSession.checked_out),Date.parse('2026-10-27T00:00:00+03:00'));
  await db.query("select set_config('test.clock','2026-10-30T12:00:00+03:00',false)");
  await assert.rejects(()=>command(db,{command:'in'}),/الجمعة/);
  assert.equal((await db.query("select has_function_privilege('authenticated','workforce_private.employee_any_device(uuid)','execute') allowed")).rows[0].allowed,false);
 }finally{await db.close()}
});
test('Noor can join linked meetings from her other device; Monwa cannot bypass her device',async()=>{
 const db=await setup();try{
  const m=await scheduled(db,meetingData({starts_at:at('18:30'),ends_at:at('19:00')}));
  await clock(db,'18:30');const d=await command(db,{command:'in'});
  const joined=await meetingPresence(db,m,'join',ids.noor,'b'.repeat(64));assert.ok(joined.protected_until);
  await meetingPresence(db,m,'leave',ids.noor,'b'.repeat(64));
  await command(db,{command:'out',session_id:d.session.id});
 }finally{await db.close()}
});
test('Noor can edit, archive and silently delete delegated tasks; Monwa cannot delete',async()=>{
 const db=await createPerformanceDB();try{
  await db.exec("reset role;alter table wf_notification_deliveries add column status text default 'pending',add column last_error text;create table wf_task_events(task_id uuid,actor_id uuid,action text,changed_fields text[],summary text);grant insert,select on wf_task_events to service_role;");
  await db.exec(migration.slice(0,migration.indexOf('create function workforce_private.employee_work_end')));
  await db.exec(migration.slice(taskStart,dataStart));
  await db.query('update wf_employees set can_delete_tasks=true where user_id=$1',[taskIds.noor]);
  await db.exec('set role service_role;');
  const id=await addTask(db,{owner:taskIds.me});
  const act=async(actor,command,payload={})=>db.query('select wf_task_command($1,$2,$3,$4,$5,$6)',[actor,id,await version(db,id),command,payload,crypto.randomUUID()]);
  await act(taskIds.noor,'edit',{title:'مهمة معدلة'});
  await act(taskIds.noor,'archive',{archived:true});await act(taskIds.noor,'archive',{archived:false});
  await assert.rejects(()=>act(taskIds.monwa,'delete'),/الحذف/);
  const before=(await db.query('select count(*)::int n from wf_notifications')).rows[0].n;
  await act(taskIds.noor,'delete');
  assert.ok((await db.query('select deleted_at from wf_tasks where id=$1',[id])).rows[0].deleted_at);
  assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,before);
 }finally{await db.close()}
});

import test from 'node:test';import assert from 'node:assert/strict';
import {createWeeklyDB,addPeriod,setTime,weekly} from './helpers/weekly-hours-db.mjs';
import {ids} from './helpers/work-session-db.mjs';
import {payrollSnapshot} from './helpers/payroll-attendance-db.mjs';
import {summarizeAttendance,liveAttendance} from '../src/lib/workforce/attendance-summary.ts';
const day=(v,date)=>v.days.find(d=>d.day===date);
test('Noor and Monwa: same-week surplus offsets a short day once; payroll reduces by credited hours only',async()=>{
 const db=await createWeeklyDB();try{
  for(const [actor,employee] of [[ids.noor,ids.en],[ids.monwa,ids.em]]){
   await addPeriod(db,employee,'2026-10-24','08:00:00','18:00:00');
   await addPeriod(db,employee,'2026-10-25','09:00:00','15:00:00');
   let value=await weekly(db,actor,employee);assert.equal(day(value,'2026-10-25').applied_seconds,7200);
   assert.equal(value.transfers.length,1);assert.equal(value.applied_seconds,7200);
   const p=(await payrollSnapshot(db,actor,employee)).statement;
   assert.ok(!p.attendance_details.missing_days.some(d=>d.day==='2026-10-25'));
   assert.equal(p.attendance_details.weekly_compensation.applied_seconds,7200);
   assert.deepEqual(await weekly(db,actor,employee),value);
   const again=(await payrollSnapshot(db,actor,employee)).statement;
   assert.equal(again.total_amount,p.total_amount);assert.equal(again.attendance_amount,p.attendance_amount);
  }
  assert.equal((await db.query('select count(*)::int n from wf_attendance_sessions')).rows[0].n,4);
  assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close()}
});
test('FIFO is isolated per employee/week/month; future days receive nothing and paid payroll stays frozen',async()=>{
 const db=await createWeeklyDB();try{
  await setTime(db,'2026-10-26T12:00:00+03:00');
  await addPeriod(db,ids.en,'2026-10-22','08:00:00','18:00:00');
  const expired=await weekly(db);assert.equal(expired.applied_seconds,7200); // Only its earlier week can receive the credit.
  assert.ok(expired.transfers.every(t=>t.target_day<'2026-10-24'));
  assert.equal(day(expired,'2026-10-24').applied_seconds,0);
  assert.ok(!expired.days.some(d=>d.day>'2026-10-26'));
  const monwa=await weekly(db,ids.monwa,ids.em);assert.equal(monwa.applied_seconds,0);
  await assert.rejects(()=>weekly(db,ids.monwa,ids.en));
  await db.query('update wf_employees set can_view_team_summaries=true where id=$1',[ids.en]);
  assert.equal((await weekly(db,ids.noor,ids.em)).applied_seconds,0);
  await assert.rejects(()=>weekly(db,ids.noor,ids.en,'2026-10-02'),/الشهر/);
  const p=(await payrollSnapshot(db)).statement;
  await db.query("update wf_monthly_payroll set status='paid',paid_amount=total_amount,approved_at=now(),approved_by=$2 where id=$1",[p.id,ids.admin]);
  const frozen=await weekly(db);await addPeriod(db,ids.en,'2026-10-26','12:00:00','23:00:00');
  assert.deepEqual(await weekly(db),frozen);
  await db.exec('set role authenticated');await assert.rejects(()=>weekly(db));
 }finally{await db.close()}
});
test('credits, permission, paid leave, Friday and approved overtime cannot create surplus or double-pay',async()=>{
 const db=await createWeeklyDB();try{
  await db.exec("reset role;alter table wf_attendance_sessions disable trigger all;set role service_role;");
  await addPeriod(db,ids.en,'2026-10-24','06:00:00','18:00:00',{credit_request_id:crypto.randomUUID()});
  await addPeriod(db,ids.en,'2026-10-25','06:00:00','18:00:00',{overtime_request_id:crypto.randomUUID()});
  await addPeriod(db,ids.en,'2026-10-23','06:00:00','18:00:00');
  await db.query("insert into wf_employee_requests(employee_id,kind,status,leave_type,starts_at,ends_at) values($1,'leave','approved','paid','2026-10-26T00:00:00+03:00','2026-10-26T23:59:00+03:00')",[ids.en]);
  await addPeriod(db,ids.en,'2026-10-26','06:00:00','18:00:00');
  const v=await weekly(db);assert.equal(v.applied_seconds,0);assert.ok(v.days.every(d=>d.generated_seconds===0));
  assert.ok(!v.days.some(d=>['2026-10-23','2026-10-26'].includes(d.day)));
 }finally{await db.close()}
});
test('unpaid break and overlaps do not mint surplus; exact seconds are conserved',async()=>{
 const db=await createWeeklyDB();try{
  await addPeriod(db,ids.en,'2026-10-24','08:00:00','18:00:00',{unpaid_periods:[{start:'2026-10-24T13:00:00+03:00',end:'2026-10-24T13:30:00+03:00'}]});
  assert.equal(day(await weekly(db),'2026-10-24').generated_seconds,5400);
  await addPeriod(db,ids.en,'2026-10-24','12:00:00','14:00:00');
  // The overlapping genuine record covers the excluded half hour; merged ranges count it once.
  await addPeriod(db,ids.en,'2026-10-25','09:00:00','15:59:59');
  const v=await weekly(db);assert.equal(day(v,'2026-10-24').generated_seconds,7200);
  assert.equal(day(v,'2026-10-25').applied_seconds,3601);
  assert.equal(v.applied_seconds+v.days.reduce((n,d)=>n+d.unused_seconds,0),v.days.reduce((n,d)=>n+d.generated_seconds,0));
 }finally{await db.close()}
});

test('same-week month boundary never imports October hours into November; no future or unpaid-leave credit',async()=>{
 const db=await createWeeklyDB();try{
  await setTime(db,'2026-11-02T23:00:00+03:00');
  await addPeriod(db,ids.en,'2026-10-31','08:00:00','18:00:00');
  assert.equal((await weekly(db,ids.noor,ids.en,'2026-11-01')).applied_seconds,0);
  await addPeriod(db,ids.en,'2026-11-01','08:00:00','18:00:00');
  await db.query("insert into wf_employee_requests(employee_id,kind,status,leave_type,starts_at,ends_at) values($1,'leave','approved','unpaid','2026-11-02T00:00:00+03:00','2026-11-02T23:59:00+03:00')",[ids.en]);
  const value=await weekly(db,ids.noor,ids.en,'2026-11-01');assert.equal(value.applied_seconds,0);
  assert.equal(value.current_week.available_seconds,7200);assert.ok(!value.days.some(d=>d.day==='2026-11-02'));
 }finally{await db.close()}
});
test('monthly counted hours use allocated surplus once, while raw attendance stays unchanged',async()=>{
 const db=await createWeeklyDB();try{
  await setTime(db,'2026-10-25T23:00:00+03:00');
  await addPeriod(db,ids.en,'2026-10-24','08:00:00','18:00:00');await addPeriod(db,ids.en,'2026-10-25','09:00:00','15:00:00');
  const value=await weekly(db),periods=(await db.query('select * from wf_attendance_sessions where employee_id=$1',[ids.en])).rows;
  const summary=summarizeAttendance({periods,startDate:'2026-10-24',month:'2026-10',now:new Date('2026-10-25T23:00:00+03:00'),weeklyCompensation:value});
  assert.equal(summary.workedMinutes,960);assert.equal(summary.creditedMinutes,960);
  assert.equal(summary.remainingMinutes,summary.targetMinutes-960);
  const live=liveAttendance(summary,null,Date.parse('2026-10-25T23:05:00+03:00'));assert.equal(live.creditedMinutes,960);
  assert.equal(live.todayMinutes,360);assert.equal(live.todayCreditedMinutes,480);assert.equal(live.todayCompensationMinutes,120);
  const sum=value.days.reduce((n,d)=>n+d.base_credited_seconds+d.applied_seconds,0);assert.equal(value.credited_seconds,sum);
  assert.ok(value.weeks.every(w=>w.credited_seconds<=w.target_seconds));
 }finally{await db.close()}
});
test('current daily accrual includes bank credit once; approved overtime remains a separate unchanged award',async()=>{
 const db=await createWeeklyDB();try{
  await db.exec("reset role;update workforce_private.payroll_attendance_policy set starts_on='2026-10-24';set role service_role");
  await addPeriod(db,ids.em,'2026-10-24','08:00:00','18:00:00');await addPeriod(db,ids.em,'2026-10-25','09:00:00','17:00:00');await addPeriod(db,ids.em,'2026-10-26','09:00:00','12:00:00');
  await setTime(db,'2026-10-26T17:59:00+03:00');
  const early=(await payrollSnapshot(db,ids.monwa,ids.em)).statement;assert.equal(early.daily_accrual.current_credited_seconds,18000);
  await setTime(db,'2026-10-26T18:00:00+03:00');const late=(await payrollSnapshot(db,ids.monwa,ids.em)).statement;
  assert.equal(early.daily_accrual.total_amount,late.daily_accrual.total_amount);
  const request=(await db.query("insert into wf_employee_requests(employee_id,kind,status,title,starts_at,ends_at) values($1,'overtime','pending','خارج دوام معتمد','2026-10-23T18:00:00+03:00','2026-10-23T20:00:00+03:00') returning id,version",[ids.em])).rows[0];
  await db.query('select wf_decide_overtime_request($1,$2,$3,$4,$5,$6)',[request.id,ids.admin,request.version,'اعتماد خارج الدوام','2026-10-23T18:00:00+03:00','2026-10-23T20:00:00+03:00']);
  const first=(await payrollSnapshot(db,ids.monwa,ids.em)).statement,second=(await payrollSnapshot(db,ids.monwa,ids.em)).statement;
  assert.equal(Number(first.overtime_amount),46.67);assert.equal(first.overtime_amount,second.overtime_amount);
  assert.equal(first.total_amount,second.total_amount);assert.equal(first.attendance_details.weekly_compensation.applied_seconds,7200);
  assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
  assert.equal((await db.query("select has_function_privilege('anon','public.wf_weekly_hours_snapshot(uuid,uuid,date)','execute') n")).rows[0].n,false);
 }finally{await db.close()}
});

import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createExpenseDB} from './helpers/expense-db.mjs';import {ids} from './helpers/work-session-db.mjs';import {payrollSnapshot} from './helpers/payroll-attendance-db.mjs';
import {requireMedicalReport} from '../src/lib/workforce/sick-leave.ts';import {summarizeAttendance} from '../src/lib/workforce/attendance-summary.ts';import {upcomingLeave} from '../src/lib/workforce/upcoming-leave.ts';
import {splitAttendanceAdjustment} from '../src/lib/workforce/payroll-attendance.ts';
const migration=new URL('../supabase/migrations/20261023032103_sick_leave_attendance_payroll.sql',import.meta.url);
async function setup(){const db=await createExpenseDB();await db.exec(`reset role;alter table wf_employee_requests add constraint wf_employee_requests_leave_type_check check(leave_type in ('paid','unpaid'));
create function workforce_private.paid_holiday(date) returns text language sql stable as $$select coalesce(case to_char($1,'MM-DD') when '02-22' then 'يوم التأسيس' when '09-23' then 'اليوم الوطني' end,(select title from public.wf_paid_calendar_days where day=$1))$$;`);await db.exec(await readFile(migration,'utf8'));await db.exec('set role service_role');return db;}
const medical=id=>JSON.stringify([{id:crypto.randomUUID(),filename:'medical.pdf',mime_type:'application/pdf',size_bytes:100,sha256:'a'.repeat(64),object_path:`requests/${id}/report`}]);
async function submit(db,employee,start,end,attachments){const id=crypto.randomUUID();await db.query("insert into wf_employee_requests(id,employee_id,kind,leave_type,status,title,starts_at,ends_at,attachments) values($1,$2,'leave','sick','pending','إجازة مرضية',$3,$4,$5::jsonb)",[id,employee,`${start}T00:00:00+03:00`,`${end}T23:59:00+03:00`,attachments??medical(id)]);return id;}
const decide=(db,id,actor=ids.admin,decision='approved')=>db.query('select wf_decide_employee_request($1,$2,1,$3,$4)',[id,actor,decision,'تمت مراجعة التقرير الطبي']);
const sick=(db,employee=ids.en,through='2028-01-01')=>db.query('select * from workforce_private.sick_leave_days($1,$2)',[employee,through]).then(x=>x.rows);

test('medical report required on server and database; Noor/Monwa submit privately, manager alone approves, no annual leave consumption',async()=>{
 const db=await setup();try{
 assert.throws(()=>requireMedicalReport('leave','sick',[]),/التقرير الطبي/);assert.throws(()=>requireMedicalReport('leave','sick',[{mime:'application/zip'}]),/التقرير الطبي/);requireMedicalReport('leave','sick',[{mime:'application/pdf'}]);
 await assert.rejects(()=>submit(db,ids.en,'2026-10-25','2026-10-26','[]'),/التقرير الطبي/);
 for(const [employee,user,other] of [[ids.en,ids.noor,ids.monwa],[ids.em,ids.monwa,ids.noor]]){
  const id=await submit(db,employee,'2026-10-25','2026-10-26');assert.equal((await sick(db,employee)).length,0);
  await assert.rejects(()=>decide(db,id,user),{code:'42501'});
  await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);assert.equal((await db.query('select attachments from wf_employee_requests where id=$1',[id])).rows.length,0);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);assert.equal((await db.query('select attachments from wf_employee_requests where id=$1',[id])).rows.length,1);
  await db.exec('reset role;set role service_role');await decide(db,id);assert.equal((await sick(db,employee)).length,2);
  await assert.rejects(()=>decide(db,id),/تمت معالجة الطلب/);
 }
 assert.equal((await db.query('select count(*)::int n from wf_leave_movements')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close()}
});

test('30 full / 60 at 75% / 30 unpaid, disconnected periods and calendar Fridays count; 121st day rejected atomically',async()=>{
 const db=await setup();try{
 let id=await submit(db,ids.en,'2026-10-24','2026-11-22');await decide(db,id);
 id=await submit(db,ids.en,'2026-11-25','2027-01-23');await decide(db,id);
 id=await submit(db,ids.en,'2027-01-25','2027-02-23');await decide(db,id);
 const days=await sick(db);assert.equal(days.length,120);assert.equal(Number(days[29].pay_rate),1);assert.equal(Number(days[30].pay_rate),.75);assert.equal(Number(days[89].pay_rate),.75);assert.equal(Number(days[90].pay_rate),0);assert.ok(days.some(x=>new Date(x.day).getUTCDay()===5));
 const extra=await submit(db,ids.en,'2027-02-24','2027-02-24');await assert.rejects(()=>decide(db,extra),/120/);assert.equal((await db.query('select status from wf_employee_requests where id=$1',[extra])).rows[0].status,'pending');
 const overlap=await submit(db,ids.en,'2026-11-01','2026-11-01');await assert.rejects(()=>decide(db,overlap),/توجد إجازة معتمدة/);
 // Reset is the Hijri anniversary of the first sickness, never January 1.
 const first=new Date(days[0].cycle_start).toISOString().slice(0,10),ending=new Date(days[0].cycle_end).toISOString().slice(0,10);assert.equal(first,'2026-10-24');assert.ok(ending<'2027-10-24');
 const fresh=await submit(db,ids.en,ending,ending);await decide(db,fresh);const renewed=(await sick(db)).at(-1);assert.equal(renewed.ordinal,1);assert.equal(Number(renewed.pay_rate),1);
 }finally{await db.close()}
});

test('payroll excludes approved sick days from absence, pays current day once, prorates partial sick wage and protects holiday pay',async()=>{
 const db=await setup();try{
 await db.query("select set_config('test.clock','2026-11-25T12:00:00+03:00',false)");
 let id=await submit(db,ids.en,'2026-10-24','2026-11-22');await decide(db,id);id=await submit(db,ids.en,'2026-11-25','2026-11-26');await decide(db,id);
 const detail=(await db.query("select workforce_private.attendance_payroll($1,'2026-11-01') value",[ids.en])).rows[0].value;
 assert.equal(detail.missing_days.some(x=>x.day==='2026-11-25'),false);assert.equal(Number(detail.sick_leave.amount),53.58); // 6430 / 30 × 25%, only elapsed day.
 const a=(await payrollSnapshot(db,ids.noor,ids.en,'2026-11-01')).statement;
 const b=(await payrollSnapshot(db,ids.noor,ids.en,'2026-11-01')).statement;
 assert.equal(a.daily_accrual.total_amount,b.daily_accrual.total_amount);assert.equal(a.attendance_details.sick_leave.days.length,23);assert.equal(a.daily_accrual.current_credited_seconds,0);
 await db.query("insert into wf_paid_calendar_days values('2026-11-25','عطلة مدفوعة')");const holiday=(await db.query("select workforce_private.sick_payroll($1,'2026-11-01','2026-11-25') value",[ids.en])).rows[0].value;assert.equal(Number(holiday.amount),0);
 await db.query("select set_config('test.clock','2026-11-26T18:00:00+03:00',false)");const two=(await db.query("select workforce_private.sick_payroll($1,'2026-11-01','2026-11-26') value",[ids.en])).rows[0].value;assert.equal(Number(two.amount),53.58);
 }finally{await db.close()}
});

test('rejected/cancelled leave has no financial effect; approved absence is not worked time and sick badge is explicit',async()=>{
 const db=await setup();try{
 const rejected=await submit(db,ids.em,'2026-10-25','2026-10-26');await decide(db,rejected,ids.admin,'rejected');const cancelled=await submit(db,ids.em,'2026-10-27','2026-10-27');await decide(db,cancelled,ids.monwa,'cancelled');assert.equal((await sick(db,ids.em)).length,0);
 const s=summarizeAttendance({periods:[],startDate:'2026-10-20',month:'2026-10',now:new Date('2026-10-28T12:00:00+03:00'),excusedDays:['2026-10-25','2026-10-26','2026-10-25']});assert.equal(s.workedMinutes,0);assert.equal(s.approvedLeaveMinutes,960);assert.equal(s.targetMinutes,8*480);
 const rows=upcomingLeave({employeeId:ids.en,startDate:'2026-10-18',today:'2026-10-23',calendar:[],requests:[{id:'sick',employee_id:ids.en,kind:'leave',status:'approved',title:'مرضية',leave_type:'sick',starts_at:'2026-10-25',ends_at:'2026-10-26',test_run_id:null}]});assert.equal(rows.find(x=>x.source==='request').paymentLabel,'مرضية · حسب الاستحقاق');
 }finally{await db.close()}
});

test('sick and hour adjustments split an existing total without double charging or exceeding a capped balance',()=>{
 assert.deepEqual(splitAttendanceAdjustment('153.58','53.58'),{hours:'100.00',sick:'53.58'});
 assert.deepEqual(splitAttendanceAdjustment('20.00','53.58'),{hours:'0.00',sick:'20.00'});
 assert.deepEqual(splitAttendanceAdjustment('100.00'),{hours:'100.00',sick:'0.00'});
});

test('retroactive approval updates later sick bands; exhausted and paid periods are protected',async()=>{
 const db=await setup();try{
 let id=await submit(db,ids.en,'2026-11-01','2026-11-30');await decide(db,id);
 const back=await submit(db,ids.en,'2026-10-25','2026-10-25');await decide(db,back);
 assert.equal(Number((await sick(db)).find(x=>new Date(x.day).toISOString().startsWith('2026-11-30')).pay_rate),.75);
 const pending=await submit(db,ids.em,'2026-10-25','2026-10-25');
 // A settled payroll cannot be silently rewritten by a later backdated medical certificate.
 await db.exec("reset role;alter table wf_monthly_payroll disable trigger all;update wf_monthly_payroll set status='paid',approved_at=now(),approved_by='10000000-0000-4000-8000-000000000003',paid_amount=total_amount where employee_id='"+ids.em+"';alter table wf_monthly_payroll enable trigger all;set role service_role;");
 await assert.rejects(()=>decide(db,pending),/مصروفة/);
 const early=await submit(db,ids.en,'2026-10-24','2026-10-24');await decide(db,early);
 const approved=await db.query('select attachments from wf_employee_requests where id=$1',[early]);
 await assert.rejects(()=>db.query('update wf_employee_requests set attachments=\'[]\' where id=$1',[early]),/لا يمكن تعديلها/);
 assert.ok(approved.rows[0].attachments.length);
 }finally{await db.close()}
});

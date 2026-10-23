import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import ExcelJS from 'exceljs';
import {createExpenseDB} from './helpers/expense-db.mjs';import {ids,snapshot,command} from './helpers/work-session-db.mjs';import {payrollSnapshot} from './helpers/payroll-attendance-db.mjs';
import {missingHoursInput} from '../src/lib/workforce/missing-hours.ts';import {summarizeAttendance} from '../src/lib/workforce/attendance-summary.ts';import {attendanceWorkbook} from '../src/lib/workforce/attendance-export.ts';
async function setup(){const db=await createExpenseDB();await db.exec(`reset role;
alter table wf_attendance_sessions add constraint wf_attendance_sessions_source_check check(source in ('clock','correction','admin'));
create unique index notification_key on wf_notifications(recipient_id,event_key);
create function workforce_private.paid_holiday(date) returns text language sql stable as $$select coalesce(case to_char($1,'MM-DD') when '02-22' then 'يوم التأسيس' when '09-23' then 'اليوم الوطني' end,(select title from public.wf_paid_calendar_days where day=$1))$$;
create trigger wf_attendance_notices after insert or update on wf_attendance_sessions for each row execute function workforce_private.notify_workforce_changes();
`);
 const n=await readFile(new URL('../supabase/migrations/20261022234236_workforce_notification_clarity.sql',import.meta.url),'utf8');const first=n.indexOf('create or replace function workforce_private.notify_employee_request()');await db.exec(n.slice(first,n.indexOf('create or replace function workforce_private.notify_task_attachment()',first)));
 await db.exec('create trigger wf_employee_request_notifications after insert or update on wf_employee_requests for each row execute function workforce_private.notify_employee_request();');
 await db.exec(await readFile(new URL('../supabase/migrations/20261023193901_approved_missing_work_hours.sql',import.meta.url),'utf8'));
 await db.exec("set role service_role;set test.clock='2026-10-25T12:00:00+03:00';");return db;}
async function submit(db,employee=ids.en,day='2026-10-24',minutes=120){const id=crypto.randomUUID();await db.query("insert into wf_employee_requests(id,employee_id,kind,status,title,work_day,missing_minutes) values($1,$2,'missing-hours','pending','تسجيل ساعات مفقودة',$3,$4)",[id,employee,day,minutes]);return id;}
const decide=(db,id,actor=ids.admin,status='approved')=>db.query('select wf_decide_employee_request($1,$2,1,$3,$4)',[id,actor,status,'تمت مراجعة ساعات العمل']);
async function sessions(db,employee=ids.en){return(await db.query('select * from wf_attendance_sessions where employee_id=$1 order by checked_in',[employee])).rows.map(x=>({...x,checked_in:new Date(x.checked_in).toISOString(),checked_out:x.checked_out?new Date(x.checked_out).toISOString():null,business_date:new Date(x.business_date).toISOString().slice(0,10)}));}
async function actual(db,employee=ids.en,start='2026-10-24T09:00:00+03:00',end='2026-10-24T13:00:00+03:00'){
 // Real attendance fixtures bypass only notification delivery, never payroll/credit functions.
 await db.query("insert into wf_attendance_sessions(id,employee_id,business_date,checked_in,checked_out,source,note,updated_by) values($1,$2,$3,$4,$5,'clock','',$6)",[crypto.randomUUID(),employee,start.slice(0,10),start,end,ids.admin]);
}
const summarize=periods=>summarizeAttendance({periods,startDate:'2026-10-18',month:'2026-10',now:new Date('2026-10-25T12:00:00+03:00')});

test('employees request date and hours; manager approval alone credits both employees, idempotently and privately',async()=>{
 const db=await setup();try{
 assert.deepEqual(missingHoursInput('2026-10-24','1.5'),{work_day:'2026-10-24',missing_minutes:90});for(const x of ['-1','0','8.5','NaN','0.001'])assert.throws(()=>missingHoursInput('2026-10-24',x));assert.throws(()=>missingHoursInput('2026-02-30','2'));
 for(const [employee,user,other] of [[ids.en,ids.noor,ids.monwa],[ids.em,ids.monwa,ids.noor]]){
  const id=await submit(db,employee);assert.equal((await sessions(db,employee)).length,0);await assert.rejects(()=>decide(db,id,user),{code:'42501'});
  await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);assert.equal((await db.query('select id from wf_employee_requests where id=$1',[id])).rows.length,0);await db.exec('reset role;set role service_role');
  await decide(db,id);const first=await sessions(db,employee);assert.equal(summarize(first).workedMinutes,120);assert.equal(summarize(first).approvedMissingMinutes,120);assert.equal(first[0].source,'missing-hours');assert.equal(first[0].credit_request_id,id);
  await assert.rejects(()=>decide(db,id),/تمت معالجة الطلب/);assert.equal((await sessions(db,employee)).length,first.length);
 }
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close()}
});

test('gaps avoid actual attendance and permissions, never exceed eight hours or repeat a payroll credit',async()=>{
 const db=await setup();try{
 await actual(db);await actual(db,ids.en,'2026-10-24T14:00:00+03:00','2026-10-24T16:00:00+03:00');
 const before=(await payrollSnapshot(db)).statement;const id=await submit(db,ids.en,'2026-10-24',120);await decide(db,id);
 const periods=await sessions(db),s=summarize(periods);assert.equal(s.workedMinutes,480);assert.equal(s.approvedMissingMinutes,120);assert.equal(periods.filter(x=>x.credit_request_id===id).length,2);
 for(const c of periods.filter(x=>x.credit_request_id))for(const a of periods.filter(x=>!x.credit_request_id))assert.ok(c.checked_out<=a.checked_in||c.checked_in>=a.checked_out);
 const after=(await payrollSnapshot(db)).statement,repeat=(await payrollSnapshot(db)).statement;assert.equal(after.daily_accrual.total_amount,repeat.daily_accrual.total_amount);assert.equal(Math.round(100*(Number(before.attendance_amount)-Number(after.attendance_amount))),5358); // 2 hours × 6430 / 240, rounded once per monthly settlement.
 const extra=await submit(db,ids.en,'2026-10-24',15);await assert.rejects(()=>decide(db,extra),/تتجاوز/);assert.equal(summarize(await sessions(db)).workedMinutes,480);
 const protectedDay=await submit(db,ids.em,'2026-10-24',420);await db.query("insert into wf_employee_requests(employee_id,kind,status,starts_at,ends_at) values($1,'permission','approved','2026-10-24T09:00:00+03:00','2026-10-24T11:00:00+03:00')",[ids.em]);await assert.rejects(()=>decide(db,protectedDay),/تتجاوز/);
 }finally{await db.close()}
});

test('invalid days, future/in-progress days, holidays, leave, rejected and cancelled requests never add hours',async()=>{
 const db=await setup();try{
 for(const day of ['2026-10-23','2026-10-17','2026-10-26','2026-10-25'])await assert.rejects(()=>submit(db,ids.en,day,60));
 await db.query("insert into wf_paid_calendar_days values('2026-10-24','إجازة مدفوعة')");await assert.rejects(()=>submit(db),/إجازة/);await db.exec("delete from wf_paid_calendar_days where day='2026-10-24'");
 const leave=await submit(db);await db.query("insert into wf_employee_requests(employee_id,kind,status,starts_at,ends_at) values($1,'leave','approved','2026-10-24T00:00:00+03:00','2026-10-24T23:59:00+03:00')",[ids.en]);await assert.rejects(()=>decide(db,leave),/إجازة معتمدة/);
 const rejected=await submit(db,ids.em);await decide(db,rejected,ids.admin,'rejected');const cancelled=await submit(db,ids.em);await decide(db,cancelled,ids.monwa,'cancelled');assert.equal((await sessions(db)).length,0);assert.equal((await sessions(db,ids.em)).length,0);
 }finally{await db.close()}
});

test('Excel and weekly totals include credits without presenting them as actual punches; latest clock state stays genuine',async()=>{
 const db=await setup();try{
 await actual(db);const id=await submit(db,ids.en,'2026-10-24',120);await decide(db,id);const periods=await sessions(db),s=summarize(periods);
 const report=(await db.query("select workforce_private.report_attendance_seconds($1,'2026-10-01T00:00:00+03:00','2026-11-01T00:00:00+03:00') n",[ids.en])).rows[0].n;assert.equal(Number(report),21600);
 const buffer=await attendanceWorkbook('2026-10',[{full_name:'نور',job_title:'موظفة',start_date:'2026-10-18',summary:s,periods}],new Date(s.asOf));const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(buffer));assert.equal(book.getWorksheet('فترات الحضور والانصراف').rowCount,5);assert.equal(book.getWorksheet('الساعات المفقودة المعتمدة').rowCount,5);assert.equal(book.getWorksheet('الساعات المفقودة المعتمدة').getCell('D5').value,id);
 const snap=await snapshot(db);assert.equal(snap.lastSession.credit_request_id,null);assert.equal(snap.lastSession.source,'clock');assert.equal(snap.session,null);
 // Today after 17 is complete; its approved credit changes the clock total but cannot open a session.
 await db.query("select set_config('test.clock','2026-10-25T18:00:00+03:00',false)");const today=await submit(db,ids.en,'2026-10-25',90);await decide(db,today);assert.equal(Number((await snapshot(db)).todaySeconds),5400);await assert.rejects(()=>command(db,{command:'in'}),/انتهى وقت الدوام/);
 }finally{await db.close()}
});

test('paid payroll is immutable, invalid quantities are rejected in SQL, and leave cannot overwrite approved hours',async()=>{
 const db=await setup();try{
 for(const minutes of [null,0,481])await assert.rejects(()=>submit(db,ids.en,'2026-10-24',minutes),{code:'23514'});
 const paidRequest=await submit(db,ids.em);
 await db.exec("reset role;alter table wf_monthly_payroll disable trigger all;update wf_monthly_payroll set status='paid',approved_at=now(),approved_by='"+ids.admin+"',paid_amount=total_amount where employee_id='"+ids.em+"';alter table wf_monthly_payroll enable trigger all;set role service_role;");
 await assert.rejects(()=>decide(db,paidRequest),/مصروف/);assert.equal((await sessions(db,ids.em)).length,0);
 const approved=await submit(db);await decide(db,approved);
 const leave=crypto.randomUUID();await db.query("insert into wf_employee_requests(id,employee_id,kind,status,leave_type,starts_at,ends_at) values($1,$2,'leave','pending','unpaid','2026-10-24T00:00:00+03:00','2026-10-24T23:59:00+03:00')",[leave,ids.en]);await assert.rejects(()=>decide(db,leave),/ساعات مفقودة معتمدة/);
 assert.equal(summarize(await sessions(db)).workedMinutes,120);
 }finally{await db.close()}
});

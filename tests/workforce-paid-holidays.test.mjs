import test from 'node:test';import assert from 'node:assert/strict';
import {fixedPaidHoliday,paidHolidayAt} from '../src/lib/workforce/calendar.ts';import {summarizeAttendance} from '../src/lib/workforce/attendance-summary.ts';import {createHolidayDB} from './helpers/holiday-db.mjs';import {ids,command} from './helpers/work-session-db.mjs';import {payrollSnapshot} from './helpers/payroll-attendance-db.mjs';

test('fixed paid holidays recur every year; targets exclude them without fake worked time or double Friday credit',()=>{
 for(const y of [2026,2027,2028,2030]){assert.equal(fixedPaidHoliday(`${y}-02-22`),'يوم التأسيس');assert.equal(fixedPaidHoliday(`${y}-09-23`),'اليوم الوطني السعودي');}
 assert.equal(paidHolidayAt('2027-02-21T21:00:00Z'),'يوم التأسيس');assert.equal(paidHolidayAt('2027-02-22T21:00:00Z'),null);
 const s=summarizeAttendance({periods:[],startDate:'2026-01-01',month:'2026-02',now:new Date('2026-02-22T12:00:00+03:00')});
 assert.equal(s.targetMinutes,23*480);assert.equal(s.paidHolidayMinutes,480);assert.equal(s.workedMinutes,0);assert.equal(s.todayPeriods,0);assert.equal(s.dayOff,true);
 const before=summarizeAttendance({periods:[],startDate:'2026-02-23',month:'2026-02',now:new Date('2026-02-22T12:00:00+03:00')});assert.equal(before.paidHolidayMinutes,0);
 const friday=summarizeAttendance({periods:[],startDate:'2022-09-01',month:'2022-09',now:new Date('2022-09-23T12:00:00+03:00')});assert.equal(friday.targetMinutes,25*480);assert.equal(friday.paidHolidayMinutes,0);
});

test('both employees have no holiday punches, no absence reminders or salary shortage on each fixed holiday',async()=>{
 const db=await createHolidayDB();try{
 for(const day of ['2027-02-22','2027-09-23']){
  await db.query("select set_config('test.clock',$1,false)",[`${day}T12:00:00+03:00`]);
  for(const actor of [ids.noor,ids.monwa])for(const action of ['in','out'])await assert.rejects(()=>command(db,{command:action},actor),/إجازة رسمية مدفوعة/);
  for(const employee of [ids.en,ids.em])assert.equal((await db.query('select workforce_private.attendance_reminder_needed($1,$2) needed',[employee,day])).rows[0].needed,false);
  await db.exec(`reset role;update workforce_private.payroll_attendance_policy set starts_on='${day}';set role service_role;`);
  const p=(await payrollSnapshot(db,ids.admin,ids.en,`${day.slice(0,7)}-01`)).statement;assert.equal(Number(p.attendance_amount),0);assert.ok(Number(p.daily_accrual.total_amount)>0);
 }
 assert.equal((await db.query('select count(*)::int n from wf_attendance_sessions')).rows[0].n,0);
 assert.equal((await db.query('select workforce_private.attendance_reminder_needed($1,$2) needed',[ids.em,'2027-09-22'])).rows[0].needed,true);
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close();}
});

test('weekly hours exclude paid holiday and paid leave request does not consume its annual bank',async()=>{
 const db=await createHolidayDB();try{
 await db.exec("update wf_employees set start_date='2026-01-01';");
 for(const week of ['2026-02-28','2026-09-26']){const reports=(await db.query('select wf_weekly_report_data($1) value',[week])).rows;assert.equal(reports.length,2);for(const r of reports)assert.equal(r.value.snapshot.weeklyReport.weekRequiredMinutes,40*60);}
 await db.query("select set_config('test.clock','2026-02-22T12:00:00+03:00',false)");
 const r=(await db.query("insert into wf_employee_requests(employee_id,kind,status,starts_at,ends_at) values($1,'leave','pending','2026-02-22T00:00:00+03:00','2026-02-22T23:59:00+03:00') returning id",[ids.en])).rows[0];await db.query("select wf_decide_employee_request($1,$2,1,'approved','إجازة معتمدة')",[r.id,ids.admin]);
 assert.equal((await db.query('select count(*)::int n from wf_leave_movements')).rows[0].n,0);
 }finally{await db.close();}
});

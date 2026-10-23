import ExcelJS from 'exceljs';import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createHolidayDB} from './helpers/holiday-db.mjs';import {ids,command,snapshot} from './helpers/work-session-db.mjs';
import {payrollSnapshot} from './helpers/payroll-attendance-db.mjs';import {summarizeAttendance} from '../src/lib/workforce/attendance-summary.ts';import {paidHolidayAt} from '../src/lib/workforce/calendar.ts';import {attendanceWorkbook} from '../src/lib/workforce/attendance-export.ts';
const migration=new URL('../supabase/migrations/20261023025634_eid_paid_calendar_integration.sql',import.meta.url);
async function setup(){const db=await createHolidayDB();await db.exec('reset role;');await db.exec(await readFile(new URL('../supabase/migrations/20261023022342_three_daily_work_confirmations.sql',import.meta.url),'utf8'));await db.exec(await readFile(migration,'utf8'));await db.exec('set role service_role;');return db;}

test('Eid schedule is idempotent: five days per Eid plus Friday compensation; summary and Excel agree',async()=>{
 const db=await setup();try{
 const days=(await db.query('select day::text,title from wf_paid_calendar_days order by day')).rows;
 assert.equal(days.length,11);assert.equal(days.filter(x=>x.title==='إجازة عيد الفطر 1448هـ').length,5);assert.equal(days.filter(x=>x.title==='إجازة عيد الأضحى 1448هـ').length,5);
 assert.ok(days.find(x=>x.day==='2027-03-14'&&x.title.startsWith('تعويض الجمعة')));
 // Reapplying only the seed section preserves one record per calendar date.
 const sql=await readFile(migration,'utf8');await db.exec(sql.slice(sql.indexOf('insert into public.wf_paid_calendar_days')));assert.equal((await db.query('select count(*)::int n from wf_paid_calendar_days')).rows[0].n,11);
 for(const month of ['2027-03','2027-05']){
 const s=summarizeAttendance({periods:[],startDate:'2026-10-20',month,now:new Date(`${month}-28T12:00:00+03:00`),paidCalendarDays:days});
 assert.equal(s.paidHolidayMinutes,5*480);assert.equal(s.targetMinutes,22*480);assert.equal(s.workedMinutes,0);
 const buffer=await attendanceWorkbook(month,[{id:ids.em,full_name:'منوه',job_title:'موظفة',start_date:'2026-10-20',summary:s,periods:[]}],new Date(s.asOf));const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(buffer));
 const mins=value=>value instanceof Date?(value.getTime()-Date.UTC(1899,11,30))/60000:value*1440;
 assert.equal(mins(workbook.getWorksheet('ملخص الموظفات').getCell('F5').value),s.targetMinutes);assert.equal(mins(workbook.getWorksheet('ملخص الموظفات').getCell('J5').value),5*480);
 }
 assert.equal(paidHolidayAt('2027-03-08T21:00:00Z',days),'إجازة عيد الفطر 1448هـ');
 const future=summarizeAttendance({periods:[],startDate:'2026-10-20',month:'2027-03',now:new Date('2027-03-08T12:00:00+03:00'),paidCalendarDays:days});assert.equal(future.paidHolidayMinutes,0);
 const lateJoin=summarizeAttendance({periods:[],startDate:'2027-03-15',month:'2027-03',now:new Date('2027-03-28T12:00:00+03:00'),paidCalendarDays:days});assert.equal(lateJoin.paidHolidayMinutes,0);
 }finally{await db.close()}
});

test('Noor and Monwa cannot punch on any Eid day and no reminders, time loss or test notifications are created',async()=>{
 const db=await setup();try{
 const days=(await db.query('select day::text,title from wf_paid_calendar_days order by day')).rows;
 for(const {day,title} of days){
  await db.query("select set_config('test.clock',$1,false)",[`${day}T12:00:00+03:00`]);
  await db.exec('reset role');await db.query('update workforce_private.payroll_attendance_policy set starts_on=$1',[day]);await db.exec('set role service_role');
  for(const [actor,employee] of [[ids.noor,ids.en],[ids.monwa,ids.em]]){
   for(const action of ['in','out'])await assert.rejects(()=>command(db,{command:action},actor),/إجازة رسمية مدفوعة/);
   const snap=await snapshot(db,actor);assert.equal(snap.paidHoliday,title);assert.equal(snap.session,null);assert.equal(snap.todaySeconds,0);
   assert.equal((await db.query('select workforce_private.attendance_reminder_needed($1,$2) needed',[employee,day])).rows[0].needed,false);
   const pay=(await payrollSnapshot(db,actor,employee,`${day.slice(0,7)}-01`)).statement;assert.equal(Number(pay.attendance_amount),0);assert.ok(Number(pay.daily_accrual.total_amount)>0);
  }
 }
 assert.equal((await db.query('select count(*)::int n from wf_attendance_sessions')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 await db.query("select set_config('test.clock','2027-03-15T09:00:00+03:00',false)");const s=await command(db,{command:'in'});assert.ok(s.session);assert.equal(s.paidHoliday,null);
 }finally{await db.close()}
});

test('Eid payroll credit differs from an ordinary missed working day; annual leave bank and weekly hours exclude Eid',async()=>{
 const db=await setup();try{
 await db.query("select set_config('test.clock','2027-05-16T12:00:00+03:00',false)");await db.exec("reset role;update workforce_private.payroll_attendance_policy set starts_on='2027-05-16';set role service_role;");
 const paid=(await payrollSnapshot(db,ids.noor,ids.en,'2027-05-01')).statement.daily_accrual;
 await db.exec("delete from wf_paid_calendar_days where day='2027-05-16';");const missed=(await payrollSnapshot(db,ids.noor,ids.en,'2027-05-01')).statement.daily_accrual;
 assert.ok(Number(paid.total_amount)>Number(missed.total_amount));await db.exec("insert into wf_paid_calendar_days values('2027-05-16','إجازة عيد الأضحى 1448هـ');");
 for(const actor of [ids.en,ids.em]){
 const q=(await db.query("insert into wf_employee_requests(employee_id,kind,status,starts_at,ends_at) values($1,'leave','pending','2027-03-09T00:00:00+03:00','2027-03-14T23:59:00+03:00') returning id",[actor])).rows[0];
 await db.query("select wf_decide_employee_request($1,$2,1,'approved','إجازة معتمدة')",[q.id,ids.admin]);
 }
 assert.equal((await db.query('select count(*)::int n from wf_leave_movements')).rows[0].n,0);
 // The fixture clock, including the report's future-date guard, is local only.
 const definition=(await db.query("select pg_get_functiondef('public.wf_weekly_report_data(date)'::regprocedure) def")).rows[0].def;
 await db.exec('reset role');await db.exec(definition.replaceAll('now()','workforce_private.work_now()'));await db.exec('set role service_role');
 for(const [end,target] of [['2027-03-20',32*60],['2027-05-22',8*60]]){
  await db.query("select set_config('test.clock',$1,false)",[`${end}T09:00:00+03:00`]);
  const reports=(await db.query('select wf_weekly_report_data($1) value',[end])).rows;assert.equal(reports.length,2);for(const r of reports)assert.equal(r.value.snapshot.weeklyReport.weekRequiredMinutes,target);
 }
 const access=(await db.query("select has_function_privilege('anon','workforce_private.paid_holiday(date)','execute') a,has_function_privilege('authenticated','public.wf_work_command(uuid,text,uuid,uuid,text,uuid,text)','execute') e")).rows[0];assert.deepEqual(access,{a:false,e:false});
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close()}
});

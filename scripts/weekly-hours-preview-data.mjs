import {readFile} from 'node:fs/promises';
import {createWeeklyDB,weeklyMigration,setTime,addPeriod,weekly} from '../tests/helpers/weekly-hours-db.mjs';
import {ids} from '../tests/helpers/work-session-db.mjs';
import {payrollSnapshot} from '../tests/helpers/payroll-attendance-db.mjs';
import {summarizeAttendance} from '../src/lib/workforce/attendance-summary.ts';
function card(row){for(const key of ['total_amount','paid_amount','basic_amount','allowances_amount','gross_amount','attendance_amount','overtime_amount','reimbursement_amount'])row[key]=String(row[key]??0);return row;}
export async function currentWeeklyPreview(){
 const source=JSON.parse(await readFile(new URL('../.preview/weekly-current.json',import.meta.url),'utf8'));
 const db=await createWeeklyDB({migration:false,baseline:source.baseline});
 await db.exec('reset role;alter table wf_attendance_sessions disable trigger all;');
 await setTime(db,source.as_of);
 const columns=new Set((await db.query("select column_name from information_schema.columns where table_name='wf_attendance_sessions' and table_schema='public'")).rows.map(r=>r.column_name));
 for(const e of source.employees){const employee=e.full_name.startsWith('نور')?ids.en:ids.em;
  await db.query('update wf_employees set full_name=$1,start_date=$2 where id=$3',[e.full_name,e.start_date,employee]);
  await db.query('delete from wf_compensation_versions where employee_id=$1',[employee]);
  await db.query('insert into wf_compensation_versions values($1,$2,$3,$4,1)',[employee,e.salary.basic_salary,JSON.stringify(e.salary.allowances),e.salary.effective_from]);
  await db.query('update wf_attendance_settings set daily_minutes=$1,workdays=$2 where employee_id=$3',[e.settings?.daily_minutes??480,e.settings?.workdays??[0,1,2,3,4,6],employee]);
  await db.query('update wf_employee_insurance_settings set rate=$1,effective_from=$2 where employee_id=$3',[e.insurance.rate,e.insurance.effective_from,employee]);
  await db.query('update wf_monthly_payroll set basic_amount=$1,allowances_amount=$2,gross_amount=$3,deductions=$4 where employee_id=$5',[e.payroll.basic_amount,e.payroll.allowances_amount,e.payroll.gross_amount,JSON.stringify(e.payroll.deductions),employee]);
  if(e.waiver)await db.query('insert into workforce_private.payroll_attendance_waivers values($1,$2,$3)',[employee,e.waiver.month,e.waiver.reason]);
  for(const a of e.attendance){const row={...a,employee_id:employee,updated_by:ids.admin};const keys=Object.keys(row).filter(k=>columns.has(k));
   await db.query(`insert into wf_attendance_sessions(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>typeof row[k]==='object'&&row[k]!==null?JSON.stringify(row[k]):row[k]));
  }
  for(const r of e.requests??[])await db.query('insert into wf_employee_requests(id,employee_id,kind,status,leave_type,starts_at,ends_at,test_run_id) values($1,$2,$3,$4,$5,$6,$7,$8)',[r.id,employee,r.kind,r.status,r.leave_type,r.starts_at,r.ends_at,r.test_run_id]);
 }
 await db.exec('alter table wf_attendance_sessions enable trigger all;set role service_role');
 const before=[];for(const [actor,employee] of [[ids.noor,ids.en],[ids.monwa,ids.em]])before.push((await payrollSnapshot(db,actor,employee)).statement);
 await db.exec('reset role');await db.exec(await readFile(weeklyMigration,'utf8'));await db.exec('set role service_role');
 const result=[];
 for(const [index,[actor,employee]] of [[ids.noor,ids.en],[ids.monwa,ids.em]].entries()){
  const e=source.employees.find(e=>e.full_name.startsWith(employee===ids.en?'نور':'منوه'));
  const value=await weekly(db,actor,employee),payroll=(await payrollSnapshot(db,actor,employee)).statement;
  const periods=(await db.query('select * from wf_attendance_sessions where employee_id=$1',[employee])).rows;
  result.push({key:employee===ids.en?'noor':'monwa',name:e.full_name,now:source.as_of,before:card(before[index]),payroll:card(payroll),
   summary:summarizeAttendance({periods,startDate:e.start_date,month:'2026-10',now:new Date(source.as_of),weeklyCompensation:value}),weekly:value});
 }
 if((await db.query('select count(*)::int n from wf_notifications')).rows[0].n!==0)throw Error('Preview must not queue notifications');
 return {db,result};
}
export async function illustrativeWeeklyPreview(){
 const db=await createWeeklyDB({migration:false});await setTime(db,'2026-10-25T23:00:00+03:00');
 await db.exec("reset role;update workforce_private.payroll_attendance_policy set starts_on='2026-10-24';set role service_role");
 for(const employee of [ids.en,ids.em]){await addPeriod(db,employee,'2026-10-24','08:00:00','18:00:00');await addPeriod(db,employee,'2026-10-25','09:00:00','15:00:00');}
 const before=[];for(const [actor,employee] of [[ids.noor,ids.en],[ids.monwa,ids.em]])before.push((await payrollSnapshot(db,actor,employee)).statement);
 await db.exec('reset role');await db.exec(await readFile(weeklyMigration,'utf8'));await db.exec('set role service_role');
 const result=[];for(const [index,[actor,employee]] of [[ids.noor,ids.en],[ids.monwa,ids.em]].entries()){
  const value=await weekly(db,actor,employee),payroll=(await payrollSnapshot(db,actor,employee)).statement;
  const periods=(await db.query('select * from wf_attendance_sessions where employee_id=$1',[employee])).rows;
  result.push({key:employee===ids.en?'noor':'monwa',name:employee===ids.en?'نور محمود باجنيد':'منوه صالح سالم',now:'2026-10-25T23:00:00+03:00',before:card(before[index]),payroll:card(payroll),weekly:value,summary:summarizeAttendance({periods,startDate:employee===ids.en?'2026-10-18':'2026-10-20',month:'2026-10',now:new Date('2026-10-25T23:00:00+03:00'),weeklyCompensation:value})});
 }
 return {db,result};
}

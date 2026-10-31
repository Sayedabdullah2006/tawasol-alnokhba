import test from 'node:test';import assert from 'node:assert/strict';
import {createRemoteDB,ids,input,signature,quote,submit,approve,setTime} from './helpers/remote-work-db.mjs';
import {addPeriod,weekly} from './helpers/weekly-hours-db.mjs';
import {summarizeAttendance} from '../src/lib/workforce/attendance-summary.ts';
import {readFile} from 'node:fs/promises';
import {remoteMigration,regularHoursMigration} from './helpers/remote-work-db.mjs';
import {attendanceExemptPath} from '../src/lib/workforce/action-access.ts';
import {splitAttendanceAdjustment} from '../src/lib/workforce/payroll-attendance.ts';

test('agreement review remains available off duty and the remote adjustment is allocated once alongside other deductions',()=>{
 for(const path of ['/api/workforce/requests/remote-work/quote','/api/workforce/requests/remote-work/document','/api/workforce/requests'])assert.equal(attendanceExemptPath(path),true);
 assert.equal(attendanceExemptPath('/api/workforce/tasks'),false);
 const split=splitAttendanceAdjustment('2500.00','20.00','10.00','2430.00');assert.deepEqual(split,{hours:'40.00',sick:'20.00',unpaid:'10.00',remote:'2430.00'});
 assert.deepEqual(splitAttendanceAdjustment(2500,20,10,'2430.00'),split);
});

test('new agreements preserve configured hours while previously signed reduced-hour snapshots remain immutable',async()=>{
 const db=await createRemoteDB({regularHours:false});try{
  const oldQuote=await quote(db),id=await submit(db,oldQuote);await approve(db,id);assert.equal(oldQuote.days[0].required_minutes,299);
  const before=(await db.query('select remote_details from wf_employee_requests where id=$1',[id])).rows[0].remote_details;
  await db.exec('reset role');await db.exec(await readFile(new URL(`../supabase/migrations/${regularHoursMigration}.sql`,import.meta.url),'utf8'));await db.exec('set role service_role');
  assert.deepEqual((await db.query('select remote_details from wf_employee_requests where id=$1',[id])).rows[0].remote_details,before);
  assert.equal((await db.query("select workforce_private.effective_daily_minutes($1,'2026-11-02') n",[ids.en])).rows[0].n,299);
  await db.query('update wf_attendance_settings set daily_minutes=360 where employee_id=$1',[ids.en]);
  const next=await quote(db,{...input,starts_on:'2026-12-01',ends_on:'2026-12-15'});assert.equal(next.version,'remote-v2-regular-hours');assert.equal(next.days[0].required_minutes,360);assert.equal(next.days[0].regular_minutes,360);assert.equal(next.days[0].ends_time,'15:00:00');
 }finally{await db.close();}
});
test('remote agreement freezes stopped allowances, protects basic+housing, retains ordinary hours and requires an explicit signature',async()=>{const db=await createRemoteDB();try{
 const q=await quote(db);assert.equal(q.ready,true);assert.equal(q.agreed_amount,'4000.00');assert.equal(q.adjustment_amount,'2430.00');assert.equal(q.days[0].required_minutes,480);assert.equal(Number(q.days[0].basic),3200);assert.equal(Number(q.days[0].housing),800);
 await assert.rejects(submit(db,q,input,signature,crypto.randomUUID(),false),/وافق|استكمل/);
 await assert.rejects(submit(db,q,input,[[[1,2],[3,4]]]),/توقيع/);
 await assert.rejects(submit(db,{...q,hash:'forged'}),/تغير|استكمل/);
 const id=crypto.randomUUID();await submit(db,q,input,signature,id);await submit(db,q,input,signature,id);
 assert.equal((await db.query('select count(*)::int n from wf_employee_requests where id=$1',[id])).rows[0].n,1);
 assert.equal((await db.query("select workforce_private.effective_daily_minutes($1,'2026-11-02') n",[ids.en])).rows[0].n,480);
 await approve(db,id);
 assert.equal((await db.query("select workforce_private.effective_daily_minutes($1,'2026-11-02') n",[ids.en])).rows[0].n,480);
 assert.equal((await db.query("select workforce_private.effective_daily_minutes($1,'2026-12-01') n",[ids.en])).rows[0].n,480);
 await setTime(db,'2026-11-01T10:00:00+03:00');const work=(await db.query('select wf_work_snapshot($1) value',[ids.noor])).rows[0].value;
 assert.equal(work.attendancePolicy.requiredMinutes,480);assert.equal(work.attendancePolicy.endsAt,'17:00:00');assert.equal(work.attendancePolicy.remote,true);
 await setTime(db,'2026-12-01T10:00:00+03:00');const restored=(await db.query('select wf_work_snapshot($1) value',[ids.noor])).rows[0].value;assert.notEqual(restored.attendancePolicy?.remote,true);
 await assert.rejects(db.query("update wf_employee_requests set remote_details=jsonb_set(remote_details,'{snapshot,agreed_amount}','\"1.00\"') where id=$1",[id]),/لا يقبل التعديل/);
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
}finally{await db.close();}});

test('one missing ordinary work hour uses the agreed wage without a second allowance adjustment',async()=>{const db=await createRemoteDB();try{
 const q=await quote(db),id=await submit(db,q);await approve(db,id);await addPeriod(db,ids.en,'2026-11-01','09:00','16:00');await setTime(db,'2026-11-01T18:00:00+03:00');
 const d=(await db.query("select workforce_private.attendance_payroll($1,'2026-11-01') v",[ids.en])).rows[0].v;
 assert.equal(d.required_seconds,480*60);assert.equal(d.missing_seconds,3600);assert.equal(Number(d.calculated_amount),97.67);assert.equal(d.remote_work.amount,'81.00');
 await assert.rejects(db.query('update wf_compensation_versions set basic_salary=3300 where employee_id=$1',[ids.en]),/اتفاق عمل عن بُعد معتمد/);
}finally{await db.close();}});

test('approved paid/sick leave stays available and sick pay uses the agreed wage without double charging stopped allowances',async()=>{const db=await createRemoteDB();try{
 await db.exec('reset role');const sickness=await readFile(new URL('../supabase/migrations/20261023032103_sick_leave_attendance_payroll.sql',import.meta.url),'utf8');await db.exec(sickness.slice(sickness.indexOf('create table workforce_private.sick_hijri_months'),sickness.indexOf('create function workforce_private.validate_sick_leave')));
 await db.exec(await readFile(new URL('./fixtures/remote-sick-payroll.sql',import.meta.url),'utf8'));
 await db.query("update wf_employees set start_date='2026-09-01' where id=$1",[ids.en]);
 await db.query("insert into wf_compensation_versions(employee_id,basic_salary,allowances,effective_from,revision) values($1,3200,'[{\"name\":\"بدل السكن\",\"amount\":\"800\"},{\"name\":\"بدل النقل\",\"amount\":\"500\"},{\"name\":\"بدل مهام إضافية ثابت\",\"amount\":\"1930\"}]','2026-09-01',0)",[ids.en]);
 await db.exec('set role service_role');const q=await quote(db),id=await submit(db,q);await approve(db,id);
 await db.query("insert into wf_employee_requests(employee_id,kind,status,title,body,leave_type,starts_at,ends_at) values($1,'leave','approved','إجازة مرضية','تقرير طبي معتمد','sick','2026-10-02T00:00+03:00','2026-11-01T23:59+03:00')",[ids.en]);
 await setTime(db,'2026-11-02T08:00:00+03:00');const d=(await db.query("select workforce_private.attendance_payroll($1,'2026-11-01') v",[ids.en])).rows[0].v;
 assert.equal(d.remote_work.amount,'81.00');assert.equal(Number(d.sick_leave.amount),33.33);assert.equal(Number(d.calculated_amount),114.33);assert.equal(Number(d.missing_seconds),0);
 await db.query("insert into wf_employee_requests(employee_id,kind,status,title,body,leave_type,starts_at,ends_at) values($1,'leave','pending','إجازة سنوية','طلب خلال الاتفاق','paid','2026-11-03T00:00+03:00','2026-11-03T23:59+03:00')",[ids.en]);
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
}finally{await db.close();}});

test('current daily accrual charges the allowance adjustment only once after a complete ordinary workday',async()=>{const db=await createRemoteDB();try{
 const q=await quote(db),id=await submit(db,q);await approve(db,id);await addPeriod(db,ids.en,'2026-11-01','09:00','17:00');await setTime(db,'2026-11-01T18:00:00+03:00');
 const p=(await db.query("select wf_attendance_payroll_snapshot($1,$2,'2026-11-01') v",[ids.admin,ids.en])).rows[0].v.statement;
 const daily=p.daily_accrual;assert.equal(daily.remote_work_amount,'81.00');assert.equal(Number(daily.attendance_amount),81);assert.equal(Number(daily.current_credited_seconds),480*60);
 const expected=Math.max(0,Number(daily.gross_amount)-Number(daily.insurance_amount)-Number(daily.other_amount)-81)+Number(p.reimbursement_amount??0);assert.ok(Math.abs(Number(daily.total_amount)-expected)<.011);
 const again=(await db.query("select wf_attendance_payroll_snapshot($1,$2,'2026-11-01') v",[ids.admin,ids.en])).rows[0].v.statement;assert.equal(again.daily_accrual.total_amount,daily.total_amount);
}finally{await db.close();}});

test('no agreement leaves ordinary salary, insurance and attendance targets unchanged',async()=>{const db=await createRemoteDB({migration:false});try{
 const read=async()=>{const s=(await db.query("select wf_attendance_payroll_snapshot($1,$2,'2026-10-01') v",[ids.admin,ids.en])).rows[0].v.statement;return {gross:s.gross_amount,total:s.total_amount,insurance:s.insurance_details,required:s.attendance_details.required_seconds};};const before=await read();
 await db.exec('reset role');await db.exec(await readFile(new URL(`../supabase/migrations/${remoteMigration}.sql`,import.meta.url),'utf8'));await db.exec('set role service_role');
 assert.deepEqual(await read(),before);
}finally{await db.close();}});

test('October absence waiver does not waive the signed allowance adjustment; hours and work window restore automatically',async()=>{const db=await createRemoteDB();try{
 const p={...input,starts_on:'2026-10-29',ends_on:'2026-10-31'};await db.exec('reset role');await db.query("insert into workforce_private.payroll_attendance_waivers values($1,'2026-10-01','إعفاء أكتوبر')",[ids.en]);await db.exec('set role service_role');
 const q=await quote(db,p),id=await submit(db,q,p);await approve(db,id);await setTime(db,'2026-11-01T09:00:00+03:00');
 const detail=(await db.query("select workforce_private.attendance_payroll($1,'2026-10-01') v",[ids.en])).rows[0].v;assert.equal(detail.remote_work.amount,'243.00');assert.equal(Number(detail.calculated_amount),243);
 const bounds=(await db.query("select workforce_private.employee_work_start($1,'2026-10-29')::text starts,workforce_private.employee_work_end($1,'2026-10-29')::text ends,workforce_private.employee_work_end($1,'2026-11-01')::text restored",[ids.en])).rows[0];assert.equal(bounds.starts,'09:00:00');assert.equal(bounds.ends,'17:00:00');assert.equal(bounds.restored,'24:00:00');
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
}finally{await db.close();}});

test('employees cannot approve requests or edit contract settings, and cannot read another employee contract',async()=>{const db=await createRemoteDB();try{
 const q=await quote(db),id=await submit(db,q);
 await assert.rejects(db.query("select wf_decide_employee_request($1,$2,1,'approved','موافقة ذاتية')",[id,ids.noor]));
 await assert.rejects(db.query("select wf_remote_work_quote($1,$2)",[ids.admin,input]));
 await assert.rejects(db.query("select wf_remote_metadata($1,'{}','[]')",[ids.noor]));
 await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.noor]);
 const own=(await db.query('select employee_id from wf_remote_contracts')).rows;assert.deepEqual(own,[{employee_id:ids.en}]);
 await assert.rejects(db.query("update wf_remote_contracts set contract_number='forged' where employee_id=$1",[ids.en]));
 await assert.rejects(db.query('select wf_submit_remote_work($1,$2,$3,$4,$5,true)',[ids.noor,crypto.randomUUID(),input,q.hash,signature]));
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.monwa]);assert.deepEqual((await db.query('select employee_id from wf_remote_contracts')).rows,[{employee_id:ids.em}]);
}finally{await db.close();}});

test('monthly and daily pay deduct stopped allowances once; ordinary hours satisfy attendance and cannot mint a weekly surplus',async()=>{const db=await createRemoteDB();try{
 const q=await quote(db),id=await submit(db,q);await approve(db,id);
 for(let n=1;n<=30;n++){const day=`2026-11-${String(n).padStart(2,'0')}`;if(new Date(day+'T12:00:00Z').getUTCDay()===5)continue;await addPeriod(db,ids.en,day,'09:00','17:00');}
 await setTime(db,'2026-12-01T01:00:00+03:00');
 const detail=(await db.query("select workforce_private.attendance_payroll($1,'2026-11-01') v",[ids.en])).rows[0].v;
 assert.equal(detail.remote_work.amount,'2430.00');assert.equal(Number(detail.missing_seconds),0);assert.equal(Number(detail.calculated_amount),2430);
 const week=await weekly(db,ids.noor,ids.en,'2026-11-01');assert.equal(week.remote_days.length,30);assert.equal(week.days[0].required_seconds,480*60);assert.equal(week.days[0].generated_seconds,0);
 const summary=summarizeAttendance({periods:[],startDate:'2026-10-18',month:'2026-11',now:new Date('2026-12-01T01:00:00+03:00'),weeklyCompensation:week});assert.equal(summary.targetMinutes,26*480);
 const snap=(await db.query("select wf_attendance_payroll_snapshot($1,$2,'2026-11-01') v",[ids.admin,ids.en])).rows[0].v.statement;
 assert.equal(Number(snap.gross_amount),6430);assert.equal(Number(snap.total_amount),4000-Number(snap.insurance_details.amount));
 const again=(await db.query("select wf_attendance_payroll_snapshot($1,$2,'2026-11-01') v",[ids.admin,ids.en])).rows[0].v.statement;assert.equal(again.total_amount,snap.total_amount);
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
}finally{await db.close();}});

test('ineligible staff, missing contract, old dates and overlapping agreements/leaves fail closed; changes require a new signature',async()=>{const db=await createRemoteDB();try{
 await assert.rejects(quote(db,input,ids.monwa),/لا توجد بدلات/);
 await assert.rejects(quote(db,{...input,starts_on:'2026-10-27'}),/فترة مستقبلية/);
 await db.exec('reset role');await db.query('delete from wf_remote_contracts where employee_id=$1',[ids.en]);await db.exec('set role service_role');
 const missing=await quote(db);assert.equal(missing.ready,false);await assert.rejects(submit(db,missing),/استكمل/);
 await db.exec('reset role');await db.query("insert into wf_remote_contracts values($1,'PREVIEW-REPLACED','عقد محاكاة')",[ids.en]);await db.exec('set role service_role');
 const q=await quote(db),id=await submit(db,q);await assert.rejects(quote(db),/تتداخل/);
 await assert.rejects(db.query("insert into wf_employee_requests(employee_id,kind,status,title,body,leave_type,starts_at,ends_at) values($1,'leave','pending','إجازة','طلب إجازة','unpaid','2026-11-05T00:00+03:00','2026-11-06T23:59+03:00')",[ids.en]),/تتداخل/);
 await db.query("update wf_compensation_versions set allowances='[{\"name\":\"بدل السكن\",\"amount\":\"800\"},{\"name\":\"بدل النقل\",\"amount\":\"600\"}]' where employee_id=$1",[ids.en]);
 await assert.rejects(approve(db,id),/تغيرت بيانات/);
 await db.query('update wf_compensation_versions set basic_salary=3000 where employee_id=$1',[ids.en]);
 await db.query("update wf_employee_requests set status='cancelled' where id=$1",[id]);
 await assert.rejects(quote(db),/أقل من 4,000/);
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
}finally{await db.close();}});

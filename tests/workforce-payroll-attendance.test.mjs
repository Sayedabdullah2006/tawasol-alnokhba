import test from 'node:test';import assert from 'node:assert/strict';
import {createPayrollDB,payrollSnapshot} from './helpers/payroll-attendance-db.mjs';
import {ids,clock,command} from './helpers/work-session-db.mjs';
const fixed=value=>Number(value).toFixed(2);
test('automatic settlement uses full salary rate, completed days, and own payroll only',async()=>{
 const db=await createPayrollDB();try{
 let p=await payrollSnapshot(db);assert.equal(fixed(p.statement.total_amount),'3000.67');assert.equal(Number(p.attendance.missing_seconds),0);assert.equal(Number(p.attendance.hourly_rate).toFixed(6),'26.791667');
 await clock(db,'16:59');p=await payrollSnapshot(db);assert.equal(Number(p.attendance.missing_seconds),0);
 await clock(db,'17:00');p=await payrollSnapshot(db);assert.equal(Number(p.attendance.missing_seconds),28800);assert.equal(fixed(p.statement.attendance_amount),'214.33');assert.equal(fixed(p.statement.total_amount),'2786.34');
 const v=p.statement.version;p=await payrollSnapshot(db);assert.equal(p.statement.version,v);
 const m=await payrollSnapshot(db,ids.monwa,ids.em);assert.equal(fixed(m.statement.attendance_amount),'133.33');assert.equal(fixed(m.statement.total_amount),'1466.67');
 await assert.rejects(()=>payrollSnapshot(db,ids.noor,ids.em));await assert.rejects(()=>payrollSnapshot(db,ids.monwa,ids.en));
 assert.equal(fixed((await payrollSnapshot(db,ids.admin)).statement.total_amount),'2786.34');
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 await db.exec('reset role;set role authenticated;');await assert.rejects(()=>payrollSnapshot(db));
 }finally{await db.close();}
});
test('paid break, multiple periods, extra break, automatic correction and no doubled settlement',async()=>{
 const db=await createPayrollDB();try{
 let d=await command(db,{command:'in'});let session=d.session.id;
 await command(db,{command:'activity',session_id:session,title:'متابعة العملاء'});
 for(let n=541;n<=780;n++){
  await clock(db,`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`);
  d=await command(db,{command:'heartbeat',session_id:session});
  if(d.session&&Date.parse(d.now)>=Date.parse(d.session.next_confirmation_at)&&!d.session.break_started_at)await command(db,{command:'confirm',session_id:session});
  if(n===660)await command(db,{command:'break',session_id:session});
  if(n===705)await command(db,{command:'resume',session_id:session});
 }
 await command(db,{command:'out',session_id:session});
 await clock(db,'13:30');d=await command(db,{command:'in'});session=d.session.id;
 for(let n=811;n<=1020;n++){
  await clock(db,`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`);d=await command(db,{command:'heartbeat',session_id:session});
  if(d.session&&Date.parse(d.now)>=Date.parse(d.session.next_confirmation_at))await command(db,{command:'confirm',session_id:session});
 }
 let p=await payrollSnapshot(db);assert.equal(Number(p.attendance.credited_seconds),435*60);assert.equal(Number(p.attendance.missing_seconds),45*60);assert.equal(fixed(p.statement.attendance_amount),'20.09');
 // A valid correction replaces lost time without requiring financial approval.
 await db.query("insert into wf_attendance_sessions(id,employee_id,business_date,checked_in,checked_out,source) values(gen_random_uuid(),$1,'2026-10-24','2026-10-24T13:00:00+03:00','2026-10-24T13:30:00+03:00','correction')",[ids.en]);
 p=await payrollSnapshot(db);assert.equal(Number(p.attendance.missing_seconds),15*60);assert.equal(fixed(p.statement.attendance_amount),'6.70');
 assert.equal(fixed((await payrollSnapshot(db)).statement.total_amount),'2993.97');
 }finally{await db.close();}
});
test('approved leave, paid permission, weekly rest, joining date, future days and holidays',async()=>{
 const db=await createPayrollDB();try{
 await db.exec(`insert into wf_employee_requests(employee_id,kind,status,starts_at,ends_at) values('${ids.en}','leave','approved','2026-10-24T00:00:00+03:00','2026-10-24T23:59:59+03:00'),('${ids.em}','permission','approved','2026-10-24T09:00:00+03:00','2026-10-24T11:00:00+03:00');`);
 await clock(db,'17:00');let p=await payrollSnapshot(db);assert.equal(Number(p.attendance.required_seconds),0);
 p=await payrollSnapshot(db,ids.monwa,ids.em);assert.equal(Number(p.attendance.missing_seconds),6*3600);
 await db.exec("insert into wf_paid_calendar_days values('2026-10-24','إجازة مدفوعة')");p=await payrollSnapshot(db,ids.monwa,ids.em);assert.equal(Number(p.attendance.missing_seconds),0);
 await db.exec("reset role;update workforce_private.payroll_attendance_policy set starts_on='2026-10-16';set role service_role;set test.clock='2026-10-23T18:00:00+03:00';");
 p=await payrollSnapshot(db);assert.equal(Number(p.attendance.days),5); // Sun–Thu; no before-join or Friday charge.
 assert.equal(Number((await payrollSnapshot(db,ids.monwa,ids.em)).attendance.days),3);
 }finally{await db.close();}
});
test('insurance and incentives stay separate, zero floor, locked paid statements and payment revalidation',async()=>{
 const db=await createPayrollDB();try{
 await db.exec(`update wf_monthly_payroll set gross_amount=3100.67,items='[{"amount":"100"}]',deductions='[{"kind":"insurance","amount":"300","title":"التأمينات","reference":"تأمين"}]' where employee_id='${ids.en}';`);
 await clock(db,'17:00');let p=await payrollSnapshot(db);assert.equal(fixed(p.statement.total_amount),'2586.34');
 // Paid records are never rewritten by automatic attendance refresh.
 await db.query("update wf_monthly_payroll set status='approved',approved_by=$1,approved_at=now() where employee_id=$2",[ids.admin,ids.en]);
 p=await payrollSnapshot(db);const args=[ids.admin,p.statement.id,ids.en,'2026-10-01',p.statement.version,'pay',JSON.stringify({amount:'3000.67',reference:'صرف',reason:'توثيق صرف'}),crypto.randomUUID()];
 await assert.rejects(()=>db.query('select wf_payroll_command($1,$2,$3,$4,$5,$6,$7,$8)',args));
 await db.query("update wf_monthly_payroll set paid_amount=total_amount,status='paid' where employee_id=$1",[ids.en]);
 const before=await payrollSnapshot(db);await db.exec("set test.clock='2026-10-25T18:00:00+03:00'");p=await payrollSnapshot(db);assert.equal(fixed(p.statement.total_amount),fixed(before.statement.total_amount));
 await db.exec("update wf_monthly_payroll set gross_amount=1,basic_amount=1,allowances_amount=0 where employee_id='"+ids.em+"'");p=await payrollSnapshot(db,ids.monwa,ids.em);assert.equal(Number(p.statement.total_amount),0);assert.ok(Number(p.attendance.unapplied_amount)>0);
 }finally{await db.close();}
});
test('historical flexible attendance keeps after-5 hours; new cutoff is never applied retroactively',async()=>{
 const db=await createPayrollDB();try{
 await db.exec("reset role;update workforce_private.payroll_attendance_policy set starts_on='2026-10-01',cutoff_on='2026-10-24';set role service_role;set test.clock='2026-10-23T18:00:00+03:00';");
 await db.query("insert into wf_attendance_sessions(id,employee_id,business_date,checked_in,checked_out,source) values(gen_random_uuid(),$1,'2026-10-22','2026-10-22T12:00:00+03:00','2026-10-22T20:00:00+03:00','clock')",[ids.en]);
 const p=await payrollSnapshot(db);assert.equal(Number(p.attendance.required_seconds),5*8*3600);assert.equal(Number(p.attendance.credited_seconds),8*3600);
 assert.equal(p.attendance.missing_days.some(day=>day.day==='2026-10-22'),false);
 // Future/current unfinished flexible day is not a missing workday.
 assert.equal(p.attendance.through,'2026-10-22');
 }finally{await db.close();}
});
test('new monthly salaries initialize automatically and late payment checks use the latest attendance',async()=>{
 const db=await createPayrollDB();try{
 await db.query("update wf_monthly_payroll set status='approved',approved_at=now(),approved_by=$1 where employee_id=$2",[ids.admin,ids.en]);
 let p=await payrollSnapshot(db);const version=p.statement.version;
 await clock(db,'17:00');
 const args=[ids.admin,p.statement.id,ids.en,'2026-10-01',version,'pay',JSON.stringify({amount:'3000.67',reference:'مرجع صرف',reason:'تسجيل صرف الراتب'}),crypto.randomUUID()];
 await assert.rejects(()=>db.query('select wf_payroll_command($1,$2,$3,$4,$5,$6,$7,$8)',args),/المبلغ يتجاوز/);
 // The failed payment rolls back every intermediate attendance update.
 p=await payrollSnapshot(db);assert.equal(Number(p.statement.paid_amount),0);assert.equal(fixed(p.statement.total_amount),'2786.34');
 args[4]=p.statement.version;args[6]=JSON.stringify({amount:'2786.34',reference:'مرجع صحيح',reason:'تسجيل صرف الراتب'});args[7]=crypto.randomUUID();
 await db.query('select wf_payroll_command($1,$2,$3,$4,$5,$6,$7,$8)',args);p=await payrollSnapshot(db);assert.equal(p.statement.status,'paid');assert.equal(fixed(p.statement.paid_amount),'2786.34');
 await db.exec("set test.clock='2026-11-01T09:00:00+03:00';");p=await payrollSnapshot(db,ids.noor,ids.en,'2026-11-01');assert.equal(fixed(p.statement.total_amount),'6430.00');assert.equal(Number(p.attendance.missing_seconds),0);
 const m=await payrollSnapshot(db,ids.monwa,ids.em,'2026-11-01');assert.equal(fixed(m.statement.total_amount),'4000.00');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.monwa]);await db.exec('reset role;set role authenticated;');
 assert.equal((await db.query('select count(*)::int n from wf_monthly_payroll')).rows[0].n,2); // Only Monwa's Oct/Nov records.
 await db.exec('reset role;set role service_role;');assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close();}
});

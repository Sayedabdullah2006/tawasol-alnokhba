import test from 'node:test';import assert from 'node:assert/strict';
import {createDailyPayrollDB} from './helpers/daily-payroll-db.mjs';
import {payrollSnapshot} from './helpers/payroll-attendance-db.mjs';
import {ids,command,clock} from './helpers/work-session-db.mjs';
const tick=(db,date)=>db.query("select set_config('test.clock',$1,false)",[date]);
const read=async(db,employee=ids.en)=>(await payrollSnapshot(db,ids.admin,employee)).statement;
const period=async(db,employee,day,start='09:00',end='17:00')=>db.query("insert into wf_attendance_sessions(id,employee_id,business_date,checked_in,checked_out,source) values(gen_random_uuid(),$1,$2,$3,$4,'clock')",[employee,day,`${day}T${start}:00+03:00`,`${day}T${end}:00+03:00`]);

test('joining-month accrual excludes future salary and insurance and preserves the month-end ledger',async()=>{
 const db=await createDailyPayrollDB();try{
 await tick(db,'2026-10-23T12:00:00+03:00');
 for(const day of ['18','19','20','21','22'])await period(db,ids.en,`2026-10-${day}`);
 for(const day of ['20','21','22'])await period(db,ids.em,`2026-10-${day}`);
 const n=await read(db),m=await read(db,ids.em);
 assert.equal(n.daily_accrual.gross_amount,'1286.00');assert.equal(n.daily_accrual.insurance_amount,'86.00');assert.equal(n.daily_accrual.total_amount,'1200.00');
 assert.equal(m.daily_accrual.gross_amount,'533.33');assert.equal(m.daily_accrual.insurance_amount,'57.33');assert.equal(m.daily_accrual.total_amount,'476.00');
 assert.equal(Number(n.total_amount),2800);assert.equal(Number(m.total_amount),1428);
 await tick(db,'2026-10-24T09:00:00+03:00');assert.equal((await read(db)).daily_accrual.insurance_amount,'100.33');
 await db.query("update wf_employee_insurance_settings set effective_from='2026-10-25' where employee_id=$1",[ids.en]);assert.equal(Number((await read(db)).daily_accrual.insurance_amount),0);
 await db.query("update wf_employee_insurance_settings set effective_from='2026-10-18' where employee_id=$1",[ids.en]);
 await tick(db,'2026-10-17T12:00:00+03:00');assert.equal(Number((await read(db)).daily_accrual.total_amount),0);
 await tick(db,'2026-11-01T00:00:00+03:00');const closed=await read(db);assert.equal(closed.daily_accrual.closed,true);assert.equal(Number(closed.daily_accrual.total_amount),Number(closed.total_amount));
 }finally{await db.close();}
});

test('approved paid leave is fully earned; pending, rejected, unpaid and test requests do not exempt attendance',async()=>{
 const db=await createDailyPayrollDB();try{
 await tick(db,'2026-10-20T12:00:00+03:00');
 const insert=await db.query("insert into wf_employee_requests(employee_id,kind,status,leave_type,starts_at,ends_at) values($1,'leave','pending','paid','2026-10-20T00:00:00+03:00','2026-10-21T23:59:00+03:00') returning id",[ids.em]);
 const req=insert.rows[0].id;assert.equal(Number((await read(db,ids.em)).daily_accrual.total_amount),0);
 await db.query("update wf_employee_requests set status='approved' where id=$1",[req]);let p=await read(db,ids.em);assert.equal(p.daily_accrual.total_amount,'119.00');assert.equal(Number(p.daily_accrual.attendance_amount),0);
 await tick(db,'2026-10-22T09:00:00+03:00');p=await read(db,ids.em);assert.equal(Number(p.attendance_amount),0);assert.equal(Number(p.daily_accrual.total_amount),223.67);
 for(const update of ["status='rejected'","status='pending'","status='approved',leave_type='unpaid'","leave_type='paid',test_run_id=gen_random_uuid()"]){await db.query(`update wf_employee_requests set ${update} where id=$1`,[req]);p=await read(db,ids.em);assert.ok(Number(p.attendance_amount)>0);}
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close();}
});

test('current work accrues across check-ins, paid half-hour break and 17:00 closure without double settlement',async()=>{
 const db=await createDailyPayrollDB();try{
 // Isolate today so old missing days do not consume this test balance.
 await db.exec("reset role;update workforce_private.payroll_attendance_policy set starts_on='2026-10-24';set role service_role;");
 await clock(db,'09:00');let d=await command(db,{command:'in'});const id=d.session.id;
 const act=(name)=>command(db,{command:name,session_id:id});
 await command(db,{command:'task',session_id:id,task_id:ids.task});await clock(db,'09:01');await act('heartbeat');await act('break');await clock(db,'09:31');await act('heartbeat');await act('resume');await act('out');
 let p=await read(db);assert.equal(p.daily_accrual.current_credited_seconds,31*60);const early=Number(p.daily_accrual.total_amount);
 await period(db,ids.en,'2026-10-24','10:00','16:00');await clock(db,'16:00');p=await read(db);assert.equal(p.daily_accrual.current_credited_seconds,391*60);assert.ok(Number(p.daily_accrual.total_amount)>early);
 const before=Number(p.daily_accrual.total_amount);await clock(db,'17:00');p=await read(db);assert.ok(Math.abs(Number(p.daily_accrual.total_amount)-before)<=0.01);
 await clock(db,'20:00');assert.equal((await read(db)).daily_accrual.total_amount,p.daily_accrual.total_amount);
 }finally{await db.close();}
});

test('historical October keeps after-17 attendance, and Noor delegation never opens Monwa financial access',async()=>{
 const db=await createDailyPayrollDB();try{
 await tick(db,'2026-10-21T10:00:00+03:00');
 await period(db,ids.em,'2026-10-20','13:00','21:00');
 let p=await read(db,ids.em);assert.equal(Number(p.attendance_amount),0);
 await db.query('update wf_employees set can_view_team_summaries=true where id=$1',[ids.en]);
 assert.ok((await payrollSnapshot(db,ids.noor,ids.em)).statement.daily_accrual);
 await assert.rejects(()=>payrollSnapshot(db,ids.monwa,ids.en));
 await db.exec("set role authenticated;");await assert.rejects(()=>db.query('select workforce_private.daily_payroll_accrual(p) from wf_monthly_payroll p limit 1'));await db.exec('set role service_role;');
 // The same later hours under the new policy do not extend credited time beyond 17.
 await db.exec("reset role;update workforce_private.payroll_attendance_policy set cutoff_on='2026-10-20';set role service_role;");
 p=await read(db,ids.em);assert.ok(Number(p.attendance_amount)>0);
 }finally{await db.close();}
});

test('manager leave decision immediately restores earned pay through the same snapshot RPC',async()=>{
 const db=await createDailyPayrollDB();try{
 await tick(db,'2026-10-21T10:00:00+03:00');
 await db.query("insert into wf_leave_entitlements(employee_id,year,days,reason,updated_by) values($1,2026,2,'رصيد افتتاحي معتمد',$2)",[ids.em,ids.admin]);
 const request=crypto.randomUUID();await db.query("insert into wf_employee_requests(id,employee_id,kind,status,leave_type,starts_at,ends_at) values($1,$2,'leave','pending','paid','2026-10-20T00:00:00+03:00','2026-10-21T23:59:00+03:00')",[request,ids.em]);
 assert.ok(Number((await read(db,ids.em)).attendance_amount)>0);
 await db.query("select wf_decide_employee_request($1,$2,1,'approved','إجازة مدفوعة معتمدة')",[request,ids.admin]);
 const p=await read(db,ids.em);assert.equal(Number(p.attendance_amount),0);assert.equal(Number(p.daily_accrual.attendance_amount),0);assert.equal(p.daily_accrual.total_amount,'238.00');
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close();}
});

test('month-end daily balance reconciles for 28/30/31 days, manual items, and paid historical snapshots',async()=>{
 const db=await createDailyPayrollDB();try{
 await tick(db,'2026-11-01T10:00:00+03:00');
 await db.query("update wf_monthly_payroll set gross_amount=gross_amount+100,deductions='[{\"kind\":\"other\",\"amount\":\"50\",\"title\":\"سلفة\",\"reference\":\"مرجع\"}]' where employee_id=$1",[ids.en]);
 let p=await read(db);assert.equal(Number(p.daily_accrual.total_amount),Number(p.total_amount));
 await db.query("update wf_monthly_payroll set status='approved',approved_at=now(),approved_by=$1 where employee_id=$2",[ids.admin,ids.en]);
 await db.query("update wf_monthly_payroll set paid_amount=total_amount,status='paid' where employee_id=$1",[ids.en]);
 const frozen=(await read(db)).daily_accrual.total_amount;
 await period(db,ids.en,'2026-10-24');assert.equal((await read(db)).daily_accrual.total_amount,frozen);
 for(const [month,end,next] of [['2026-11-01','2026-11-30','2026-12-01'],['2027-01-01','2027-01-31','2027-02-01'],['2027-02-01','2027-02-28','2027-03-01']]){
  await tick(db,`${end}T17:00:00+03:00`);const v=(await payrollSnapshot(db,ids.admin,ids.em,month)).statement;
  assert.equal(v.daily_accrual.closed,true);assert.equal(Number(v.daily_accrual.total_amount),Number(v.total_amount));
  await tick(db,`${next}T00:00:00+03:00`);const after=(await payrollSnapshot(db,ids.admin,ids.em,month)).statement;assert.equal(after.daily_accrual.total_amount,v.daily_accrual.total_amount);
 }
 }finally{await db.close();}
});

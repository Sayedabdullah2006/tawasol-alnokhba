import test from 'node:test';import assert from 'node:assert/strict';
import {createWorkFinanceDB} from './helpers/work-finance-db.mjs';
import {payrollSnapshot} from './helpers/payroll-attendance-db.mjs';
import {ids,clock} from './helpers/work-session-db.mjs';
const insurance=p=>p.statement.deductions.find(d=>d.kind==='insurance');
test('insurance is 10.75% of basic plus housing only and joining October is prorated once',async()=>{
 const db=await createWorkFinanceDB();try{
 const n=await payrollSnapshot(db),m=await payrollSnapshot(db,ids.monwa,ids.em);
 assert.equal(Number(insurance(n).amount),200.67);assert.equal(Number(n.statement.total_amount),2800);
 assert.equal(Number(insurance(m).amount),172);assert.equal(Number(m.statement.total_amount),1428);
 const v=n.statement.version;assert.equal((await payrollSnapshot(db)).statement.version,v);
 await db.exec("set test.clock='2026-11-01T09:00:00+03:00'");const next=await payrollSnapshot(db,ids.noor,ids.en,'2026-11-01');assert.equal(Number(insurance(next).amount),430);assert.equal(Number(next.statement.total_amount),6000);
 }finally{await db.close();}
});
test('insurance, incentives, other deductions and automatic attendance reconcile without duplication',async()=>{
 const db=await createWorkFinanceDB();try{
 await clock(db,'17:00');let n=await payrollSnapshot(db);assert.equal(Number(n.statement.attendance_amount),214.33);assert.equal(Number(n.statement.total_amount),2585.67);
 await db.query(`update wf_monthly_payroll set gross_amount=gross_amount+100,deductions='[{"kind":"insurance","amount":"1","reference":"manual","title":"تأمين"},{"kind":"other","amount":"50","reference":"مرجع","title":"سلفة"}]' where employee_id=$1`,[ids.en]);
 n=await payrollSnapshot(db);assert.equal(n.statement.deductions.filter(d=>d.kind==='insurance').length,1);assert.equal(Number(insurance(n).amount),200.67);assert.equal(Number(n.statement.total_amount),2635.67);
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close();}
});
test('unpaid leave is not paid-attendance credit; paid leave is excluded and paid statements stay frozen',async()=>{
 const db=await createWorkFinanceDB();try{
 await db.query("insert into wf_employee_requests(employee_id,kind,status,leave_type,starts_at,ends_at) values($1,'leave','approved','unpaid','2026-10-24T00:00:00+03:00','2026-10-24T23:59:00+03:00')",[ids.en]);
 await clock(db,'17:00');let n=await payrollSnapshot(db);assert.equal(Number(n.statement.attendance_amount),214.33);
 await db.query("update wf_employee_requests set leave_type='paid' where employee_id=$1",[ids.en]);n=await payrollSnapshot(db);assert.equal(Number(n.statement.attendance_amount),0);
 await db.query("update wf_monthly_payroll set status='approved',approved_at=now(),approved_by=$1 where employee_id=$2",[ids.admin,ids.en]);
 await db.query("update wf_monthly_payroll set paid_amount=total_amount,status='paid' where employee_id=$1",[ids.en]);
 await db.query("update wf_employee_insurance_settings set rate=12 where employee_id=$1",[ids.en]);n=await payrollSnapshot(db);assert.equal(Number(insurance(n).amount),200.67);
 }finally{await db.close();}
});

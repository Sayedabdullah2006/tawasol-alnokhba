import test from 'node:test';import assert from 'node:assert/strict';
import {createLeaveSummaryDB,leaveBalance} from './helpers/leave-summary-db.mjs';
import {ids} from './helpers/work-session-db.mjs';
import {payrollSnapshot} from './helpers/payroll-attendance-db.mjs';
test('leave accrues only after month end; partial joining months, carryover and five-year increase',async()=>{
 const db=await createLeaveSummaryDB();try{
 await db.exec("set test.clock='2026-10-31T23:59:59+03:00'");let n=await leaveBalance(db,ids.noor,ids.en);assert.equal(n.available,0);assert.equal(n.pending_days,0.79);assert.equal(n.monthly_days,1.75);assert.equal(n.annual_days,21);
 assert.equal((await leaveBalance(db,ids.monwa,ids.em)).pending_days,0.68);
 await db.exec("set test.clock='2026-11-01T00:00:00+03:00'");n=await leaveBalance(db,ids.noor,ids.en);assert.equal(n.available,0.79);assert.equal(n.pending_days,1.75);
 await db.exec("set test.clock='2027-01-01T00:00:00+03:00'");n=await leaveBalance(db,ids.noor,ids.en);assert.equal(n.available,4.29);
 await db.exec(`update wf_employees set start_date='2026-01-01' where id='${ids.em}'`);assert.equal((await leaveBalance(db,ids.monwa,ids.em)).available,21);
 await db.exec(`update wf_employees set start_date='2021-01-01' where id='${ids.em}';set test.clock='2026-01-01T00:00:00+03:00'`);n=await leaveBalance(db,ids.monwa,ids.em);assert.equal(n.monthly_days,2.5);assert.equal(n.annual_days,30);
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close();}
});
test('explicit Noor delegation enables summary only; Monwa and task managers without the flag stay private',async()=>{
 const db=await createLeaveSummaryDB();try{
 await assert.rejects(()=>payrollSnapshot(db,ids.noor,ids.em));await assert.rejects(()=>leaveBalance(db,ids.noor,ids.em));
 await db.query('update wf_employees set can_view_team_summaries=true where id=$1',[ids.en]);
 assert.equal(Number((await payrollSnapshot(db,ids.noor,ids.em)).statement.gross_amount),1600);
 assert.equal((await leaveBalance(db,ids.noor,ids.em)).annual_days,21);
 await assert.rejects(()=>payrollSnapshot(db,ids.monwa,ids.en));await assert.rejects(()=>leaveBalance(db,ids.monwa,ids.en));
 const p=await payrollSnapshot(db,ids.noor,ids.em);
 await assert.rejects(()=>db.query('select wf_payroll_command($1,$2,$3,$4,$5,$6,$7,$8)',[ids.noor,p.statement.id,ids.em,'2026-10-01',p.statement.version,'approve',JSON.stringify({reason:'محاولة تعديل'}),crypto.randomUUID()]));
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.noor]);await db.exec('reset role;set role authenticated;');
 assert.equal((await db.query('select count(*)::int n from wf_monthly_payroll')).rows[0].n,1); // Delegation does not widen direct table RLS.
 await assert.rejects(()=>db.query('select wf_leave_balance($1,$2)',[ids.noor,ids.em]));
 }finally{await db.close();}
});
test('paid leave approval uses the earned bank, counts workdays only and cannot spend future accrual',async()=>{
 const db=await createLeaveSummaryDB();try{
 await db.exec(`update wf_employees set start_date='2026-01-01' where id='${ids.em}';set test.clock='2026-03-01T10:00:00+03:00'`);
 let b=await leaveBalance(db,ids.monwa,ids.em);assert.equal(b.available,3.5);
 const request=crypto.randomUUID();await db.query("insert into wf_employee_requests(id,employee_id,kind,status,starts_at,ends_at) values($1,$2,'leave','pending','2026-03-05T00:00:00+03:00','2026-03-07T23:59:00+03:00')",[request,ids.em]);
 await db.query("select wf_decide_employee_request($1,$2,1,'approved','إجازة معتمدة')",[request,ids.admin]);b=await leaveBalance(db,ids.monwa,ids.em);assert.equal(b.used,2);assert.equal(b.available,1.5); // Friday is excluded.
 const second=crypto.randomUUID();await db.query("insert into wf_employee_requests(id,employee_id,kind,status,starts_at,ends_at) values($1,$2,'leave','pending','2026-03-08T00:00:00+03:00','2026-03-10T23:59:00+03:00')",[second,ids.em]);
 await assert.rejects(()=>db.query("select wf_decide_employee_request($1,$2,1,'approved','إجازة معتمدة')",[second,ids.admin]),/رصيد الإجازة/);
 }finally{await db.close();}
});

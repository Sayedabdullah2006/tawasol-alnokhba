import test from 'node:test';import assert from 'node:assert/strict';
import {createOvertimeDB} from './helpers/overtime-db.mjs';import {ids} from './helpers/work-session-db.mjs';import {payrollSnapshot} from './helpers/payroll-attendance-db.mjs';
import {overtimeAmount} from '../src/lib/workforce/overtime.ts';
const request=async(db,employee=ids.en,start='2026-10-23T18:00:00+03:00',end='2026-10-23T20:00:00+03:00',run=null)=>(await db.query("insert into wf_employee_requests(employee_id,kind,status,title,starts_at,ends_at,test_run_id) values($1,'overtime','pending','عمل خارج الدوام',$2,$3,$4) returning *",[employee,start,end,run])).rows[0];
const approve=(db,r,actor=ids.admin,start=r.starts_at,end=r.ends_at)=>db.query('select wf_decide_overtime_request($1,$2,$3,$4,$5,$6)',[r.id,actor,r.version,'اعتماد ساعات العمل',start,end]);
const pay=async(db,e=ids.en)=>(await payrollSnapshot(db,ids.admin,e)).statement;

test('Noor and Monwa overtime quote uses actual hourly wage plus half basic; approval posts once',async()=>{
 const db=await createOvertimeDB();try{
 const n=await request(db),m=await request(db,ids.em);assert.equal(Number(n.amount),66.92);assert.equal(Number(m.amount),46.67);
 assert.equal(overtimeAmount('6430','3200',7200),'66.92');assert.equal(overtimeAmount('6430','3200',10800),'100.38');assert.equal(overtimeAmount('4000','3200',7200),'46.67');
 assert.equal(Number((await pay(db)).overtime_amount),0);const before=Number((await pay(db)).daily_accrual.total_amount);
 await approve(db,n);await approve(db,m);let p=await pay(db);assert.equal(Number(p.overtime_amount),66.92);assert.equal(Number(p.daily_accrual.total_amount),Number((before+66.92).toFixed(2)));
 assert.equal(Number((await pay(db,ids.em)).overtime_amount),46.67);
 await assert.rejects(()=>approve(db,n));assert.equal(Number((await pay(db)).overtime_amount),66.92);
 const version=p.version;assert.equal((await pay(db)).version,version);
 // Editing a salary with generated overtime must retain it exactly once.
 await db.query("select wf_payroll_command($1,$2,$3,'2026-10-01',$4,'save',$5,$6)",[ids.admin,p.id,ids.en,p.version,JSON.stringify({basic_amount:String(Number(p.basic_amount)+100),allowances_amount:String(p.allowances_amount),items:[],deductions:[],notes:'',reason:'تحديث كشف الراتب'}),crypto.randomUUID()]);p=await pay(db);assert.equal(Number(p.overtime_amount),66.92);assert.equal(Number(p.gross_amount),3167.59);
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close();}
});

test('manager adjusts hours atomically; unauthorized review, overlaps, normal hours and approved tampering fail',async()=>{
 const db=await createOvertimeDB();try{
 const r=await request(db);await assert.rejects(()=>approve(db,r,ids.noor));await assert.rejects(()=>approve(db,r,ids.monwa));
 await assert.rejects(()=>request(db,ids.en,'2026-10-23T19:00:00+03:00','2026-10-23T21:00:00+03:00'),/نفسها/);
 await approve(db,r,ids.admin,'2026-10-23T18:00:00+03:00','2026-10-23T21:00:00+03:00');assert.equal(Number((await pay(db)).overtime_amount),100.38);
 await assert.rejects(()=>db.query("update wf_employee_requests set amount=1 where id=$1",[r.id]),/محفوظ/);
 await assert.rejects(()=>request(db,ids.en,'2026-10-24T16:00:00+03:00','2026-10-24T18:00:00+03:00'),/خارج فترة الدوام/);
 await assert.rejects(()=>request(db,ids.em,'2026-10-23T19:00:00+03:00','2026-10-23T18:00:00+03:00'),/فترة خارج دوام/);
 await request(db,ids.em,'2026-10-24T23:00:00+03:00','2026-10-25T00:00:00+03:00');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.monwa]);await db.exec('set role authenticated;');const rows=(await db.query('select employee_id from wf_employee_requests')).rows;assert.ok(rows.every(x=>x.employee_id===ids.em));
 }finally{await db.close();}
});

test('cancelled/rejected requests earn nothing; silent test approvals never touch real payroll',async()=>{
 const db=await createOvertimeDB();try{
 const r=await request(db);await db.query("select wf_decide_employee_request($1,$2,1,'cancelled','إلغاء الطلب')",[r.id,ids.noor]);
 const rejected=await request(db);await db.query("select wf_decide_employee_request($1,$2,1,'rejected','رفض الطلب')",[rejected.id,ids.admin]);assert.equal(Number((await pay(db)).overtime_amount),0);
 const run=(await db.query("select wf_test_run('start',$1,null) value",[ids.admin])).rows[0].value.id;
 const simulated=await request(db,ids.en,undefined,undefined,run);await approve(db,simulated);assert.equal(Number((await pay(db)).overtime_amount),0);
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close();}
});

test('frozen paid statements are not rewritten; approved overtime carries into the next open month',async()=>{
 const db=await createOvertimeDB();try{
 let p=await pay(db);await db.query("update wf_monthly_payroll set status='approved',approved_at=now(),approved_by=$1 where id=$2",[ids.admin,p.id]);
 await db.query("update wf_monthly_payroll set status='paid',paid_amount=total_amount where id=$1",[p.id]);const frozen=await pay(db);
 const r=await request(db);await approve(db,r);p=await pay(db);assert.equal(Number(p.total_amount),Number(frozen.total_amount));assert.equal(Number(p.overtime_amount),0);
 const approved=(await db.query('select overtime_details from wf_employee_requests where id=$1',[r.id])).rows[0];assert.equal(approved.overtime_details.payroll_month,'2026-11-01');
 await db.exec("set test.clock='2026-11-01T10:00:00+03:00';");const next=(await payrollSnapshot(db,ids.admin,ids.en,'2026-11-01')).statement;
 assert.equal(Number(next.overtime_amount),66.92);assert.equal(Number(next.daily_accrual.gross_amount),66.92);
 }finally{await db.close();}
});

import test from 'node:test';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';
import {createExpenseDB} from './helpers/expense-db.mjs';import {ids} from './helpers/work-session-db.mjs';import {payrollSnapshot} from './helpers/payroll-attendance-db.mjs';
const invoice=(content=randomUUID())=>({id:randomUUID(),filename:'فاتورة.pdf',mime_type:'application/pdf',size_bytes:100,sha256:createHash('sha256').update(content).digest('hex'),object_path:'requests/local/invoice'});
const request=async(db,{employee=ids.en,amount='150.00',files=[invoice()],run=null}={})=>(await db.query("insert into wf_employee_requests(employee_id,kind,status,title,amount,attachments,test_run_id) values($1,'expenses','pending','طباعة بروفايل الشركة',$2,$3,$4) returning *",[employee,amount,JSON.stringify(files),run])).rows[0];
const approve=(db,r,actor=ids.admin)=>db.query("select wf_decide_employee_request($1,$2,$3,'approved','تم التحقق من الفاتورة')",[r.id,actor,r.version]);
const payroll=async(db,employee=ids.en,month='2026-10-01')=>(await payrollSnapshot(db,ids.admin,employee,month)).statement;
test('both employees receive approved invoice amounts exactly once, separate from wages, insurance and attendance',async()=>{
 const db=await createExpenseDB();try{
 for(const employee of [ids.en,ids.em]){
  const before=await payroll(db,employee),r=await request(db,{employee});assert.equal(Number((await payroll(db,employee)).reimbursement_amount),0);
  await approve(db,r);let p=await payroll(db,employee);
  assert.equal(Number(p.reimbursement_amount),150);assert.equal(p.reimbursements.length,1);assert.equal(p.reimbursements[0].request_id,r.id);
  assert.equal(p.reimbursements[0].invoices[0].filename,'فاتورة.pdf');assert.equal(p.reimbursements[0].invoices[0].sha256,undefined);
  for(const field of ['gross_amount','basic_amount','allowances_amount','attendance_amount'])assert.equal(Number(p[field]),Number(before[field]));
  assert.deepEqual(p.insurance_details,before.insurance_details);
  assert.equal(Number(p.total_amount),Number((Number(before.total_amount)+150).toFixed(2)));
  assert.equal(Number(p.daily_accrual.total_amount),Number((Number(before.daily_accrual.total_amount)+150).toFixed(2)));
  await assert.rejects(()=>approve(db,r));const version=p.version;p=await payroll(db,employee);assert.equal(p.version,version);assert.equal(Number(p.reimbursement_amount),150);
 }
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close()}
});
test('invoice is required and identical bytes cannot be claimed under another name, request or employee',async()=>{
 const db=await createExpenseDB();try{
 await assert.rejects(()=>request(db,{files:[]}),/فاتورة/);
 await assert.rejects(()=>request(db,{files:[{...invoice(),mime_type:'text/plain'}]}),/PDF/);
 await assert.rejects(()=>request(db,{files:[{...invoice(),sha256:undefined}]}),/التحقق/);
 const file=invoice();await assert.rejects(()=>request(db,{files:[file,{...file,id:randomUUID()}]}),/أكثر من مرة/);
 const r=await request(db,{files:[file]});
 await assert.rejects(()=>request(db,{employee:ids.em,files:[{...file,id:randomUUID(),filename:'نسخة جديدة.pdf'}]}),/سابق/);
 await approve(db,r);await assert.rejects(()=>request(db,{files:[file]}),/سابق/);
 await assert.rejects(()=>db.query('update wf_employee_requests set amount=1 where id=$1',[r.id]),/محفوظ/);
 await assert.rejects(()=>db.query("update wf_employee_requests set status='cancelled' where id=$1",[r.id]),/محفوظ/);
 }finally{await db.close()}
});
test('only manager approves; rejected/cancelled invoices earn nothing and may be resubmitted',async()=>{
 const db=await createExpenseDB();try{
 const file=invoice(),r=await request(db,{files:[file]});await assert.rejects(()=>approve(db,r,ids.noor));await assert.rejects(()=>approve(db,r,ids.monwa));
 await db.query("select wf_decide_employee_request($1,$2,1,'cancelled','إلغاء الطلب')",[r.id,ids.noor]);
 const retry=await request(db,{files:[file]});await db.query("select wf_decide_employee_request($1,$2,1,'rejected','الفاتورة غير معتمدة')",[retry.id,ids.admin]);
 assert.equal(Number((await payroll(db)).reimbursement_amount),0);
 const final=await request(db,{files:[file]});await approve(db,final);assert.equal(Number((await payroll(db)).reimbursement_amount),150);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.monwa]);await db.exec('set role authenticated');
 assert.equal((await db.query('select * from wf_employee_requests')).rows.length,0);
 await assert.rejects(()=>db.query("update wf_employee_requests set amount=1"));
 }finally{await db.close()}
});
test('salary edits and actual payroll payment retain the reimbursement once; overtime remains independent',async()=>{
 const db=await createExpenseDB();try{
 const r=await request(db);await approve(db,r);
 const ot=(await db.query("insert into wf_employee_requests(employee_id,kind,status,title,starts_at,ends_at) values($1,'overtime','pending','خارج دوام','2026-10-24T18:00+03:00','2026-10-24T20:00+03:00') returning *",[ids.en])).rows[0];
 await db.query('select wf_decide_overtime_request($1,$2,1,$3,$4,$5)',[ot.id,ids.admin,'اعتماد العمل',ot.starts_at,ot.ends_at]);
 let p=await payroll(db);assert.equal(Number(p.overtime_amount),66.92);assert.equal(Number(p.reimbursement_amount),150);
 await db.query("select wf_payroll_command($1,$2,$3,'2026-10-01',$4,'save',$5,$6)",[ids.admin,p.id,ids.en,p.version,JSON.stringify({basic_amount:String(Number(p.basic_amount)+100),allowances_amount:String(p.allowances_amount),items:[],deductions:[],notes:'',reason:'تحديث الراتب'}),randomUUID()]);
 p=await payroll(db);assert.equal(Number(p.reimbursement_amount),150);assert.equal(p.reimbursements.length,1);assert.equal(Number(p.gross_amount),3167.59);
 await db.query("select wf_payroll_command($1,$2,$3,'2026-10-01',$4,'approve',$5,$6)",[ids.admin,p.id,ids.en,p.version,JSON.stringify({reason:'اعتماد الكشف'}),randomUUID()]);p=await payroll(db);
 await db.query("select wf_payroll_command($1,$2,$3,'2026-10-01',$4,'pay',$5,$6)",[ids.admin,p.id,ids.en,p.version,JSON.stringify({reason:'توثيق الصرف',amount:String(p.total_amount),reference:'حوالة-001'}),randomUUID()]);
 const paid=await payroll(db);assert.equal(paid.status,'paid');assert.equal(Number(paid.paid_amount),Number(p.total_amount));assert.equal(Number(paid.reimbursement_amount),150);
 }finally{await db.close()}
});
test('a paid month is frozen; newly approved expense carries forward with its invoice',async()=>{
 const db=await createExpenseDB();try{
 let p=await payroll(db);await db.query("update wf_monthly_payroll set status='approved',approved_at=now(),approved_by=$1 where id=$2",[ids.admin,p.id]);await db.query("update wf_monthly_payroll set status='paid',paid_amount=total_amount where id=$1",[p.id]);
 const frozen=await payroll(db),r=await request(db);await approve(db,r);p=await payroll(db);assert.equal(Number(p.total_amount),Number(frozen.total_amount));assert.equal(Number(p.reimbursement_amount),0);
 assert.equal((await db.query('select expense_details from wf_employee_requests where id=$1',[r.id])).rows[0].expense_details.payroll_month,'2026-11-01');
 await db.exec("set test.clock='2026-11-01T10:00:00+03:00'");p=await payroll(db,ids.en,'2026-11-01');assert.equal(Number(p.reimbursement_amount),150);assert.equal(p.reimbursements[0].request_id,r.id);
 assert.equal(Number(p.daily_accrual.gross_amount),0);assert.equal(Number(p.daily_accrual.total_amount),150);
 }finally{await db.close()}
});
test('partial salary payments and subsequent reimbursement approval keep the remaining balance consistent',async()=>{
 const db=await createExpenseDB();try{
 let p=await payroll(db);
 await db.query("select wf_payroll_command($1,$2,$3,'2026-10-01',$4,'approve',$5,$6)",[ids.admin,p.id,ids.en,p.version,JSON.stringify({reason:'اعتماد الكشف'}),randomUUID()]);p=await payroll(db);
 await db.query("select wf_payroll_command($1,$2,$3,'2026-10-01',$4,'pay',$5,$6)",[ids.admin,p.id,ids.en,p.version,JSON.stringify({reason:'صرف جزئي',amount:'100',reference:'حوالة-جزئية'}),randomUUID()]);
 const before=await payroll(db),r=await request(db);await approve(db,r);p=await payroll(db);
 assert.equal(Number(p.total_amount),Number((Number(before.total_amount)+150).toFixed(2)));assert.equal(Number(p.paid_amount),100);
 const remaining=(Number(p.total_amount)-100).toFixed(2);
 await db.query("select wf_payroll_command($1,$2,$3,'2026-10-01',$4,'pay',$5,$6)",[ids.admin,p.id,ids.en,p.version,JSON.stringify({reason:'استكمال الصرف',amount:remaining,reference:'حوالة-ختامية'}),randomUUID()]);p=await payroll(db);
 assert.equal(p.status,'paid');assert.equal(Number(p.paid_amount),Number(p.total_amount));assert.equal(Number(p.reimbursement_amount),150);
 }finally{await db.close()}
});
test('scoped expense tests never alter real finance, and future refreshes do not double closed-month reimbursements',async()=>{
 const db=await createExpenseDB();try{
 const run=(await db.query("select wf_test_run('start',$1,null) value",[ids.admin])).rows[0].value.id;
 const simulated=await request(db,{run});await approve(db,simulated);assert.equal(Number((await payroll(db)).reimbursement_amount),0);
 const r=await request(db,{files:simulated.attachments});await approve(db,r);await db.exec("set test.clock='2026-11-02T12:00:00+03:00'");const p=await payroll(db);
 assert.equal(p.daily_accrual.closed,true);assert.equal(Number(p.reimbursement_amount),150);assert.equal(Number(p.daily_accrual.total_amount),Number(p.total_amount));
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 }finally{await db.close()}
});

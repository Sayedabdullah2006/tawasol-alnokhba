// Local-only interactive preview backed by the same SQL migration as the integration tests.
import http from 'node:http';
import {ids,command,snapshot,clock,at} from '../tests/helpers/work-session-db.mjs';
import {summarizeAttendance} from '../src/lib/workforce/attendance-summary.ts';
import {payrollSnapshot} from '../tests/helpers/payroll-attendance-db.mjs';
import {readFile} from 'node:fs/promises';
import {leaveBalance} from '../tests/helpers/leave-summary-db.mjs';
import {createDailyPayrollDB} from '../tests/helpers/daily-payroll-db.mjs';
const createPreviewDB=async()=>{const value=await createDailyPayrollDB();await value.query('update wf_employees set can_view_team_summaries=true where id=$1',[ids.en]);return value;};
let db=await createPreviewDB(),minute=540;
let currentDB=null,currentRecords=[];const capturedAt=new Date().toISOString();
try{
 currentRecords=JSON.parse(await readFile(new URL('../.preview/payroll-current.json',import.meta.url),'utf8'));
 currentDB=await createPreviewDB();
 await currentDB.exec("reset role;update workforce_private.payroll_attendance_policy set starts_on='2026-10-01';set role service_role;");
 await currentDB.query("select set_config('test.clock',$1,false)",[capturedAt]);
 for(const employee of currentRecords){const employeeId=employee.key==='noor'?ids.en:ids.em;
  await currentDB.query('update wf_employees set full_name=$1,start_date=$2 where id=$3',[employee.full_name,employee.start_date,employeeId]);
  if(employee.insurance_rate!=null)await currentDB.query('update wf_employee_insurance_settings set rate=$1 where employee_id=$2',[employee.insurance_rate,employeeId]);
  await currentDB.query('delete from wf_compensation_versions where employee_id=$1',[employeeId]);
  await currentDB.query('insert into wf_compensation_versions values($1,$2,$3,$4,1)',[employeeId,employee.salary.basic_salary,JSON.stringify(employee.salary.allowances),employee.salary.effective_from]);
  await currentDB.query('update wf_monthly_payroll set basic_amount=$1,allowances_amount=$2,gross_amount=$3,deductions=$4 where employee_id=$5',[employee.payroll.basic_amount,employee.payroll.allowances_amount,employee.payroll.gross_amount,JSON.stringify(employee.payroll.deductions),employeeId]);
  for(const period of employee.attendance)await currentDB.query("insert into wf_attendance_sessions(id,employee_id,business_date,checked_in,checked_out,source) values(gen_random_uuid(),$1,$2,$3,$4,'clock')",[employeeId,period.business_date,period.checked_in,period.checked_out]);
 }
}catch(e){console.log('Current-data preview unavailable:',e.message);}
const time=()=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin&&!/^http:\/\/(localhost|127\.0\.0\.1):31\d\d$/.test(origin)){res.writeHead(403).end();return;}
 res.setHeader('Access-Control-Allow-Origin',origin||'http://localhost:3113');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 try{
  const url=new URL(req.url,'http://localhost');const actor=url.searchParams.get('employee')==='monwa'?ids.monwa:ids.noor;
  if(url.searchParams.get('view')==='current'){
   if(req.method!=='GET')throw Error('نسخة الوضع الحالي للعرض فقط');
   if(!currentDB)throw Error('لا توجد نسخة محلية من الوضع الحالي');
   const key=url.searchParams.get('employee')==='monwa'?'monwa':'noor',employee=currentRecords.find(e=>e.key===key),employeeId=key==='noor'?ids.en:ids.em,viewer=url.searchParams.get('viewer')==='noor'?ids.noor:actor;
   const payroll=await payrollSnapshot(currentDB,viewer,employeeId);const leave=await leaveBalance(currentDB,viewer,employeeId);
   const periods=(await currentDB.query('select * from wf_attendance_sessions where employee_id=$1',[employeeId])).rows;
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({now:capturedAt,todaySeconds:0,session:null,lastSession:null,active:null,breakUsedSeconds:0,tasks:employee.tasks,
    fullName:employee.full_name,employeeId,leave,payroll:payroll.statement,summary:summarizeAttendance({periods,startDate:employee.start_date,month:'2026-10',now:new Date(capturedAt)})}));return;
  }
  const read=async()=>{const data=await snapshot(db,actor);const employeeId=actor===ids.noor?ids.en:ids.em;const payroll=await payrollSnapshot(db,actor,employeeId);const periods=(await db.query('select * from wf_attendance_sessions where employee_id=$1',[employeeId])).rows;return {...data,employeeId,leave:await leaveBalance(db,actor,employeeId),payroll:payroll.statement,summary:summarizeAttendance({periods,startDate:actor===ids.noor?'2026-10-18':'2026-10-20',month:'2026-10',now:new Date(at(time()))})};};
  if(req.method==='POST'){
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('الطلب كبير');}const body=JSON.parse(raw);
   if(url.pathname==='/advance'){
    const amount=Math.min(480,Math.max(0,Number(body.minutes)||0));
    for(let n=0;n<amount;n++) {minute++;await clock(db,time());if(body.connected){const d=await snapshot(db,actor);if(d.session)await command(db,{command:'heartbeat',session_id:d.session.id},actor);}}
   }else if(url.pathname==='/reset'){await db.close();db=await createPreviewDB();minute=540;}
   else await command(db,body,actor);
  }
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await read()));
 }catch(e){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:e.message}));}
});
server.listen(3122,'127.0.0.1',()=>console.log('Isolated work-session preview: http://127.0.0.1:3122 — no mail or production connection'));
process.on('SIGINT',async()=>{server.close();await db.close();await currentDB?.close();process.exit(0);});

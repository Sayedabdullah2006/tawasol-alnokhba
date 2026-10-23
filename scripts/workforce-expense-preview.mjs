// Disposable loopback database and files only. No cloud clients or mail transport.
import http from 'node:http';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';import {PDFDocument,StandardFonts} from 'pdf-lib';
import {createExpenseDB} from '../tests/helpers/expense-db.mjs';import {ids} from '../tests/helpers/work-session-db.mjs';import {payrollSnapshot} from '../tests/helpers/payroll-attendance-db.mjs';
const db=await createExpenseDB(),uploads=new Map();await db.query("select set_config('test.clock',$1,false)",[new Date().toISOString()]);
try{for(const e of JSON.parse(await readFile(new URL('../.preview/payroll-current.json',import.meta.url),'utf8'))){const id=e.key==='noor'?ids.en:ids.em;await db.query('update wf_employees set full_name=$1 where id=$2',[e.full_name,id]);for(const a of e.attendance)await db.query("insert into wf_attendance_sessions(id,employee_id,business_date,checked_in,checked_out,source) values(gen_random_uuid(),$1,$2,$3,$4,'clock')",[id,a.business_date,a.checked_in,a.checked_out]);}}catch{console.log('Using isolated salary fixtures');}
await mkdir(new URL('../.preview/',import.meta.url),{recursive:true});const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([500,350]);page.drawText('LOCAL PREVIEW - Printing invoice',{x:35,y:290,size:20,font});page.drawText('Invoice: LOCAL-INV-001   |   Total: SAR 150.00',{x:35,y:240,size:13,font});page.drawText('Company profile printing - no real payment',{x:35,y:210,size:13,font});await writeFile(new URL('../.preview/expense-invoice.pdf',import.meta.url),await pdf.save());
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;if(origin&&!/^http:\/\/(localhost|127\.0\.0\.1):31\d\d$/.test(origin)){res.writeHead(403).end();return;}
 res.setHeader('Access-Control-Allow-Origin',origin||'http://localhost:3113');res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS,DELETE');res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 try{
 const url=new URL(req.url,'http://localhost'),employee=url.searchParams.get('employee')==='monwa'?ids.em:ids.en,actor=employee===ids.en?ids.noor:ids.monwa,admin=url.searchParams.get('admin')==='true';
 if(url.pathname==='/attachment'){
  const r=(await db.query('select employee_id,attachments from wf_employee_requests where id=$1',[url.searchParams.get('request')])).rows[0];
  if(!r||!admin&&r.employee_id!==employee){res.writeHead(404).end();return;}
  const file=r.attachments.find(f=>f.id===url.searchParams.get('file')),bytes=file&&uploads.get(file.id);if(!bytes){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.mime_type);res.setHeader('Content-Disposition',`${url.searchParams.get('preview')==='true'?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(file.filename)}`);res.setHeader('X-Content-Type-Options','nosniff');res.end(bytes);return;
 }
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>21*1024*1024)throw Error('الملف كبير');chunks.push(chunk);}
 const raw=Buffer.concat(chunks);let body={};
 if(req.method==='POST'){
  if(admin)throw Error('رفع الطلب للموظفة فقط');const form=await new Response(raw,{headers:{'Content-Type':req.headers['content-type']}}).formData();body=Object.fromEntries(form);
  if(body.kind!=='expenses')throw Error('المعاينة لتعويض مصروفات العمل');const files=[];
  for(const file of form.getAll('files'))if(file instanceof File&&file.size){const bytes=Buffer.from(await file.arrayBuffer()),id=randomUUID();uploads.set(id,bytes);files.push({id,filename:file.name,mime_type:file.type,size_bytes:file.size,sha256:createHash('sha256').update(bytes).digest('hex'),object_path:`requests/${body.request_key}/${id}`});}
  await db.query("insert into wf_employee_requests(id,employee_id,kind,status,title,body,amount,attachments,fingerprint) values($1,$2,'expenses','pending',$3,$4,$5,$6,$7) on conflict(id) do nothing",[body.request_key,employee,body.title,body.body,body.amount,JSON.stringify(files),body.request_key]);
 }else if(req.method==='PATCH'){
  body=JSON.parse(raw);await db.query('select wf_decide_employee_request($1,$2,$3,$4,$5)',[body.id,admin?ids.admin:actor,body.version,body.decision,body.reason||'إلغاء الطلب']);
 }else if(req.method==='DELETE'){
  await db.query('delete from wf_employee_requests');await db.query('update wf_monthly_payroll set version=version+1');uploads.clear();
 }
 let rows=(await db.query('select r.*,e.full_name as "employeeName" from wf_employee_requests r join wf_employees e on e.id=r.employee_id where ($1 or r.employee_id=$2) order by created_at desc',[admin,employee])).rows;
 const status=url.searchParams.get('status');if(status)rows=rows.filter(r=>r.status===status);
 const statement=(await payrollSnapshot(db,actor,employee)).statement;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({requests:rows,count:rows.length,statement}));
 }catch(e){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:e.message}));}
});server.listen(3124,'127.0.0.1',()=>console.log('Silent expense preview: http://127.0.0.1:3124'));
process.on('SIGINT',async()=>{server.close();uploads.clear();await db.close();process.exit(0);});

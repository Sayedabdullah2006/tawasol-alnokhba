import test from 'node:test';
import assert from 'node:assert/strict';
import {renderWorkforceEmail,workforceEmailContent} from '../supabase/functions/_shared/workforce-email.ts';
import {createNotificationDB,ids} from './helpers/notification-db.mjs';
const mail={email:'noor@example.com',name:'نور',kind:'changes',title:'مهمتك تحتاج تعديلًا',taskTitle:'استراتيجية الشركة',body:'استراتيجية الشركة\nيرجى إضافة مؤشرات الأداء\nمرفقات المراجعة:\nملاحظات.pdf',href:'/employee/work/tasks/'+ids.task,createdAt:'2026-10-23T09:00:00Z',dueAt:'2026-10-31T14:00:00Z',deliverable:'وصف طويل لا يلزم تكراره في كل حدث'};
test('task mail has a precise subject, one task title and actual review notes',()=>{
 const result=renderWorkforceEmail(mail);
 assert.match(result.subject,/مهمتك تحتاج تعديلًا · استراتيجية الشركة/);
 assert.equal(result.text.split('المهمة: استراتيجية الشركة').length-1,1);
 assert.match(result.text,/ملاحظات المراجعة: يرجى إضافة مؤشرات الأداء/);
 assert.match(result.text,/ملاحظات.pdf/);
 assert.doesNotMatch(result.text,/المطلوب تسليمه|وصف طويل/);
 assert.doesNotMatch(result.html,/تعرض التفاصيل بعد|بوابة فريق تواصل/);
 assert.equal((result.html.match(/<a href=/g)||[]).length,2); // One action + website footer.
});
test('long decisions are excerpted only in mail; the source is untouched and escaping remains safe',()=>{
 const source={...mail,body:mail.taskTitle+'\n<script>note</script>'+ 'ملاحظة '.repeat(500)};
 const result=renderWorkforceEmail(source),content=workforceEmailContent(source);
 assert.ok(content.body.length<=901);assert.equal(content.abbreviated,true);
 assert.match(result.text,/بقية التفاصيل داخل النظام/);
 assert.match(result.html,/&lt;script&gt;/);assert.doesNotMatch(result.html,/<script>/);
 assert.ok(source.body.length>3000);assert.ok(result.text.length<1500);
});
test('assignment includes a short deliverable; status mail carries the transition without repeated instructions',()=>{
 const result=renderWorkforceEmail({...mail,kind:'state',body:mail.taskTitle+'\nالحالة السابقة: جديدة\nالحالة الجديدة: قيد التنفيذ'});
 assert.match(result.text,/الحالة السابقة: جديدة/);assert.match(result.text,/الحالة الجديدة: قيد التنفيذ/);
 assert.doesNotMatch(result.text,/المطلوب تسليمه/);
 const assigned=renderWorkforceEmail({...mail,kind:'assigned',body:mail.taskTitle,title:'أُسندت إليك مهمة جديدة',deliverable:'ملف الاستراتيجية'});
 assert.match(assigned.text,/المطلوب تسليمه: ملف الاستراتيجية/);assert.doesNotMatch(assigned.text,/التفاصيل:/);
});
test('overlapping task triggers create one notice and immutable delivery per recipient/version',async()=>{
 const db=await createNotificationDB();try{
 // Admin is both the owner receiving every new task and the assigned person.
 await db.exec(`insert into wf_tasks(id,assignee_admin_id,co_assignee_ids,updated_by) values('${ids.task}','${ids.admin}',array['${ids.me}'::uuid],'${ids.noor}')`);
 let rows=(await db.query(`select recipient_id,count(*)::int n from wf_notifications group by recipient_id`)).rows;
 assert.equal(rows.length,2);assert.ok(rows.every(r=>r.n===1));
 await db.exec(`update wf_tasks set column_id='10000000-0000-4000-8000-000000000002',version=2,updated_by='${ids.noor}' where id='${ids.task}'`);
 rows=(await db.query(`select * from wf_notifications where event_key='task-change:${ids.task}:2'`)).rows;
 assert.equal(rows.length,2);assert.ok(rows.every(r=>r.body.includes('الحالة الجديدة: قيد التنفيذ')));
 assert.equal((await db.query('select count(*)::int n from wf_notification_deliveries')).rows[0].n,4);
 // Same logical event from another trigger/retry is ignored; a new version is retained.
 await db.exec(`insert into wf_notifications(recipient_id,kind,title,body,task_id,event_key) values('${ids.admin}','state','تغيير','تغيير','${ids.task}','task:${ids.task}:2:state') on conflict(recipient_id,event_key) do nothing`);
 assert.equal((await db.query('select count(*)::int n from wf_notification_deliveries')).rows[0].n,4);
 }finally{await db.close()}
});
test('shared-task submission and return each generate a single actionable mail, with no extra state mail',async()=>{
 const db=await createNotificationDB();try{
 await db.exec(`insert into wf_tasks(id,assignee_id,co_assignee_ids,updated_by) values('${ids.task}','${ids.ne}',array['${ids.me}'::uuid],'${ids.admin}');delete from wf_notification_deliveries;delete from wf_notifications;
 insert into wf_task_submissions(id,task_id,submitted_by) values('${ids.submission}','${ids.task}','${ids.noor}');
 update wf_tasks set column_id='10000000-0000-4000-8000-000000000003',version=2,updated_by='${ids.noor}' where id='${ids.task}';`);
 assert.deepEqual((await db.query('select kind from wf_notifications')).rows,[{kind:'submitted'}]);
 await db.exec(`delete from wf_notification_deliveries;delete from wf_notifications;
 update wf_task_submissions set status='changes',decided_by='${ids.admin}',decision_reason='يرجى تعديل مؤشرات الأداء' where id='${ids.submission}';
 update wf_tasks set column_id='10000000-0000-4000-8000-000000000004',version=3,updated_by='${ids.admin}' where id='${ids.task}';`);
 const staff=(await db.query(`select recipient_id,kind,body from wf_notifications where recipient_id<>'${ids.admin}'`)).rows;
 assert.equal(staff.length,2);assert.ok(staff.every(r=>r.kind==='changes'&&r.body.includes('مؤشرات الأداء')));
 }finally{await db.close()}
});
test('request decisions contain employee, kind, period and reason, and unchanged saves do not notify',async()=>{
 const db=await createNotificationDB();try{
 await db.exec(`insert into wf_employee_requests(id,employee_id,kind,title,starts_at,ends_at) values('${ids.request}','${ids.me}','leave','إجازة شخصية','2026-10-25T06:00Z','2026-10-25T14:00Z');
 update wf_employee_requests set status='approved',decision_reason='معتمدة ليوم واحد' where id='${ids.request}';
 update wf_employee_requests set title=title where id='${ids.request}';`);
 const rows=(await db.query('select recipient_id,body from wf_notifications order by created_at,id')).rows;
 assert.equal(rows.length,2);assert.ok(rows.every(r=>r.body.includes('الموظفة: منوه')&&r.body.includes('نوع الطلب: إجازة')));
 const employee=rows.find(r=>r.recipient_id===ids.monwa);assert.match(employee.body,/سبب القرار: معتمدة ليوم واحد/);
 assert.match(employee.body,/2026-10-25 09:00/);
 }finally{await db.close()}
});
test('comments and attachments identify the new content for both assignees; test resources remain completely silent',async()=>{
 const db=await createNotificationDB();try{
 await db.exec(`insert into wf_tasks(id,assignee_id,co_assignee_ids,updated_by) values('${ids.task}','${ids.ne}',array['${ids.me}'::uuid],'${ids.admin}');delete from wf_notification_deliveries;delete from wf_notifications;
 insert into wf_task_comments values(gen_random_uuid(),'${ids.task}','يرجى مراجعة الصفحة الثانية','${ids.admin}');
 insert into wf_task_attachments(id,task_id,filename,created_by) values(gen_random_uuid(),'${ids.task}','الخطة.pdf','${ids.admin}');`);
 const rows=(await db.query('select kind,body from wf_notifications')).rows;
 assert.equal(rows.length,4);assert.ok(rows.filter(r=>r.kind==='comment').every(r=>r.body.includes('الصفحة الثانية')));
 assert.ok(rows.filter(r=>r.kind==='attachment').every(r=>r.body.includes('الخطة.pdf')));
 await db.exec(`delete from wf_notification_deliveries;delete from wf_notifications;update wf_tasks set test_run_id=gen_random_uuid(),version=2,title='تعديل صامت' where id='${ids.task}';
 insert into wf_employee_requests(id,employee_id,kind,title,test_run_id) values('${ids.request}','${ids.me}','general','طلب صامت',gen_random_uuid());`);
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from wf_notification_deliveries')).rows[0].n,0);
 }finally{await db.close()}
});

test('summary delegation alone is quiet, while real employee profile changes still notify',async()=>{
 const db=await createNotificationDB();try{
 await db.query('update wf_employees set can_view_team_summaries=true where id=$1',[ids.ne]);
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,0);
 await db.query('update wf_employees set full_name=$1,updated_by=$2,version=2 where id=$3',['اسم محدث',ids.admin,ids.ne]);
 assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,1);
 }finally{await db.close()}
});

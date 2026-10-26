import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNotificationDB,ids} from './helpers/notification-db.mjs';
import {renderWorkforceEmail} from '../supabase/functions/_shared/workforce-email.ts';
const migration=name=>readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
function extract(sql,name){const start=sql.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.','\\.')}\\(`,'i'));assert.ok(start>=0,name);const marker=sql.slice(start).match(/\bas (\$\w*\$)/i)[1],b=sql.indexOf(marker,start),e=sql.indexOf(marker,b+marker.length);return sql.slice(start,e+marker.length+1);}
async function setup(){
 const db=await createNotificationDB();
 await db.exec(`
 alter role service_role bypassrls;
 alter table wf_notifications add column read_at timestamptz,add column inbox_visible boolean default true;
 alter table wf_notification_deliveries add column status text default 'pending',add column first_attempt_at timestamptz,add column last_error text;
 alter table wf_employees add column start_date date default '2026-10-01',add column contract_end date,add column flexible_workday_from date;
 alter table wf_employees disable trigger wf_employment_change_notifications;
 update wf_employees set flexible_workday_from='2026-10-26' where id='${ids.ne}';
 alter table wf_tasks add column deleted_at timestamptz,add column board_id uuid;
 create table wf_boards(id uuid primary key,archived_at timestamptz);
 insert into wf_boards values('40000000-0000-4000-8000-000000000001',null);
 alter table wf_employees enable trigger wf_employment_change_notifications;
 create table wf_attendance_sessions(id uuid primary key,employee_id uuid,business_date date,checked_in timestamptz,checked_out timestamptz,source text,close_reason text,version int default 1,updated_at timestamptz);
 create table wf_attendance_settings(employee_id uuid,workdays int[]);
 create table wf_profile_change_requests(id uuid primary key,status text);
 alter table wf_task_submissions add column summary text;
 create table wf_submission_attachments(submission_id uuid,attachment_id uuid);
 create table workforce_private.test_runs(ended_at timestamptz,expires_at timestamptz,participants uuid[]);
 create table wf_notification_preferences(id uuid default gen_random_uuid(),user_id uuid,settings jsonb,test_run_id uuid);
 create function workforce_private.notification_group(p_kind text) returns text language sql as $$select case when p_kind in ('attendance_confirmation','due_24h','due_2h','overdue','approval_reminder') then 'reminders' when p_kind in ('weekly_report') then 'weekly_reports' when p_kind in ('payroll','monthly_payroll') then 'finance' else 'tasks' end$$;
 create function public.wf_generate_notification_reminders(p_now timestamptz default now()) returns jsonb language plpgsql as $$declare added int:=0;begin return jsonb_build_object('created',added);end$$;
 create function public.wf_claim_notification_deliveries(p_limit integer default 8) returns jsonb language plpgsql as $$declare result jsonb;begin
 with picked as(select id from public.wf_notification_deliveries where status='pending' limit p_limit),
 claimed as(update public.wf_notification_deliveries d set status='processing',first_attempt_at=now() from picked where d.id=picked.id returning snapshot)
 select jsonb_agg(snapshot) into result from claimed;
 return result;end$$;
 `);
 await db.exec(extract(await migration('20261019063813_workforce_staff_daily_reminders'),'workforce_private.attendance_reminder_needed'));
 await db.exec(extract(await migration('20261024081153_automatic_checkout_notifications'),'workforce_private.notify_admin_attendance_event'));
 await db.exec('create trigger wf_attendance_owner_activity after insert or update of checked_out on wf_attendance_sessions for each row execute function workforce_private.notify_admin_attendance_event();');
 // Production already skips Google event emails (native Calendar owns the invitation).
 await db.exec(`do $$declare f oid:='workforce_private.queue_notification_email()'::regprocedure;b text;begin select prosrc into b from pg_proc where oid=f;execute replace(pg_get_functiondef(f),b,replace(b,'begin',E'begin\\n if new.kind=''meeting_event'' then return new;end if;'));end $$;`);
 await db.exec(await migration('20261026134949_quieter_workforce_notifications'));
 await db.exec("update workforce_private.notification_quiet_policy set activated_at='2026-10-01',digest_starts_on='2026-10-01';grant usage on schema public,workforce_private,auth to service_role;grant select,insert,update,delete on all tables in schema public to service_role;grant select on workforce_private.notification_email_routes,workforce_private.test_runs to service_role;set role service_role;");
 return db;
}
const notice=async(db,{kind,recipient=ids.admin,task=null,key=crypto.randomUUID(),body='تفاصيل الحدث',at='2026-10-26T16:00:00+03:00'}={})=>db.query("insert into wf_notifications(recipient_id,kind,title,body,task_id,href,event_key,created_at) values($1,$2,$2,$3,$4,$5,$6,$7) on conflict do nothing returning id",[recipient,kind,body,task,recipient===ids.admin?'/admin/workforce':'/employee',key,at]);
const mails=async(db,kind)=>Number((await db.query("select count(*) n from wf_notification_deliveries d where d.status='pending' and ($1::text is null or d.snapshot->>'kind'=$1)",[kind??null])).rows[0].n);
const task=async(db,owner=ids.me)=>{const id=crypto.randomUUID();await db.query("insert into wf_tasks(id,assignee_id,updated_by,board_id,due_at) values($1,$2,$3,'40000000-0000-4000-8000-000000000001','2026-10-28T12:00:00+03:00')",[id,owner,ids.noor]);return id;};

test('task edits and uploads share one card; actionable assignment and review stay immediate without self mail',async()=>{
 const db=await setup();try{
  const id=await task(db);const before=await mails(db);
  await notice(db,{kind:'attachment',task:id,key:'attachment:'+crypto.randomUUID(),body:'الملف الأول'});
  await notice(db,{kind:'attachment',task:id,key:'attachment:'+crypto.randomUUID(),body:'الملف الثاني'});
  assert.equal(await mails(db),before);
  const card=(await db.query("select * from wf_notifications where task_id=$1 and kind='task_update'",[id])).rows;
  assert.equal(card.length,1);assert.equal(card[0].body,'الملف الثاني');
  const repeated=crypto.randomUUID();await notice(db,{kind:'attachment',task:id,key:repeated,body:'آخر مرفق'});
  await db.query('update wf_notifications set read_at=now() where id=$1',[card[0].id]);
  await notice(db,{kind:'attachment',task:id,key:repeated});assert.ok((await db.query('select read_at from wf_notifications where id=$1',[card[0].id])).rows[0].read_at);
  await notice(db,{kind:'submitted',task:id,at:new Date().toISOString()});
  assert.equal(await mails(db,'submitted'),1);
  await notice(db,{kind:'assigned',task:id,recipient:ids.noor});assert.equal(await mails(db,'assigned'),1); // Monwa only: assignment generated by task insert.
  await notice(db,{kind:'changes',task:id,recipient:ids.monwa,body:'عدلي المخرجات مع المرفقات'});
  assert.equal(await mails(db,'changes'),1);
 }finally{await db.close()}
});
test('only first arrival mails manager; manual exits digest, automatic exits notify both immediately',async()=>{
 const db=await setup();try{
  let first=true;
  for(const [hour,reason] of [['09:00','manual'],['12:00','manual'],['14:00','connection_lost']]){
   const id=crypto.randomUUID();await db.query("insert into wf_attendance_sessions(id,employee_id,business_date,checked_in,source) values($1,$2,'2026-10-26',$3,'clock')",[id,ids.me,'2026-10-26T'+hour+':00+03:00']);
   assert.equal(await mails(db,'attendance_in'),1);first=false;
   await db.query("update wf_attendance_sessions set checked_out=checked_in+interval '1 hour',close_reason=$2 where id=$1",[id,reason]);
  }
  assert.equal(first,false);assert.equal(await mails(db,'attendance_out'),2);
  assert.equal((await db.query("select count(*)::int n from wf_notifications where kind='attendance_in' and inbox_visible")).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from wf_notifications where kind='attendance_out' and inbox_visible")).rows[0].n,2);
  assert.equal((await db.query("select count(*)::int n from workforce_private.notification_digest_events where kind in ('attendance_in','attendance_out') and included_at is null")).rows[0].n,4);
 }finally{await db.close()}
});

test('submission mail collects linked files after commit, consumes upload digest and preserves retry snapshot',async()=>{
 const db=await setup();try{
  const id=await task(db),submission=crypto.randomUUID(),file=crypto.randomUUID();
  await db.query("insert into wf_task_submissions(id,task_id,submitted_by,summary) values($1,$2,$3,'ملخص التسليم النهائي')",[submission,id,ids.monwa]);
  await db.query("insert into wf_task_attachments(id,task_id,filename,created_by,created_at) values($1,$2,'عرض الخدمات.pdf',$3,now())",[file,id,ids.monwa]);
  await db.query('insert into wf_submission_attachments values($1,$2)',[submission,file]);
  await db.query('select wf_claim_notification_deliveries(50)');
  const deliveries=(await db.query("select snapshot from wf_notification_deliveries where snapshot->>'kind'='submitted'")).rows;
  assert.ok(deliveries.length);for(const {snapshot} of deliveries){assert.match(snapshot.body,/ملخص التسليم النهائي/);assert.match(snapshot.body,/عرض الخدمات.pdf/);assert.match(renderWorkforceEmail(snapshot).text,/المرفقات/);}
  const before=JSON.stringify(deliveries);
  await db.query('update wf_task_submissions set summary=$2 where id=$1',[submission,'تغيير لاحق']);
  await db.query("update wf_notification_deliveries set status='pending' where snapshot->>'kind'='submitted'");
  await db.query('select wf_claim_notification_deliveries(50)');
  assert.equal(JSON.stringify((await db.query("select snapshot from wf_notification_deliveries where snapshot->>'kind'='submitted'")).rows),before);
 }finally{await db.close()}
});

test('assignment wins over owner duplicate; unreadable tasks and opted-out categories never leak into digests',async()=>{
 const db=await setup();try{
  const id=crypto.randomUUID();
  await db.query("insert into wf_tasks(id,assignee_admin_id,updated_by,board_id) values($1,$2,$3,'40000000-0000-4000-8000-000000000001')",[id,ids.admin,ids.noor]);
  assert.equal((await db.query('select count(*)::int n from wf_notifications where task_id=$1 and recipient_id=$2',[id,ids.admin])).rows[0].n,1);
  const hidden=await task(db,ids.ne);
  await notice(db,{kind:'attachment',recipient:ids.monwa,task:hidden});
  await db.query("insert into wf_notification_preferences(user_id,settings) values($1,'{\"tasks\":{\"email\":false,\"inbox\":true}}')",[ids.noor]);
  await notice(db,{kind:'attachment',recipient:ids.noor,task:hidden});
  await db.query("select wf_generate_daily_notification_digest('2026-10-27T09:15:00+03:00')");
  assert.equal((await db.query('select count(*)::int n from wf_notification_deliveries where recipient_id=$1 and snapshot->>\'kind\'=\'daily_digest\'',[ids.monwa])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from workforce_private.notification_digest_events where recipient_id=$1 and included_at is null',[ids.noor])).rows[0].n,0);
 }finally{await db.close()}
});
test('one short private digest per recipient/day, no historical replay, Friday skipped and resolved tasks removed',async()=>{
 const db=await setup();try{
  const id=await task(db);await db.query("update wf_notifications set created_at='2026-10-26T16:00:00+03:00' where task_id=$1",[id]);
  // Each staff recipient gets only their current visible tasks; no salaries in digest.
  await notice(db,{kind:'attachment',task:id,recipient:ids.monwa,body:'تحديث منوه'});
  await notice(db,{kind:'overdue',task:id,recipient:ids.monwa});
  await notice(db,{kind:'approval_reminder',body:'مراجعات معلقة'});
  assert.equal((await db.query("select wf_generate_daily_notification_digest('2026-10-27T09:14:00+03:00') n")).rows[0].n,0);
  assert.ok((await db.query("select wf_generate_daily_notification_digest('2026-10-27T09:15:00+03:00') n")).rows[0].n>0);
  assert.equal((await db.query("select wf_generate_daily_notification_digest('2026-10-27T11:15:00+03:00') n")).rows[0].n,0);
  const ds=(await db.query("select snapshot from wf_notification_deliveries where snapshot->>'kind'='daily_digest'")).rows;
  assert.ok(ds.length);for(const {snapshot} of ds){assert.ok(snapshot.body.length<900);const mail=renderWorkforceEmail(snapshot);assert.match(mail.html,/logo.png/);assert.doesNotMatch(mail.text,/راتب|تأمينات|صافي|ساعات الأسبوع/);}
  assert.equal((await db.query("select wf_generate_daily_notification_digest('2026-10-30T09:15:00+03:00') n")).rows[0].n,0);
  // A late event is carried into the next digest, not lost behind today's key.
  await notice(db,{kind:'attachment',task:id,recipient:ids.monwa,at:'2026-10-27T16:00:00+03:00'});
  assert.equal((await db.query("select wf_generate_daily_notification_digest('2026-10-27T16:01:00+03:00') n")).rows[0].n,0);
  assert.ok((await db.query("select wf_generate_daily_notification_digest('2026-10-28T09:15:00+03:00') n")).rows[0].n>0);
 }finally{await db.close()}
});
test('Noor has no 10am absence alert; Monwa retains it, two-hour deadline is inbox only, important reports/meeting reminders stay immediate',async()=>{
 const db=await setup();try{
  assert.equal((await db.query("select workforce_private.attendance_reminder_needed($1,'2026-10-27') n",[ids.ne])).rows[0].n,false);
  assert.equal((await db.query("select workforce_private.attendance_reminder_needed($1,'2026-10-27') n",[ids.me])).rows[0].n,true);
  await notice(db,{kind:'due_2h',recipient:ids.monwa});assert.equal(await mails(db,'due_2h'),0);
  await notice(db,{kind:'due_24h',recipient:ids.monwa});assert.equal(await mails(db,'due_24h'),1);
  for(const kind of ['attendance_confirmation','meeting_reminder','employee_request','knowledge_file','weekly_report','monthly_payroll']){await notice(db,{kind,recipient:ids.monwa});assert.equal(await mails(db,kind),1);}
  await notice(db,{kind:'meeting_event',recipient:ids.monwa});assert.equal(await mails(db,'meeting_event'),0);
  assert.equal((await db.query("select has_function_privilege('authenticated','public.wf_generate_daily_notification_digest(timestamptz)','execute') n")).rows[0].n,false);
  assert.equal((await db.query("select has_table_privilege('authenticated','workforce_private.notification_digest_events','select') n")).rows[0].n,false);
 }finally{await db.close()}
});

test('silent test tasks stay completely silent before coalescing and email/digest queues',async()=>{
 const db=await setup();try{
  const id=crypto.randomUUID();
  await db.query('insert into wf_tasks(id,assignee_id,updated_by,test_run_id) values($1,$2,$3,$4)',[id,ids.me,ids.noor,crypto.randomUUID()]);
  await notice(db,{kind:'attachment',task:id});await notice(db,{kind:'submitted',task:id});
  for(const table of ['public.wf_notifications','public.wf_notification_deliveries','workforce_private.notification_digest_events','workforce_private.notification_activity_keys'])
   assert.equal((await db.query('select count(*)::int n from '+table)).rows[0].n,0,table);
 }finally{await db.close()}
});

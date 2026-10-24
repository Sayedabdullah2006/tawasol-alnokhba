import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNotificationDB,ids} from './helpers/notification-db.mjs';
import {renderWorkforceEmail} from '../supabase/functions/_shared/workforce-email.ts';

const migration=new URL('../supabase/migrations/20261024081153_automatic_checkout_notifications.sql',import.meta.url);
async function setup(){
 const db=await createNotificationDB();
 await db.exec(`create table wf_attendance_sessions(id uuid primary key,employee_id uuid,checked_in timestamptz,checked_out timestamptz,source text,close_reason text,version int default 1,updated_at timestamptz);
 create function workforce_private.end_work_segment(uuid,timestamptz) returns void language sql as $$select null::void$$;
 create function workforce_private.work_now() returns timestamptz language sql as $$select '2026-10-24T15:30:00Z'::timestamptz$$;`);
 const linked=await readFile(new URL('../supabase/migrations/20261022213937_linked_work_sessions.sql',import.meta.url),'utf8');
 const start=linked.indexOf('create function workforce_private.close_work_session('),end=linked.indexOf('revoke all on function workforce_private.close_work_session',start);
 await db.exec(linked.slice(start,end));
 await db.exec(await readFile(migration,'utf8'));
 await db.exec(`create trigger wf_attendance_owner_activity after insert or update of checked_out on wf_attendance_sessions for each row execute function workforce_private.notify_admin_attendance_event();`);
 return db;
}
const open=async(db,employee=ids.ne,source='clock')=>{
 const id=crypto.randomUUID();await db.query("insert into wf_attendance_sessions(id,employee_id,checked_in,source) values($1,$2,'2026-10-24T09:00:00+03:00',$3)",[id,employee,source]);return id;
};
const close=(db,id,reason)=>db.query("select workforce_private.close_work_session($1,'2026-10-24T10:07:00+03:00',$2)",[id,reason]);
test('Noor and Monwa each receive one automatic checkout inbox notice and mail snapshot, with manager reason and Riyadh credited time',async()=>{
 const db=await setup();try{
 for(const [employee,user,name] of [[ids.ne,ids.noor,'نور'],[ids.me,ids.monwa,'منوه']])
 for(const [reason,label,next] of [['connection_lost','انقطاع الاتصال بجلسة العمل','عند العودة للعمل'],['confirmation_missed','عدم تأكيد استمرار العمل','عند العودة للعمل'],['day_end','بلوغ نهاية الدوام','بداية دوامك القادم']]){
  const id=await open(db,employee);await close(db,id,reason);
  await close(db,id,reason); // A repeated sweep/snapshot must not replay a transition.
  await db.query('update wf_attendance_sessions set checked_out=checked_out,version=version+1 where id=$1',[id]);
  const key=`clock:${id}:attendance_out`;
  const notices=(await db.query('select * from wf_notifications where event_key=$1 order by recipient_id',[key])).rows;
  assert.equal(notices.length,2);
  const own=notices.find(n=>n.recipient_id===user),manager=notices.find(n=>n.recipient_id===ids.admin);
  assert.ok(own);assert.match(own.title,/تلقائيًا/);assert.ok(own.body.includes(label));assert.ok(own.body.includes(next));
  assert.ok(own.body.includes('2026-10-24 10:07'));assert.equal(own.href,'/employee/attendance/overview');
  assert.ok(manager.body.startsWith(name+'\n'));assert.ok(manager.body.includes(label));assert.ok(manager.body.includes('2026-10-24 10:07'));
  const mail=(await db.query('select snapshot from wf_notification_deliveries where notification_id in ($1,$2)',[own.id,manager.id])).rows;
  assert.equal(mail.length,2);
  for(const {snapshot} of mail){const rendered=renderWorkforceEmail(snapshot);assert.ok(rendered.text.includes(label));assert.equal(rendered.text.split('2026-10-24 10:07').length-1,1);assert.match(rendered.text,/عرض الحضور/);assert.ok(rendered.html.includes('/logo.png'));}
  assert.equal(mail.find(m=>m.snapshot.email===user+'@example.com')?.snapshot.body,own.body);
  assert.equal(mail.find(m=>m.snapshot.email==='manager@example.com')?.snapshot.body,manager.body);
 }
 }finally{await db.close()}
});
test('manual checkout keeps manager notification only; corrections and closed historical sessions never produce automatic notices',async()=>{
 const db=await setup();try{
  const id=await open(db);await close(db,id,'manual');
  const notices=(await db.query('select recipient_id,body from wf_notifications where event_key=$1',[`clock:${id}:attendance_out`])).rows;
  assert.equal(notices.length,1);assert.equal(notices[0].recipient_id,ids.admin);assert.match(notices[0].body,/انصراف يدوي/);
  const correction=await open(db,ids.ne,'correction');await close(db,correction,'connection_lost');
  assert.equal((await db.query('select count(*)::int n from wf_notifications where event_key like $1',[`clock:${correction}:%`])).rows[0].n,0);
  const before=(await db.query('select count(*)::int n from wf_notifications')).rows[0].n;
  await db.exec(await readFile(migration,'utf8'));await close(db,id,'connection_lost');
  assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,before);
 }finally{await db.close()}
});

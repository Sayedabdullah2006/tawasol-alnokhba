import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createNotificationDB,ids} from './helpers/notification-db.mjs';
import {renderWorkforceEmail} from '../supabase/functions/_shared/workforce-email.ts';
const migration=new URL('../supabase/migrations/20261024091543_work_confirmation_email_reminders.sql',import.meta.url);
const at=t=>`2026-10-24T${t}+03:00`;
async function setup(){const db=await createNotificationDB();await db.exec(`
 create table wf_attendance_sessions(id uuid primary key,employee_id uuid,source text default 'clock',policy_version int default 1,business_date date default '2026-10-24',checked_in timestamptz default '2026-10-24T09:00:00+03:00',checked_out timestamptz,close_reason text,cutoff_at timestamptz default '2026-10-24T18:00:00+03:00',last_seen_at timestamptz default '2026-10-24T10:59:00+03:00',next_confirmation_at timestamptz default '2026-10-24T11:00:00+03:00',break_started_at timestamptz,break_paid_until timestamptz);
 alter table wf_notification_deliveries add column status text default 'pending',add column last_error text;
 create function workforce_private.work_now() returns timestamptz language sql as $$select current_setting('test.clock')::timestamptz$$;
 create function public.wf_generate_notification_reminders(p_now timestamptz default now()) returns jsonb language plpgsql as $$declare added integer:=0;begin return jsonb_build_object('created',added);end$$;
 create function public.wf_claim_notification_deliveries(p_limit integer default 8) returns jsonb language plpgsql as $$begin return jsonb_build_object('deliveries',(select coalesce(jsonb_agg(snapshot),'[]'::jsonb) from wf_notification_deliveries where status='pending'));end$$;
 create function workforce_private.notification_group(p_kind text) returns text language sql as $$select case when p_kind='knowledge_file' then 'knowledge' when p_kind='weekly_report' then 'weekly_reports' when p_kind in ('due_24h','due_2h') then 'reminders' else 'tasks' end$$;
 set test.clock='2026-10-24T11:00:00+03:00';
 `);
 const source=await readFile(new URL('../supabase/migrations/20261022213937_linked_work_sessions.sql',import.meta.url),'utf8');
 const start=source.indexOf('create function workforce_private.work_expiry('),end=source.indexOf('revoke all on function workforce_private.work_expiry',start);
 await db.exec(source.slice(start,end));await db.exec(await readFile(migration,'utf8'));return db;}
const generate=async(db,time)=>{await db.query("select set_config('test.clock',$1,false)",[at(time)]);return (await db.query('select public.wf_generate_notification_reminders($1) v',[at(time)])).rows[0].v.created;};
const claim=async db=>(await db.query('select public.wf_claim_notification_deliveries() v')).rows[0].v.deliveries;
async function session(db,employee=ids.ne){const id=crypto.randomUUID();await db.query('insert into wf_attendance_sessions(id,employee_id) values($1,$2)',[id,employee]);return id;}

test('both employees get one inbox and branded mail reminder per due slot, with five-minute deadline and no automatic confirmation',async()=>{
 const db=await setup();try{
  await session(db);await session(db,ids.me);assert.equal(await generate(db,'10:59:00'),0);
  assert.equal(await generate(db,'11:00:00'),2);assert.equal(await generate(db,'11:00:30'),0);
  const mail=await claim(db);assert.equal(mail.length,2);assert.ok(mail.some(m=>m.email===ids.noor+'@example.com'));assert.ok(mail.some(m=>m.email===ids.monwa+'@example.com'));
  for(const m of mail){const rendered=renderWorkforceEmail(m);assert.match(rendered.text,/أواصل العمل/);assert.match(rendered.text,/11:05/);assert.match(rendered.text,/انصراف تلقائي/);assert.ok(rendered.html.includes('/logo.png'));assert.equal(m.href,'/employee/attendance/overview');}
  assert.equal((await db.query("select count(*)::int n from wf_attendance_sessions where next_confirmation_at='2026-10-24T11:00:00+03:00'")).rows[0].n,2);
  for(const time of ['13:00:00','15:00:00']){
   await db.query('update wf_attendance_sessions set next_confirmation_at=$1,last_seen_at=$1',[at(time)]);
   assert.equal(await generate(db,time),2);assert.equal(await generate(db,time),0);
  }
  assert.equal((await db.query('select count(*)::int n from wf_notifications')).rows[0].n,6);
  assert.equal((await db.query("select workforce_private.notification_group('attendance_confirmation') g")).rows[0].g,'reminders');
 }finally{await db.close()}
});
test('queued reminders cancel after confirmation, break, checkout or deadline, without changing other messages',async()=>{
 const db=await setup();try{
  const n=await session(db),m=await session(db,ids.me);await generate(db,'11:00:00');
  await db.query('update wf_attendance_sessions set next_confirmation_at=$2 where id=$1',[n,at('13:00:00')]);
  assert.equal((await claim(db)).length,1);
  await db.query('update wf_attendance_sessions set break_started_at=$2,break_paid_until=$3 where id=$1',[m,at('11:01:00'),at('11:31:00')]);
  assert.equal((await claim(db)).length,0);
  await db.query('update wf_attendance_sessions set break_started_at=null,break_paid_until=null,next_confirmation_at=$2,last_seen_at=$2 where id=$1',[m,at('11:31:00')]);
  assert.equal(await generate(db,'11:31:00'),1);assert.equal((await claim(db)).length,1);
  await db.query('update wf_attendance_sessions set checked_out=$2 where id=$1',[m,at('11:32:00')]);assert.equal((await claim(db)).length,0);
  await db.query('update wf_attendance_sessions set last_seen_at=$2 where id=$1',[n,at('13:00:00')]);assert.equal(await generate(db,'13:00:00'),1);
  await db.query("select set_config('test.clock',$1,false)",[at('13:05:00')]);assert.equal((await claim(db)).length,0);
 }finally{await db.close()}
});
test('late starts, stale connections, breaks, closed sessions and final cutoff do not create invalid reminders; generator is service-only',async()=>{
 const db=await setup();try{
  const n=await session(db);await db.query('update wf_attendance_sessions set checked_in=$2,next_confirmation_at=$3,last_seen_at=$2 where id=$1',[n,at('12:30:00'),at('13:00:00')]);
  assert.equal(await generate(db,'12:45:00'),0);assert.equal(await generate(db,'13:00:00'),0); // No heartbeat: genuinely disconnected.
  await db.query('update wf_attendance_sessions set last_seen_at=$2 where id=$1',[n,at('13:00:00')]);assert.equal(await generate(db,'13:00:00'),1);
  await db.query('update wf_attendance_sessions set next_confirmation_at=cutoff_at,last_seen_at=cutoff_at where id=$1',[n]);assert.equal(await generate(db,'18:00:00'),0);
  await db.exec('set role authenticated');await assert.rejects(()=>db.query('select public.wf_generate_work_confirmation_reminders($1)',[at('13:00:00')]));
 }finally{await db.close()}
});

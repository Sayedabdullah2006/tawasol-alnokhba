import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createWorkDB,ids,command,clock,at,device} from './helpers/work-session-db.mjs';
import {attendanceExemptPath,OFF_DUTY_REQUESTS} from '../src/lib/workforce/action-access.ts';
import {workedSeconds} from '../src/lib/workforce/attendance-summary.ts';

const migration=new URL('../supabase/migrations/20261023205919_attendance_action_gate.sql',import.meta.url);
async function setup(){
 const db=await createWorkDB();
 await db.exec(`reset role;
 create table wf_employee_requests(id uuid primary key,employee_id uuid,kind text,status text,test_run_id uuid,starts_at timestamptz,ends_at timestamptz);
 grant select on wf_employee_requests to service_role;
 create function workforce_private.fixed_paid_holiday(date) returns text language sql as $$select null::text$$;
 create function public.wf_comments_command(p_actor uuid,p_body text) returns void language plpgsql as $$begin insert into wf_task_events(task_id,actor_id,action,summary) values('${ids.task}',p_actor,'comment',p_body);end$$;
 revoke all on function public.wf_comments_command(uuid,text) from public,anon,authenticated;grant execute on function public.wf_comments_command(uuid,text) to service_role;
 `);
 await db.exec(await readFile(new URL('../supabase/migrations/20261023022342_three_daily_work_confirmations.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(migration,'utf8'));
 await db.exec('set role service_role');return db;
}
const access=async(db,actor=ids.noor)=>(await db.query('select wf_work_action_access($1) value',[actor])).rows[0].value;
const comment=(db,actor=ids.noor)=>db.query('select wf_comments_command($1,$2)',[actor,'مخرج عمل']);

test('Noor and Monwa are read-only off duty, including delegated actions; admin remains unrestricted',async()=>{
 const db=await setup();try{
  for(const actor of [ids.noor,ids.monwa]){
   assert.equal((await access(db,actor)).state,'off');await assert.rejects(()=>comment(db,actor),/سجلي الحضور/);
   const start=await command(db,{command:'in'},actor);assert.equal((await access(db,actor)).allowed,true);await comment(db,actor);
   await command(db,{command:'break',session_id:start.session.id},actor);assert.equal((await access(db,actor)).state,'break');await assert.rejects(()=>comment(db,actor),/استأنفي/);
   await assert.rejects(()=>command(db,{command:'activity',session_id:start.session.id,title:'عمل إداري'},actor),/استأنفي/);
   await command(db,{command:'resume',session_id:start.session.id},actor);await comment(db,actor);
   await command(db,{command:'out',session_id:start.session.id},actor);await assert.rejects(()=>comment(db,actor));
  }
  await comment(db,ids.admin);assert.equal((await access(db,ids.admin)).allowed,true);
  assert.equal((await db.query('select count(*)::int n from wf_task_events')).rows[0].n,5);
 }finally{await db.close()}
});

test('disconnect, confirmation and cutoff are checked before every work action without waiting for cron',async()=>{
 const db=await setup();try{
  let d=await command(db,{command:'in'});await clock(db,'09:06');assert.equal((await access(db)).allowed,false);
  assert.equal((await db.query('select close_reason from wf_attendance_sessions where id=$1',[d.session.id])).rows[0].close_reason,'connection_lost');
  await clock(db,'10:59');d=await command(db,{command:'in'});await clock(db,'11:00');assert.equal((await access(db)).state,'confirmation');await assert.rejects(()=>comment(db));
  await command(db,{command:'confirm',session_id:d.session.id});await comment(db);
  await command(db,{command:'out',session_id:d.session.id});await clock(db,'16:59');d=await command(db,{command:'in'});
  await clock(db,'17:00');assert.equal((await access(db)).allowed,false);await assert.rejects(()=>comment(db));await assert.rejects(()=>command(db,{command:'in'}));
 }finally{await db.close()}
});

test('only an active approved overtime interval opens work; it never credits ordinary attendance or payroll twice',async()=>{
 const db=await setup();try{
  await db.exec(`reset role;insert into wf_employee_requests values('60000000-0000-4000-8000-000000000001','${ids.en}','overtime','pending',null,'${at('17:10')}','${at('18:00')}');set role service_role;`);
  await clock(db,'17:15');await assert.rejects(()=>command(db,{command:'in'}));
  await db.exec(`reset role;update wf_employee_requests set status='approved';set role service_role;`);
  const d=await command(db,{command:'in'});assert.ok(d.session.overtime_request_id);assert.equal(Date.parse(d.session.cutoff_at),Date.parse(at('18:00')));
  assert.equal((await access(db)).allowed,true);assert.equal((await access(db,ids.monwa)).allowed,false);await comment(db);
  await command(db,{command:'task',session_id:d.session.id,task_id:ids.shared});
  await clock(db,'17:16');await command(db,{command:'heartbeat',session_id:d.session.id});await clock(db,'17:17');await command(db,{command:'out',session_id:d.session.id});
  const periods=(await db.query('select * from wf_attendance_sessions')).rows;
  assert.equal(workedSeconds(periods,Date.parse(at('00:00')),Date.parse(at('23:59')),Date.parse(at('23:59'))),0);
  assert.equal((await db.query('select workforce_private.report_attendance_seconds($1,$2,$3)::int seconds',[ids.en,at('00:00'),at('23:59')])).rows[0].seconds,0);
  assert.equal((await db.query('select sum(extract(epoch from ends_at-starts_at))::int seconds from wf_task_time_entries')).rows[0].seconds,120);
  await clock(db,'18:00');await assert.rejects(()=>command(db,{command:'in'}));assert.equal((await access(db)).allowed,false);
  await db.exec(`set role authenticated`);await assert.rejects(()=>db.query('select wf_work_action_access($1)',[ids.noor]));
 }finally{await db.close()}
});

test('essential requests and account access remain available; all HTTP mutations await the common guard',async()=>{
 for(const path of ['work-session','attendance','account/password','notifications','requests'])assert.equal(attendanceExemptPath('/api/workforce/'+path),true);
 for(const path of ['tasks','tasks/suggest','comments','knowledge','attachments/abc','business-card','journeys'])assert.equal(attendanceExemptPath('/api/workforce/'+path),false);
 for(const kind of ['leave','permission','overtime','missing-hours','attendance-correction','general'])assert.equal(OFF_DUTY_REQUESTS.has(kind),true);
 assert.equal(OFF_DUTY_REQUESTS.has('expenses'),false);assert.equal(OFF_DUTY_REQUESTS.has('advance'),false);
 async function check(dir){for(const file of await readdir(dir,{withFileTypes:true})){const path=new URL(file.name+(file.isDirectory()?'/':''),dir);if(file.isDirectory())await check(path);else if(file.name.endsWith('.ts')){const source=await readFile(path,'utf8');assert.doesNotMatch(source,/(?<!await )assertMutation\(request\);/,path.pathname);}}}
 await check(new URL('../src/app/api/workforce/',import.meta.url));
 const source=await readFile(new URL('../src/lib/workforce/server.ts',import.meta.url),'utf8');assert.match(source,/wf_work_device/);assert.match(source,/createHash\("sha256"\)/);
});

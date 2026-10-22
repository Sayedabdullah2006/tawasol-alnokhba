import test from 'node:test';import assert from 'node:assert/strict';
import {createWorkDB,ids,command,snapshot,clock,at,device} from './helpers/work-session-db.mjs';
import {summarizeAttendance} from '../src/lib/workforce/attendance-summary.ts';
import {attendanceExportPeriods} from '../src/lib/workforce/attendance-export.ts';
const minutes=async(db,employee=ids.en)=>{const periods=(await db.query('select * from wf_attendance_sessions where employee_id=$1',[employee])).rows;return summarizeAttendance({periods,startDate:'2026-10-18',month:'2026-10',now:new Date(at('18:00'))}).todayMinutes;};
test('attendance/task lifecycle, daily paid break budget, final cutoff and no duplicate time',async()=>{
 const db=await createWorkDB();try{
 let d=await command(db,{command:'in'}),session=d.session.id;
 const act=(commandName,extra={})=>command(db,{command:commandName,session_id:session,...extra});
 await assert.rejects(()=>command(db,{command:'in'}));
 await assert.rejects(()=>act('task',{task_id:ids.other}));
 await assert.rejects(()=>act('task',{task_id:ids.task,device:'b'.repeat(64)}));
 const key=crypto.randomUUID();d=await act('task',{task_id:ids.task,request_key:key});
 assert.equal(d.active.task_id,ids.task);await act('task',{task_id:ids.task,request_key:key});
 await clock(db,'09:01');await act('heartbeat');await clock(db,'09:02');await act('break');
 await clock(db,'09:32');await act('heartbeat');await clock(db,'09:36');await act('heartbeat');await clock(db,'09:37');d=await act('resume');
 assert.equal(d.breakUsedSeconds,1800);assert.equal(d.session.unpaid_periods.length,1);
 assert.equal((await db.query('select count(*)::int n from wf_task_time_entries')).rows[0].n,1);
 assert.equal((await db.query('select extract(epoch from ends_at-starts_at)::int n from wf_task_time_entries')).rows[0].n,120);
 // Break entitlement is shared across every check-in during the Riyadh day.
 await act('out');await clock(db,'10:00');d=await command(db,{command:'in'});session=d.session.id;
 d=await act('break');assert.equal(d.session.break_paid_until,d.session.break_started_at);
 await clock(db,'10:01');await act('heartbeat');await clock(db,'10:02');await act('resume');await act('out');
 assert.equal(await minutes(db),32); // 37 attendance minutes - 5 excess; second session entirely unpaid.
 await clock(db,'16:58');d=await command(db,{command:'in'});session=d.session.id;await act('task',{task_id:ids.shared});
 await clock(db,'16:59');await act('heartbeat');await clock(db,'17:02');d=await act('heartbeat');
 assert.equal(d.session,null);assert.equal(d.lastSession.close_reason,'day_end');assert.equal(Date.parse(d.lastSession.checked_out),Date.parse(at('17:00')));
 await assert.rejects(()=>command(db,{command:'in'}));assert.equal(await minutes(db),34);
 }finally{await db.close()}
});
test('dashboard, Excel and weekly report agree; corrections reconcile task periods and respect cutoff',async()=>{
 const db=await createWorkDB();try{
 let d=await command(db,{command:'in'});const session=d.session.id;
 const act=(name,extra={})=>command(db,{command:name,session_id:session,...extra});
 await act('task',{task_id:ids.task});
 for(let minute=541;minute<=1020;minute++){
  const time=`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
  await clock(db,time);d=await act('heartbeat');
  if(d.session&&!d.session.break_started_at&&Date.parse(d.now)>=Date.parse(d.session.next_confirmation_at))d=await act('confirm');
  if(minute===720) d=await act('break');
  if(minute===765) {d=await act('resume');d=await act('task',{task_id:ids.task});}
  if(d.session&&!d.session.break_started_at&&Date.parse(d.now)>=Date.parse(d.session.next_confirmation_at))d=await act('confirm');
 }
 assert.equal(d.session,null);assert.equal(d.todaySeconds,465*60);
 const periods=(await db.query('select * from wf_attendance_sessions')).rows;
 const summary=summarizeAttendance({periods,startDate:'2026-10-18',month:'2026-10',now:new Date(at('18:00'))});
 assert.equal(summary.todayMinutes,465);
 assert.equal(attendanceExportPeriods(periods,summary).reduce((sum,row)=>sum+row.seconds,0),465*60);
 const report=await db.query('select workforce_private.report_attendance_seconds($1,$2,$3)::int seconds',[ids.en,at('00:00'),at('23:59')]);
 assert.equal(report.rows[0].seconds,465*60);
 await assert.rejects(()=>db.query('update wf_task_time_entries set ends_at=ends_at-interval \'1 minute\''));
 await assert.rejects(()=>db.query("update wf_attendance_sessions set checked_out=$1,source='correction' where id=$2",[at('18:00'),session]));
 await db.query("update wf_attendance_sessions set checked_in=$1,checked_out=$2,source='correction',note='تصحيح معتمد',updated_by=$3 where id=$4",[at('09:30'),at('12:30'),ids.admin,session]);
 assert.equal((await snapshot(db)).todaySeconds,180*60);
 const taskSeconds=(await db.query('select coalesce(sum(extract(epoch from ends_at-starts_at)) filter(where archived_at is null),0)::int seconds from wf_task_time_entries')).rows[0].seconds;
 assert.equal(taskSeconds,150*60); // 09:30–12:00; the remaining half-hour is paid break.
 const revisions=(await db.query('select * from wf_task_time_revisions where version=2')).rows;
 assert.equal(revisions.length,2);assert.equal(revisions.some(r=>r.action==='archive'),true);
 }finally{await db.close()}
});
test('hourly confirmation, disconnection, stale requests and scheduler closure',async()=>{
 const db=await createWorkDB();try{
 let d=await command(db,{command:'in'}),session=d.session.id;
 const act=(name,extra={})=>command(db,{command:name,session_id:session,...extra});
 await act('task',{task_id:ids.task});
 for(let minute=1;minute<=60;minute++){await clock(db,`${String(9+Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`);await act('heartbeat');}
 await assert.rejects(()=>act('activity',{title:'اجتماع عميل'}));
 await clock(db,'10:04');d=await act('confirm');assert.equal(Date.parse(d.session.next_confirmation_at),Date.parse(at('11:04')));
 await clock(db,'10:05');await act('heartbeat');await clock(db,'10:11');
 await db.query('select wf_expire_work_sessions()');d=await snapshot(db);assert.equal(d.session,null);assert.equal(d.lastSession.close_reason,'connection_lost');assert.equal(Date.parse(d.lastSession.checked_out),Date.parse(at('10:05')));
 const old=session;d=await command(db,{command:'in'});session=d.session.id;
 await assert.rejects(()=>command(db,{command:'out',session_id:old}));
 assert.equal((await snapshot(db)).session.id,session);
 // A connected browser still closes if the hourly confirmation is missed.
 for(let m=12;m<=75;m++){const h=10+Math.floor(m/60);await clock(db,`${h}:${String(m%60).padStart(2,'0')}`);d=await act('heartbeat');}
 await clock(db,'11:16');d=await act('confirm');assert.equal(d.session,null);assert.equal(d.lastSession.close_reason,'confirmation_missed');assert.equal(Date.parse(d.lastSession.checked_out),Date.parse(at('11:11')));
 }finally{await db.close()}
});
test('shared task, review/reassignment closes affected timers; private records and forbidden RPCs',async()=>{
 const db=await createWorkDB();try{
 const noor=await command(db,{command:'in'}),monwa=await command(db,{command:'in'},ids.monwa);
 await command(db,{command:'task',session_id:noor.session.id,task_id:ids.shared});
 await command(db,{command:'task',session_id:monwa.session.id,task_id:ids.shared},ids.monwa);
 await clock(db,'09:02');await db.query('update wf_tasks set column_id=$1 where id=$2',[ids.review,ids.shared]);
 assert.equal((await snapshot(db)).active,null);assert.equal((await snapshot(db,ids.monwa)).active,null);
 assert.equal((await db.query('select count(*)::int n from wf_task_time_entries')).rows[0].n,2);
 await assert.rejects(()=>db.query('select wf_clock_attendance_legacy($1,$2,$3)',[ids.noor,'in',crypto.randomUUID()]));
 await assert.rejects(()=>command(db,{command:'task',session_id:noor.session.id,task_id:ids.shared}));
 await db.query('update wf_tasks set column_id=$1 where id=$2',[ids.progress,ids.shared]);
 await command(db,{command:'task',session_id:noor.session.id,task_id:ids.shared});
 await command(db,{command:'task',session_id:monwa.session.id,task_id:ids.shared},ids.monwa);
 await clock(db,'09:03');await db.query("update wf_tasks set assignee_id=$1,co_assignee_ids='{}' where id=$2",[ids.em,ids.shared]);
 assert.equal((await snapshot(db)).active,null);assert.equal((await snapshot(db,ids.monwa)).active.task_id,ids.shared);
 await clock(db,'09:04');await db.query('update wf_boards set archived_at=$1 where id=$2',[at('09:04'),ids.board]);
 assert.equal((await snapshot(db,ids.monwa)).active,null);
 await assert.rejects(()=>snapshot(db,ids.monwa,ids.en));
 assert.equal((await snapshot(db,ids.admin,ids.en)).session.id,noor.session.id);
 await assert.rejects(()=>command(db,{command:'in'},ids.admin));
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${ids.monwa}',false);`);
 assert.equal((await db.query('select * from wf_work_segments')).rows.every(r=>r.employee_id===ids.em),true);
 assert.equal((await db.query('select wf_time_summary($1) value',[ids.shared])).rows[0].value.seconds,240);
 await assert.rejects(()=>command(db,{command:'out',session_id:noor.session.id}));
 await assert.rejects(()=>db.query("insert into wf_work_segments(session_id,employee_id,kind,starts_at) values($1,$2,'unallocated',now())",[noor.session.id,ids.en]));
 }finally{await db.close()}
});

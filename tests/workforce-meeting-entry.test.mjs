import test from 'node:test';import assert from 'node:assert/strict';
import {meetingEntryPath,meetingEntryURL,meetingPortalPath} from '../src/lib/workforce/meeting-entry.ts';
import {portalLoginDestination} from '../src/lib/portal-login.ts';
import {createMeetingsDB,meetingPresence,meetingCommand,meetingData,scheduled} from './helpers/meetings-db.mjs';
import {ids,command,device} from './helpers/work-session-db.mjs';
import {renderWorkforceEmail} from '../supabase/functions/_shared/workforce-email.ts';
const id='10000000-0000-4000-8000-000000000001';
test('meeting invitees resolve with production auth permissions; anonymous and staff roles cannot call the private resolver',async()=>{
 const db=await createMeetingsDB();try{
  await assert.rejects(()=>db.query('select email from auth.users'));
  const meeting=await scheduled(db,meetingData({participant_ids:[ids.noor]}));
  const resolved=(await db.query('select workforce_private.meeting_invitee_emails($1,$2) v',[ids.admin,meeting])).rows[0].v;
  assert.deepEqual(resolved,[ids.noor+'@example.com']);
  await assert.rejects(()=>db.query('select workforce_private.meeting_invitee_emails($1,$2)',[ids.monwa,meeting]));
  for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(()=>db.query('select workforce_private.meeting_invitee_emails($1,$2)',[ids.admin,meeting]));}
 }finally{await db.close();}
});
test('reminder email opens the meeting in the site and states the device requirement, without rendering a direct Meet action',()=>{
 for(const role of ['admin','employee']){const result=renderWorkforceEmail({email:'fixture@example.com',name:'مشاركة',kind:'meeting_reminder',title:'تذكير باجتماع قادم',body:'مراجعة الخطة',href:meetingPortalPath(id,role),createdAt:'2026-10-25T08:45:00+03:00'});
  assert.ok(result.text.includes('نفس جهاز ومتصفح تسجيل الحضور'));assert.ok(result.text.includes('الانضمام من المتصفح'));
  assert.ok(result.text.includes('https://nukhba.media'+meetingPortalPath(id,role)));assert.ok(!result.html.includes('https://meet.google.com/'));
 }
});
test('director invitations use delivery email without changing login or staff addresses',async()=>{
 const db=await createMeetingsDB();try{
  await db.exec('reset role');await db.query('insert into workforce_private.notification_email_routes values($1,$2)',[ids.admin,'elitecnnct@gmail.com']);await db.exec('set role service_role');
  const meeting=await scheduled(db);const p=await meetingCommand(db,meeting,1,'prepare');
  assert.ok(p.emails.includes('elitecnnct@gmail.com'));assert.ok(!p.emails.includes(ids.admin+'@example.com'));
  assert.ok(p.emails.includes(ids.noor+'@example.com'));assert.ok(p.emails.includes(ids.monwa+'@example.com'));
  await assert.rejects(()=>db.query('select email from auth.users where id=$1',[ids.admin]));
  // Finish or fail the lease locally only; nothing is sent to a real provider.
  await meetingCommand(db,meeting,1,'fail',{lease:p.lease});
 }finally{await db.close();}
});
test('email entry survives login for manager and employees and retains role boundaries',()=>{
 for(const role of ['admin','employee'])assert.equal(portalLoginDestination(role,meetingEntryPath(id)),meetingEntryPath(id));
 assert.equal(meetingEntryURL(id),`https://nukhba.media/meetings/${id}`);
 assert.equal(meetingPortalPath(id,'admin'),`/admin/workforce/meetings?meeting=${id}`);
 assert.equal(meetingPortalPath(id,'employee'),`/employee/meetings?meeting=${id}`);
 assert.equal(portalLoginDestination('employee',`/employee/meetings?meeting=${id}`),`/employee/meetings?meeting=${id}`);
 for(const target of ['https://evil.test','//evil.test','/\\evil.test','/admin/people'])assert.equal(portalLoginDestination('employee',target),'/employee');
 assert.equal(portalLoginDestination('admin','/employee/meetings'),'/admin');
});
test('Noor and Monwa cannot activate or renew meeting protection from another browser; same-device join works',async()=>{
 const db=await createMeetingsDB();try{
  await command(db,{command:'in'});await command(db,{command:'in'},ids.monwa);const meeting=await scheduled(db);
  const state=async()=>(await db.query('select id,device_hash,meeting_id,meeting_until,last_seen_at,next_confirmation_at from wf_attendance_sessions order by id')).rows;
  const before=await state();
  for(const actor of [ids.noor,ids.monwa])for(const hash of ['',null,'b'.repeat(64)])await assert.rejects(()=>meetingPresence(db,meeting,'join',actor,hash));
  assert.deepEqual(await state(),before);
  assert.equal((await db.query('select count(*)::int n from wf_meeting_attendance')).rows[0].n,0);
  for(const actor of [ids.noor,ids.monwa])await meetingPresence(db,meeting,'join',actor,device);
  assert.equal((await db.query('select count(*)::int n from wf_meeting_attendance')).rows[0].n,2);
  const protectedState=await state();await assert.rejects(()=>meetingPresence(db,meeting,'join',ids.monwa,'b'.repeat(64)));assert.deepEqual(await state(),protectedState);
 }finally{await db.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeNotificationOptions } from '../src/lib/workforce/knowledge-notifications.ts';
import { renderWorkforceEmail, workforceMailCC } from '../supabase/functions/_shared/workforce-email.ts';
const person='f4036d24-b1d7-4359-86bb-6818a31117ac';
test('knowledge uploads are silent by default and deduplicate explicitly selected recipients',()=>{
  const form=new FormData();
  assert.deepEqual(knowledgeNotificationOptions(form),{recipients:[],message:''});
  form.set('notify_user_ids',JSON.stringify([person,person]));form.set('notification_message','  يرجى الاطلاع على الملف  ');
  assert.deepEqual(knowledgeNotificationOptions(form),{recipients:[person],message:'يرجى الاطلاع على الملف'});
});
test('invalid recipients and messages fail before upload',()=>{
  for(const input of ['bad','{}','[null]','["not-an-id"]']) {
    const form=new FormData();form.set('notify_user_ids',input);assert.throws(()=>knowledgeNotificationOptions(form));
  }
  const form=new FormData();form.set('notification_message','رسالة دون مستلمة');assert.throws(()=>knowledgeNotificationOptions(form));
  form.set('notify_user_ids',JSON.stringify([person]));form.set('notification_message','x'.repeat(5001));assert.throws(()=>knowledgeNotificationOptions(form));
});
test('knowledge mail includes an authenticated file link and escaped custom message without copying other recipients',()=>{
 const mail={email:'staff@example.com',name:'موظفة',kind:'knowledge_file',title:'ملف جديد في مركز المعرفة',body:'الملف: دليل الشركة\nرسالة لك:\n<script>alert(1)</script>\nيرجى المراجعة',href:`/employee/knowledge?all=true&file=${person}`,createdAt:'2026-10-21T00:00:00Z'};
 const result=renderWorkforceEmail(mail);
 assert.match(result.html,/فتح الملف في مركز المعرفة/);assert.match(result.text,/يرجى المراجعة/);
 assert.match(result.html,/&lt;script&gt;/);assert.doesNotMatch(result.html,/<script>/);
 assert.match(result.html,/https:\/\/nukhba.media\/employee\/knowledge\?all=true&amp;file=/);
 assert.equal(workforceMailCC(mail),undefined);
});

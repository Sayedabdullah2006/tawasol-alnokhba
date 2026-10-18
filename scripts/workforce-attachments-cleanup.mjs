import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {parse} from 'dotenv';
import {createClient} from '@supabase/supabase-js';
const env=parse(await readFile('.env.local')),qa=JSON.parse(await readFile('.workforce-test/accounts.json','utf8'));
const run=JSON.parse(await readFile('.workforce-test/attachments-results.json','utf8'));
assert(/^QA Attachments \d+$/.test(run.label));assert.equal(run.ids.length,2);
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
for(const id of run.ids){
 const {data:task,error}=await db.from('wf_tasks').select('id,created_by,client_name,version,archived_at').eq('id',id).single();assert.ifError(error);
 assert.equal(task.created_by,qa.accounts.admin.id);assert.equal(task.client_name,run.label);
 if(!task.archived_at){const action=await db.rpc('wf_task_command',{p_actor:qa.accounts.admin.id,p_id:id,p_version:task.version,p_command:'archive',p_payload:{archived:true},p_key:crypto.randomUUID()});assert.ifError(action.error);}
}
assert.ifError((await db.from('wf_notifications').update({read_at:new Date().toISOString()}).in('task_id',run.ids)).error);
run.cleaned_at=new Date().toISOString();await writeFile('.workforce-test/attachments-results.json',JSON.stringify(run,null,2));
console.log('Archived both QA attachment tasks and marked their notifications read; files and delivery history preserved.');

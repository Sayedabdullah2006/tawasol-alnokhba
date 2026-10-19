// Private, unindexed storage objects only. Exact test paths removed in finally.
// No task/knowledge records, notifications, emails or real user data are created.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {parse} from 'dotenv';
import {createClient} from '@supabase/supabase-js';
const env=parse(await readFile('.env.local'));
assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname,'rbyglvwbojitxyazmgap.supabase.co');
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const bucketId=process.env.WORKFORCE_UPLOAD_TEST_BUCKET||'workforce-knowledge-files';
assert(['workforce-knowledge-files','workforce-task-files'].includes(bucketId));
const bucket=db.storage.from(bucketId),paths=[];
const prefix=`private-upload-validation/${randomUUID()}`;
try{
 for(const [size,mime,suffix] of [[5*1024*1024,'video/mp4','mp4'],[50*1024*1024,'application/x-7z-compressed','7z']]){
  const bytes=Buffer.alloc(size,65),path=`${prefix}/${size}.${suffix}`;paths.push(path);
  const upload=await bucket.upload(path,bytes,{contentType:mime,upsert:false});assert.ifError(upload.error);
  const download=await bucket.download(path);assert.ifError(download.error);
  assert.equal(download.data.size,size);
  assert.equal(createHash('sha256').update(Buffer.from(await download.data.arrayBuffer())).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
  console.log(`PASS ${bucketId} private storage upload/download hash: ${size/1024/1024} MiB ${mime}`);
 }
}finally{
 if(paths.length){const removed=await bucket.remove(paths);assert.ifError(removed.error);}
 const listed=await bucket.list(prefix);assert.ifError(listed.error);assert.equal(listed.data.length,0);
 console.log('PASS exact private validation objects removed; no notifications or employee data touched');
}

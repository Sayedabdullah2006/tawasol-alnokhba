// Local validation only: no database, storage, notifications or provider calls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),cache=new Map();
function load(name){
 if(cache.has(name))return cache.get(name).exports;
 const source=readFileSync(new URL(`../src/lib/workforce/${name}.ts`,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const loadedModule={exports:{}};cache.set(name,loadedModule);
 const localRequire=id=>id==='server-only'?{}:id.startsWith('./')?load(id.slice(2)):require(id);
 new Function('require','module','exports',code)(localRequire,loadedModule,loadedModule.exports);
 return loadedModule.exports;
}
const {validateKnowledgeUpload}=load('knowledge-upload-server');
const {attachmentForm,validateAttachment}=load('attachment-server');
const {MAX_KNOWLEDGE_BYTES,KNOWLEDGE_INLINE_MIMES}=load('knowledge');
const {MAX_TASK_ATTACHMENT_BYTES,TASK_ATTACHMENT_INLINE_MIMES}=load('attachments');
const {validateWorkforceUpload}=load('file-upload-server');
assert.equal(MAX_KNOWLEDGE_BYTES,50*1024*1024);
assert.equal(MAX_TASK_ATTACHMENT_BYTES,MAX_KNOWLEDGE_BYTES);
const largeText=new File([new Uint8Array(5*1024*1024).fill(65)],'دليل الشركة.txt',{type:'text/plain'});
assert.equal((await validateKnowledgeUpload(largeText)).bytes.length,largeText.size);
await assert.rejects(validateAttachment(largeText),e=>e.status===413);
for(const name of ['video.mp4','archive.rar','archive.7z','archive.zip','design.psd','legacy.doc','sheet.xlsx','presentation.pptx','font.woff2','page.html','image.svg','settings.json','file.unknown','بدون امتداد']){
 const content=Buffer.from([0,1,2,3,255]);
 const checked=await validateKnowledgeUpload(new File([content],name,{type:'image/png'}));
 assert.equal(checked.filename,name);assert.equal(checked.mime,'application/octet-stream');
 assert.deepEqual(checked.bytes,content);
 assert.equal(checked.sha256,createHash('sha256').update(content).digest('hex'));
 assert(!KNOWLEDGE_INLINE_MIMES.includes(checked.mime));
 const taskFile=await validateWorkforceUpload(new File([content],name,{type:'image/png'}),MAX_TASK_ATTACHMENT_BYTES);
 assert.deepEqual(taskFile.bytes,content);assert(!TASK_ATTACHMENT_INLINE_MIMES.includes(taskFile.mime));
}
const limitFile=new File([new Uint8Array(MAX_KNOWLEDGE_BYTES)],'archive.7z');
assert.equal((await validateKnowledgeUpload(limitFile)).bytes.length,MAX_KNOWLEDGE_BYTES);
assert.equal((await validateWorkforceUpload(limitFile,MAX_TASK_ATTACHMENT_BYTES)).bytes.length,MAX_TASK_ATTACHMENT_BYTES);
await assert.rejects(validateKnowledgeUpload({size:MAX_KNOWLEDGE_BYTES+1}),e=>e.status===413&&e.message.includes('50'));
await assert.rejects(validateKnowledgeUpload(new File([],'empty.mp4')),e=>e.message.includes('فارغ'));
assert.equal((await validateKnowledgeUpload(new File(['not a PDF'],'fake.pdf'))).mime,'application/octet-stream');
assert.equal((await validateKnowledgeUpload(new File([new Uint8Array([0xff,0xfe,65,0])],'legacy.txt'))).mime,'application/octet-stream');
const safe=await validateKnowledgeUpload(new File(['ok'],'../name\u202e.exe'));
assert(!/[\\/\u202e]/.test(safe.filename));
const form=new FormData();form.set('file',largeText);form.set('folder_id',crypto.randomUUID());
const parsed=await attachmentForm(new Request('http://localhost/upload',{method:'POST',body:form}),MAX_KNOWLEDGE_BYTES);
assert.equal(parsed.get('file').size,largeText.size);
await assert.rejects(attachmentForm(new Request('http://localhost/upload',{method:'POST',body:'x',headers:{'content-length':String(MAX_KNOWLEDGE_BYTES+128*1024+1)}}),MAX_KNOWLEDGE_BYTES),e=>e.status===413&&e.message.includes('50'));
let cancelled=false;
const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(MAX_KNOWLEDGE_BYTES+128*1024+1));},cancel(){cancelled=true;}});
await assert.rejects(attachmentForm(new Request('http://localhost/upload',{method:'POST',body:stream,duplex:'half'}),MAX_KNOWLEDGE_BYTES),e=>e.status===413);
assert(cancelled);
console.log('PASS: task/knowledge 5/50 MiB, every format and legacy encoding, safe preview/download-only MIME, byte/hash preservation, empty/oversize rejection, filenames and multipart limits; no network calls');

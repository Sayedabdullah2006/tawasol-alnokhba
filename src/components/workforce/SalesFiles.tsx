'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Notice} from './shared';
import {SALES_FILE_LIMIT,salesFilePurposes,type SalesFile} from '@/lib/workforce/sales-files';
import styles from './sales.module.css';
export default function SalesFiles({opportunityId,disabled=false,onFiles,apiRoot='/api/workforce/sales'}:{opportunityId:string;apiRoot?:string;disabled?:boolean;onFiles?:(files:SalesFile[])=>void}){
 const [files,setFiles]=useState<SalesFile[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[purpose,setPurpose]=useState('general'),[pending,setPending]=useState<{file:File;key:string}|null>(null);
 const input=useRef<HTMLInputElement>(null),lock=useRef(false),endpoint=`${apiRoot}/opportunities/${opportunityId}/files`;
 const load=useCallback(async(signal?:AbortSignal)=>{const r=await fetch(endpoint,{cache:'no-store',signal}),d=await r.json();if(!r.ok)throw Error(d.error);setFiles(d.files);onFiles?.(d.files);},[endpoint,onFiles]);
 useEffect(()=>{const controller=new AbortController();fetch(endpoint,{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);return d;}).then(d=>{setFiles(d.files);onFiles?.(d.files);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[endpoint,onFiles]);
 async function upload(){if(lock.current||!pending)return;lock.current=true;setBusy(true);setError('');try{
  if(pending.file.size>SALES_FILE_LIMIT)throw Error('الحد الأقصى للملف 20 ميجابايت');
  const form=new FormData();form.set('file',pending.file);form.set('request_key',pending.key);form.set('purpose',purpose);
  const r=await fetch(endpoint,{method:'POST',body:form}),d=await r.json();if(!r.ok)throw Error(d.error);
  setPending(null);if(input.current)input.current.value='';await load();
 }catch(e){setError(e instanceof Error?e.message:'تعذر رفع الملف');}finally{lock.current=false;setBusy(false);}}
 async function archive(file:SalesFile){if(lock.current||!window.confirm(`إزالة «${file.filename}» من مرفقات الفرصة؟`))return;lock.current=true;setBusy(true);setError('');try{
  const r=await fetch(`${endpoint}/${file.id}`,{method:'DELETE'}),d=await r.json();if(!r.ok)throw Error(d.error);await load();
 }catch(e){setError(e instanceof Error?e.message:'تعذر إزالة الملف');}finally{lock.current=false;setBusy(false);}}
 return <section className={styles.filePanel} aria-label="مرفقات الفرصة" aria-busy={busy}><h3>المرفقات</h3><Notice message={error} error/>
  <div className={styles.fileUpload}><label className={styles.field}><span>ملف من الجهاز · حتى 20 MB</span><input ref={input} type="file" disabled={busy||disabled} onChange={e=>{const file=e.target.files?.[0];setPending(file?{file,key:crypto.randomUUID()}:null);}}/></label><label className={styles.field}><span>نوع المرفق</span><select value={purpose} disabled={busy||disabled} onChange={e=>{setPurpose(e.target.value);if(pending)setPending({...pending,key:crypto.randomUUID()});}}>{Object.entries(salesFilePurposes).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><button type="button" className={styles.button} disabled={!pending||busy||disabled} onClick={()=>void upload()}>{busy?'جارٍ الحفظ…':'رفع الملف'}</button></div>
  {files.map(file=><div className={styles.fileRow} key={file.id}><div><a href={`${endpoint}/${file.id}`} download={file.filename}>{file.filename}</a><small>{salesFilePurposes[file.purpose]} · {file.size_bytes<1024*1024?Math.max(1,Math.ceil(file.size_bytes/1024))+' KB':(file.size_bytes/1024/1024).toFixed(1)+' MB'} · {new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh'}).format(new Date(file.created_at))}</small></div>{file.canArchive&&<button type="button" className={styles.button} disabled={busy||disabled} onClick={()=>void archive(file)}>إزالة</button>}</div>)}{!files.length&&<p className={styles.note}>لا توجد مرفقات</p>}
 </section>;
}

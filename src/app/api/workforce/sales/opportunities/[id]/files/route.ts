import {apiError,assertMutation,createServiceRoleClient,workforceActor} from '@/lib/workforce/server';
import {attachmentForm} from '@/lib/workforce/attachment-server';
import {validateWorkforceUpload} from '@/lib/workforce/file-upload-server';
import {salesFileCommand} from '@/lib/workforce/sales-file-server';
import {SALES_FILE_BUCKET,SALES_FILE_LIMIT,salesFilePurposes} from '@/lib/workforce/sales-files';
import {privateResponse} from '@/lib/workforce/task-server';
import {uuid,WorkforceError} from '@/lib/workforce/validation';
type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,context:Context){try{
 const actor=await workforceActor(),id=uuid((await context.params).id);
 return privateResponse(await salesFileCommand(actor,id,'list'));
}catch(e){return apiError(e);}}
export async function POST(request:Request,context:Context){
 let path:string|undefined,id:string|undefined;
 try{
  await assertMutation(request);const actor=await workforceActor(),opportunity=uuid((await context.params).id);
  await salesFileCommand(actor,opportunity,'access');
  const form=await attachmentForm(request,SALES_FILE_LIMIT),file=form.get('file');id=uuid(form.get('request_key'));
  if(!(file instanceof File))throw new WorkforceError('اختر ملفًا');
  const purpose=String(form.get('purpose')??'general');if(!Object.hasOwn(salesFilePurposes,purpose))throw new WorkforceError('نوع المرفق غير صحيح');
  const checked=await validateWorkforceUpload(file,SALES_FILE_LIMIT),service=await createServiceRoleClient();
  path=`${opportunity}/${crypto.randomUUID()}`;
  const uploaded=await service.storage.from(SALES_FILE_BUCKET).upload(path,checked.bytes,{contentType:checked.mime,upsert:false});if(uploaded.error)throw uploaded.error;
  const result=await salesFileCommand(actor,opportunity,'add',id,{filename:checked.filename,mime_type:checked.mime,size_bytes:file.size,sha256:checked.sha256,object_path:path,purpose});
  const linked=await service.from('wf_crm_files').select('object_path').eq('id',id).maybeSingle();
  if(!linked.error&&linked.data?.object_path!==path)await service.storage.from(SALES_FILE_BUCKET).remove([path]);
  path=undefined;return privateResponse(result,201);
 }catch(e){
  if(path&&id){const service=await createServiceRoleClient(),linked=await service.from('wf_crm_files').select('object_path').eq('id',id).maybeSingle();if(!linked.error&&linked.data?.object_path!==path)await service.storage.from(SALES_FILE_BUCKET).remove([path]);}
  return apiError(e);
 }
}

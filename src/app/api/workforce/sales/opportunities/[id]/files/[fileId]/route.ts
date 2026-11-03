import {apiError,assertMutation,createServiceRoleClient,workforceActor} from '@/lib/workforce/server';
import {salesFileCommand} from '@/lib/workforce/sales-file-server';
import {SALES_FILE_BUCKET} from '@/lib/workforce/sales-files';
import {privateResponse} from '@/lib/workforce/task-server';
import {uuid} from '@/lib/workforce/validation';
type Context={params:Promise<{id:string;fileId:string}>};
export async function GET(_request:Request,context:Context){try{
 const actor=await workforceActor(),params=await context.params;
 const file=await salesFileCommand(actor,uuid(params.id),'download',uuid(params.fileId));
 const service=await createServiceRoleClient(),{data,error}=await service.storage.from(SALES_FILE_BUCKET).download(file.object_path);
 if(error||!data)throw error??Error('Storage unavailable');
 return new Response(data,{headers:{'Content-Type':file.mime_type,'Content-Length':String(data.size),'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; sandbox"}});
}catch(e){return apiError(e);}}
export async function DELETE(request:Request,context:Context){try{
 await assertMutation(request);const actor=await workforceActor(),params=await context.params;
 return privateResponse(await salesFileCommand(actor,uuid(params.id),'archive',uuid(params.fileId)));
}catch(e){return apiError(e);}}

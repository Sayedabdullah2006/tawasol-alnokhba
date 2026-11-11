import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { preparePublicationDay,syncEditorialSources } from './publication-plans'
import { createServiceRoleClient } from './supabase-server'

export function publicationCronAuthorized(req:Request):boolean {
  const provided=req.headers.get('x-api-key')||req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||''
  return [process.env.CRON_API_KEY,process.env.SUPABASE_SERVICE_ROLE_KEY].filter((key):key is string=>!!key).some(key=>{
    const a=Buffer.from(key),b=Buffer.from(provided);return a.length===b.length&&timingSafeEqual(a,b)
  })
}
export async function runPublicationCron(req:Request,task:string){
  if(!publicationCronAuthorized(req))return NextResponse.json({error:'غير مصرح'},{status:401})
  try{
    if(task==='sync')return NextResponse.json({success:true,...await syncEditorialSources()})
    if(task==='rollover'){const db=await createServiceRoleClient();const {data,error}=await db.rpc('editorial_close_expired_plans');if(error)throw error;return NextResponse.json({success:true,archived:data})}
    // Retired morning triggers cannot generate free-form posts outside the plan's preparation window.
    const hhmm=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())
    if(hhmm<'08:00'||hhmm>'23:00')return NextResponse.json({success:true,skipped:true,reason:'outside_plan_preparation_window'})
    return NextResponse.json(await preparePublicationDay())
  }catch(error){return NextResponse.json({success:false,error:error instanceof Error?error.message:'تعذرت معالجة الخطة'},{status:500})}
}

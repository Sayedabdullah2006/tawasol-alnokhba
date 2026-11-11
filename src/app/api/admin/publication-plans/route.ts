import { NextRequest,NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin-auth'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { getPublicationDashboard,getContentSources,getPublicationArchive,savePublicationPlan,activatePublicationPlan,pausePublicationPlan,preparePublicationDay,changePublicationItem,generatePlanItem,copyArchiveToPlan,syncEditorialSources,refreshPublicationItemNotice } from '@/lib/publication-plans'
import {previewPlanSchedule,confirmPlanSchedule,reconcilePlanSchedule} from '@/lib/publication-plan-scheduling'
export const dynamic='force-dynamic'
export const maxDuration=300

export async function GET(req:NextRequest) {
  if(!await getAdminUser())return NextResponse.json({error:'غير مصرح'},{status:401})
  try {
    const p=req.nextUrl.searchParams,tab=p.get('tab')
    if(tab==='archive')return NextResponse.json(await getPublicationArchive(p))
    if(tab==='sources')return NextResponse.json({sources:await getContentSources(p.get('q')||'')})
    if(tab==='attachment'){
      const db=await createServiceRoleClient();const {data,error}=await db.from('editorial_plans').select('attachment_path').eq('id',p.get('planId')||'').single()
      if(error||!data?.attachment_path)throw new Error('لا يوجد ملف مرفق لهذه الخطة')
      const signed=await db.storage.from('editorial-plan-files').createSignedUrl(data.attachment_path,60)
      if(signed.error)throw new Error(signed.error.message)
      return NextResponse.redirect(signed.data.signedUrl)
    }
    return NextResponse.json(await getPublicationDashboard(p.get('planId')||undefined))
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'تعذر تحميل خطة النشر'},{status:400})}
}
export async function POST(req:NextRequest) {
  const admin=await getAdminUser();if(!admin)return NextResponse.json({error:'غير مصرح'},{status:401})
  try {
    const body=await req.json(),action=String(body.action||'')
    if(action==='schedule-preview')return NextResponse.json(await previewPlanSchedule(body.id,Number(body.version),admin.id,body.day))
    if(action==='schedule-confirm')return NextResponse.json(await confirmPlanSchedule(body.previewId,String(body.when),Array.isArray(body.accountIds)?body.accountIds.map(Number):[],admin.id,body.reviewed===true))
    if(action==='schedule-status')return NextResponse.json(await reconcilePlanSchedule(body.id))
    if(action==='save')return NextResponse.json({plan:await savePublicationPlan(body.plan,admin.id,body.id,body.revision,body.attachment)})
    if(action==='activate')return NextResponse.json(await activatePublicationPlan(body.id,Number(body.revision),body.reviewed===true))
    if(action==='pause')return NextResponse.json(await pausePublicationPlan(body.id))
    if(action==='sync')return NextResponse.json(await syncEditorialSources())
    if(action==='prepare')return NextResponse.json(await preparePublicationDay(body.date, true))
    if(action==='retry'){
      await changePublicationItem(body.id,'reset-all',body,admin.id)
      const result=await generatePlanItem(body.id,'all');await refreshPublicationItemNotice(body.id)
      return NextResponse.json(result)
    }
    if(action==='regenerate'){
      const mode=body.mode==='tweet'?'tweet':'design'
      await changePublicationItem(body.id,`reset-${mode}`,body,admin.id)
      const result=await generatePlanItem(body.id,mode);await refreshPublicationItemNotice(body.id)
      return NextResponse.json(result)
    }
    if(action==='item')return NextResponse.json(await changePublicationItem(body.id,String(body.itemAction),body,admin.id))
    if(action==='copy')return NextResponse.json(await copyArchiveToPlan(body.entryId,body.date,Number(body.slot)))
    const db=await createServiceRoleClient()
    if(action==='source-status'){
      const status=body.status==='excluded'?'excluded':'new'
      const {error}=await db.from('editorial_sources').update({status,exclusion_reason:status==='excluded'?String(body.reason||'استبعاد تحريري'):null}).eq('id',body.id)
      if(error)throw new Error(error.message);return NextResponse.json({success:true})
    }
    if(action==='winner'){
      if(!['story','thread','carousel','number-card'].includes(body.format))throw new Error('اختر صيغة مدعومة')
      const {error}=await db.from('editorial_plans').update({winning_format:body.format,updated_at:new Date().toISOString()}).eq('id',body.id).eq('status','active')
      if(error)throw new Error(error.message);return NextResponse.json({success:true})
    }
    if(action==='notice-read'){
      const {error}=await db.from('editorial_notices').update({read_at:new Date().toISOString()}).eq('id',body.id);if(error)throw new Error(error.message);return NextResponse.json({success:true})
    }
    throw new Error('إجراء غير مدعوم')
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'تعذر تنفيذ الإجراء'},{status:400})}
}

import https from 'node:https'
import {createHash} from 'node:crypto'
import {createServiceRoleClient} from './supabase-server'
import {getValidAccessToken,uploadMediaFromUrl} from './postpulse'
import {proposePlanTime,validateScheduleTime,xThreadPayload,remoteDeliveryState} from './publication-plan-editorial-policy'
import {isStudioReviewBundle} from './studio-review-bundle'

type Row=Record<string,unknown>
const obj=(v:unknown):Row=>v&&typeof v==='object'?v as Row:{}
const active=(v:unknown)=>['scheduled','awaiting_media','in_progress','checking','submitting','uncertain'].includes(String(v).toLowerCase())
class PostPulseError extends Error{constructor(message:string,readonly status=0){super(message)}}
async function ppRequest(token:string,path:string,body?:unknown):Promise<Row|Row[]>{
 return new Promise((resolve,reject)=>{
  const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body))
  const req=https.request({hostname:'api.post-pulse.com',path,method:bytes?'POST':'GET',agent:new https.Agent({keepAlive:false}),headers:{Authorization:`Bearer ${token}`,Accept:'application/json',...(bytes?{'Content-Type':'application/json','Content-Length':String(bytes.length)}:{})},timeout:30000},res=>{
   const chunks:Buffer[]=[];let total=0
   res.on('data',(c:Buffer)=>{total+=c.length;if(total>8*1024*1024){req.destroy(new Error('استجابة PostPulse أكبر من الحد'));return}chunks.push(c)})
   res.on('end',()=>{const text=Buffer.concat(chunks).toString('utf-8');let data:Row|Row[];try{data=JSON.parse(text)}catch{reject(new PostPulseError('تعذر قراءة استجابة PostPulse',res.statusCode));return}
    if(!res.statusCode||res.statusCode<200||res.statusCode>=300){reject(new PostPulseError(`PostPulse أعاد الحالة ${res.statusCode}`,res.statusCode));return}resolve(data)})
   res.on('error',reject)
  });req.on('timeout',()=>req.destroy(new Error('انتهت مهلة PostPulse؛ لا تُكرر الإرسال قبل الاستعلام عن النتيجة')));req.on('error',reject);if(bytes)req.write(bytes);req.end()
 })
}
function rows(value:Row|Row[]):Row[]{return Array.isArray(value)?value:Array.isArray(value.items)?value.items as Row[]:Array.isArray(value.content)?value.content as Row[]:[]}
function verifiedAccounts(value:Row|Row[]){
 return rows(value).filter(a=>String(a.accountUsername||'').replace(/^@/,'').toLowerCase()==='first1saudi'&&['X_TWITTER','TWITTER'].includes(String(a.platform).toUpperCase())).map(a=>({id:Number(a.id),name:String(a.accountDisplayName||a.accountUsername),username:String(a.accountUsername),platform:'X_TWITTER'})).filter(a=>Number.isSafeInteger(a.id)&&a.id>0)
}
async function liveContext(day:string){
 const token=await getValidAccessToken()
 const accounts=verifiedAccounts(await ppRequest(token,'/v1/accounts'))
 if(!accounts.length)throw new Error('لا يوجد حساب X متصل ومثبت باسم First1Saudi في PostPulse')
 const start=new Date(`${day}T00:00:00+03:00`),end=new Date(start.getTime()+86400000)
 const posts=rows(await ppRequest(token,`/v1/posts?fromDate=${encodeURIComponent(start.toISOString())}&toDate=${encodeURIComponent(end.toISOString())}`))
 return {token,accounts,posts}
}
export async function previewPlanSchedule(id:string,version:number,actor:string,chosenDay?:string){
 const db=await createServiceRoleClient(),{data:item,error}=await db.from('editorial_items').select('*').eq('id',id).single();if(error)throw error
 if(item.version!==version||!['draft','approved'].includes(item.status)||!['none','failed'].includes(item.schedule_state))throw new Error('تغيرت المادة أو لها عملية قائمة؛ حدّث البطاقة')
 if(item.error||!item.copy?.main||!item.copy?.firstReply||!item.design_urls.length||isStudioReviewBundle(item.copy.main))throw new Error('أكمل مراجعة النص والرد الأول والتصميم قبل فتح الجدولة')
 if(item.post_type==='thread'||item.post_type==='quote')throw new Error('هذه النافذة تدعم المنشور الرئيسي وردّه الأول؛ السلسلة أو الاقتباس يحتاجان مراجعة أجزائهما وربطهما أولًا')
 const {data:plan}=await db.from('editorial_plans').select('status,start_date,end_date').eq('id',item.plan_id).single()
 const day=chosenDay||item.day
 if(plan?.status!=='active'||day<plan.start_date||day>plan.end_date)throw new Error('اختر يومًا داخل الخطة النشطة')
 const {accounts,posts}=await liveContext(day)
 const {data:other}=await db.from('editorial_scheduling').select('suggested_for').neq('item_id',item.id).in('state',['checking','submitting','scheduled','uncertain'])
 const occupied=[...posts.filter(p=>active(p.overallStatus||p.status)).map(p=>String(p.scheduledTime)),...(other??[]).map(p=>p.suggested_for)]
 const suggested=proposePlanTime(day,`${day}T${new Date(item.scheduled_at).toISOString().slice(11,16)}:00Z`,occupied)
 const snapshot={main:item.copy.main,firstReply:item.copy.firstReply,designUrls:item.design_urls,name:item.analysis?.name||item.brief.topic,postType:item.post_type}
 xThreadPayload({main:snapshot.main,firstReply:snapshot.firstReply,attachments:snapshot.designUrls,accountIds:accounts.map(a=>a.id),when:suggested})
 const contentHash=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
 const {data:preview,error:saveError}=await db.from('editorial_scheduling').insert({item_id:item.id,item_version:version,actor,snapshot,content_hash:contentHash,suggested_for:suggested,account_ids:accounts.map(a=>a.id)}).select('id,expires_at').single();if(saveError)throw saveError
 return {id:preview.id,expiresAt:preview.expires_at,suggestedTime:suggested,day,accounts,snapshot,delivery:'X: المنشور مع التصميم، ثم الرد الأول بالرابط كسلسلة مترابطة؛ لا يُرسل شيء قبل اعتماد وجدولة'}
}
async function saveOutcome(preview:Row,state:'scheduled'|'uncertain'|'failed',result:unknown,error?:string){
 const db=await createServiceRoleClient(),id=String(preview.id),itemId=String(preview.item_id),externalId=obj(result).id||preview.external_id||null
 const updated=await db.from('editorial_scheduling').update({state,external_id:externalId?String(externalId):null,result,error:error||null,updated_at:new Date().toISOString()}).eq('id',id);if(updated.error)throw updated.error
 const {data:item}=await db.from('editorial_items').select('publication_receipts').eq('id',itemId).single()
 const receipts=state==='scheduled'?[...(item?.publication_receipts||[]),{provider:'PostPulse',scheduleId:String(externalId),scheduledFor:preview.suggested_for,accounts:preview.account_ids,status:'scheduled',replyMode:'linked_x_thread',designUrls:obj(preview.snapshot).designUrls}]:item?.publication_receipts||[]
 const patch=await db.from('editorial_items').update({schedule_state:state,publication_receipts:receipts,notice:state==='scheduled'?'مجدول في PostPulse مع التصميم والرد الأول المترابط':state==='uncertain'?'نتيجة الإرسال غير محسومة؛ استعلم عنها قبل أي محاولة جديدة':'تعذرت الجدولة قبل تأكيد الإرسال؛ يمكن فتح معاينة جديدة',updated_at:new Date().toISOString()}).eq('id',itemId);if(patch.error)throw patch.error
 if(state==='scheduled')await db.from('postpulse_posts').insert({schedule_id:String(externalId),content:obj(preview.snapshot).main,design_url:(obj(preview.snapshot).designUrls as string[])?.[0],accounts:preview.account_ids,status:'scheduled',scheduled_for:preview.suggested_for,event_raw:result})
}
function verifyThread(detail:Row,snapshot:Row,accountIds:number[]){
 const pubs=Array.isArray(detail.publications)?detail.publications as Row[]:[]
 return accountIds.every(id=>{
  const pub=pubs.find(p=>Number(p.socialMediaAccountId)===id),posts=Array.isArray(pub?.posts)?pub.posts as Row[]:[]
  return posts.length===2&&posts[0].content===snapshot.main&&posts[1].content===snapshot.firstReply&&((Array.isArray(posts[0].media)&&posts[0].media.length>0)||(Array.isArray(posts[0].attachmentPaths)&&posts[0].attachmentPaths.length>0))
 })
}
export async function confirmPlanSchedule(previewId:string,when:string,accountIds:number[],actor:string,reviewed:boolean){
 if(!reviewed)throw new Error('راجع النص والتصميم والرد الأول والقناة والموعد ثم اعتمد الجدولة')
 const selectedTime=validateScheduleTime(when),day=new Date(Date.parse(selectedTime)+3*3600000).toISOString().slice(0,10)
 const db=await createServiceRoleClient(),{data:preview,error}=await db.from('editorial_scheduling').select('*').eq('id',previewId).eq('actor',actor).single();if(error)throw error
 if(preview.state!=='preview')return {existing:true,state:preview.state,scheduleId:preview.external_id}
 const context=await liveContext(day)
 if(!accountIds.length||accountIds.some(id=>!context.accounts.some(a=>a.id===id)))throw new Error('اختر حساب First1Saudi المثبت على X فقط')
 if(context.posts.some(p=>active(p.overallStatus||p.status)&&Math.abs(Date.parse(String(p.scheduledTime))-Date.parse(selectedTime))<3600000))throw new Error('ظهر تعارض جديد في PostPulse؛ افتح معاينة بموعد بديل')
 const {data:claim,error:claimError}=await db.rpc('editorial_claim_schedule',{p_preview:previewId,p_actor:actor,p_when:selectedTime,p_accounts:accountIds});if(claimError)throw claimError
 if(claim?.existing)return claim
 const actual={...preview,suggested_for:selectedTime,account_ids:accountIds},snapshot=obj(preview.snapshot)
 let submissionStarted=false
 try{
  const links=String(snapshot.firstReply).match(/https:\/\/(?:www\.)?first1saudi\.net\/[^\s]+/g)||[]
  if(!links.length)throw new Error('الرد الأول لا يتضمن رابط الحكاية')
  for(const link of links){const response=await fetch(link,{signal:AbortSignal.timeout(25000)});if(response.status!==200)throw new Error('تعذر التحقق من الوصول العام للحكاية؛ لم تُرسل الجدولة')}
  const paths:string[]=[]
  for(const url of snapshot.designUrls as string[]){const parsed=new URL(url);if(parsed.origin!==new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin||!parsed.pathname.startsWith('/storage/v1/object/public/content-images/'))throw new Error('التصميم ليس من مكتبة الصور المعتمدة');const media=await uploadMediaFromUrl(url);if(!media.path)throw new Error('لم يؤكد PostPulse استلام التصميم');paths.push(media.path)}
  const body=xThreadPayload({main:String(snapshot.main),firstReply:String(snapshot.firstReply),attachments:paths,accountIds,when:selectedTime})
  await db.from('editorial_scheduling').update({state:'submitting',updated_at:new Date().toISOString()}).eq('id',previewId)
  submissionStarted=true
  const created=obj(await ppRequest(context.token,'/v1/posts',body));if(!created.id)throw new Error('لم يُرجع PostPulse معرّفًا؛ يلزم الاستعلام عن النتيجة')
  await db.from('editorial_scheduling').update({external_id:String(created.id),result:created}).eq('id',previewId)
  const detail=obj(await ppRequest(context.token,`/v1/posts/${encodeURIComponent(String(created.id))}`))
  if(!verifyThread(detail,snapshot,accountIds))throw new Error('لم يتأكد إرفاق التصميم وربط الرد الأول بعد؛ تحقق من العملية القائمة قبل إعادة المحاولة')
  await saveOutcome(actual,'scheduled',detail)
  return {scheduled:true,scheduleId:String(created.id),when:selectedTime,accountIds,designAttached:true,firstReplyLinked:true}
 }catch(error){
  const knownRejected=error instanceof PostPulseError&&error.status>=400&&error.status<500
  const uncertain=submissionStarted&&!knownRejected
  const {data:latest}=await db.from('editorial_scheduling').select('external_id,result').eq('id',previewId).single()
  await saveOutcome({...actual,external_id:latest?.external_id},uncertain?'uncertain':'failed',latest?.result||null,error instanceof Error?error.message:'تعذرت الجدولة')
  throw error
 }
}
export async function reconcilePlanSchedule(itemId:string){
 const db=await createServiceRoleClient(),{data:operation}=await db.from('editorial_scheduling').select('*').eq('item_id',itemId).in('state',['uncertain','scheduled','checking','submitting']).order('created_at',{ascending:false}).limit(1).maybeSingle()
 if(!operation)return {state:'none'}
 const token=await getValidAccessToken();let external=operation.external_id
 if(!external){
  const around=Date.parse(operation.suggested_for),posts=rows(await ppRequest(token,`/v1/posts?fromDate=${encodeURIComponent(new Date(around-60000).toISOString())}&toDate=${encodeURIComponent(new Date(around+60000).toISOString())}`))
  for(const p of posts){const detail=obj(await ppRequest(token,`/v1/posts/${encodeURIComponent(String(p.id))}`));if(verifyThread(detail,obj(operation.snapshot),operation.account_ids)){external=String(p.id);break}}
 }
 if(!external)return {state:'uncertain',message:'لم يُحسم وجود العملية لدى PostPulse؛ لم تُرسل محاولة ثانية'}
 const detail=obj(await ppRequest(token,`/v1/posts/${encodeURIComponent(external)}`))
 let state=remoteDeliveryState(detail.overallStatus)
 if(state==='completed'&&!verifyThread(detail,obj(operation.snapshot),operation.account_ids))state='uncertain'
 if(state==='completed'||state==='failed'||state==='uncertain'){
  const publications=Array.isArray(detail.publications)?detail.publications as Row[]:[]
  const verifiedAt=new Date().toISOString()
  const {data:item}=await db.from('editorial_items').select('publication_receipts').eq('id',itemId).single()
  const receipts=(item?.publication_receipts||[]).map((r:Row)=>String(r.scheduleId)===String(external)?{...r,status:state,verifiedAt,publications:publications.map(p=>({accountId:p.socialMediaAccountId,status:p.status,posts:(Array.isArray(p.posts)?p.posts as Row[]:[]).map(post=>({id:post.platformPostIdentifier,url:post.permalink,error:post.errorMessage}))}))}:r)
  const update=await db.from('editorial_scheduling').update({state,result:detail,external_id:external,updated_at:verifiedAt}).eq('id',operation.id);if(update.error)throw update.error
  const updated=await db.from('editorial_items').update({schedule_state:state,...(state==='completed'?{status:'published',published_at:verifiedAt}:{}),publication_receipts:receipts,notice:state==='completed'?'تأكد اكتمال النشر في PostPulse؛ روابط كل قناة محفوظة في السجل':state==='uncertain'?'نتيجة النشر تحتاج مراجعة الأجزاء والتصميم والرد الأول؛ لا تُعد الإرسال تلقائيًا':'أكد PostPulse فشل النشر؛ راجع السبب قبل محاولة جديدة',updated_at:verifiedAt}).eq('id',itemId);if(updated.error)throw updated.error
  return {state,scheduleId:external,remoteStatus:detail.overallStatus,publications}
 }
 if(!verifyThread(detail,obj(operation.snapshot),operation.account_ids))return {state:'uncertain',scheduleId:external,message:'تحقق من الصورة والرد الأول للعملية القائمة'}
 if(operation.state!=='scheduled')await saveOutcome({...operation,external_id:external},'scheduled',detail)
 return {state:'scheduled',scheduleId:external,remoteStatus:detail.overallStatus,designAttached:true,firstReplyLinked:true}
}

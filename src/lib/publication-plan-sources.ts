import https from 'node:https'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServiceRoleClient } from './supabase-server'
import { htmlToPlainText, extractContentImages } from './first1-news'

const SITE = 'https://www.first1saudi.net'
type Row = Record<string, unknown>
export type EditorialSource = { id:string; wp_post_id:number|null; url:string; title:string; content:string; excerpt:string; published_at:string|null; categories:unknown[]; image_url:string|null; status:string; imported_via:string; raw:Row; created_at:string }

/** The site's TLS endpoint closes undici connections; native HTTPS keeps the public API reliable. */
function siteTextOnce(url:string,redirects=0):Promise<string> {
  const parsed=new URL(url)
  if(parsed.protocol!=='https:'||!['www.first1saudi.net','first1saudi.net'].includes(parsed.hostname)||redirects>3)throw new Error('عنوان مصدر غير مسموح')
  return new Promise((resolve,reject)=>{
    const req=https.get(parsed,{agent:new https.Agent({keepAlive:false}),headers:{Accept:'application/json, application/rss+xml;q=0.8','User-Agent':'Mozilla/5.0 (compatible; First1SaudiBot/2.0; +https://nukhba.media)'},timeout:30000},res=>{
      if(res.statusCode&&res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();siteTextOnce(new URL(res.headers.location,parsed).href,redirects+1).then(resolve,reject);return}
      if(res.statusCode!==200&&res.statusCode!==400){res.resume();reject(new Error(`المصدر أعاد الحالة ${res.statusCode}`));return}
      const chunks:Buffer[]=[];let size=0
      res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>16*1024*1024){req.destroy(new Error('استجابة المصدر أكبر من الحد'));return}chunks.push(chunk)})
      res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf-8')));res.on('error',reject)
    });req.on('timeout',()=>req.destroy(new Error('انتهت مهلة مزامنة أول سعودي')));req.on('error',reject)
  })
}
async function siteText(url:string,redirects=0):Promise<string>{
  if(redirects>3)throw new Error('تجاوز مصدر المحتوى عدد التحويلات المسموح')
  let last:unknown
  let curlError=''
  for(let attempt=0;attempt<2;attempt++){
    try{return await siteTextOnce(url)}catch(error){last=error;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)))}
  }
  // Some network edges reset Node TLS while accepting the same public request through curl.
  // URL is already constrained to the two First1Saudi hosts; no shell or credentials are involved.
  try{
    const parsed=new URL(url)
    if(parsed.protocol!=='https:'||!['www.first1saudi.net','first1saudi.net'].includes(parsed.hostname))throw new Error('عنوان غير مسموح')
    const {stdout}=await promisify(execFile)(process.platform==='win32'?'curl.exe':'curl',['--silent','--show-error','--max-time','30','--proto','=https','--write-out','\n%{http_code}\n%{redirect_url}',url],{timeout:35000,maxBuffer:16*1024*1024,windowsHide:true})
    const cut=stdout.lastIndexOf('\n'),redirect=stdout.slice(cut+1).trim(),statusCut=stdout.lastIndexOf('\n',cut-1),status=stdout.slice(statusCut+1,cut).trim()
    if(status==='200'||status==='400')return stdout.slice(0,statusCut)
    if(['301','302','307','308'].includes(status)&&redirect){const next=new URL(redirect);if(next.protocol==='https:'&&['www.first1saudi.net','first1saudi.net'].includes(next.hostname))return await siteText(next.href,redirects+1)}
    curlError=`HTTP ${status}`
  }catch(error){curlError=error instanceof Error?error.message:'curl unavailable'}
  throw new Error(`تعذر مصدر أول سعودي (${new URL(url).pathname}): ${last instanceof Error?last.message:String(last)}; ${curlError}`)
}
function obj(value:unknown):Row{return value&&typeof value==='object'?value as Row:{}}
function rendered(value:unknown):string{return htmlToPlainText(String(obj(value).rendered??''))}
export function canonicalStoryUrl(url:string):string {
  const u=new URL(url)
  if(!['www.first1saudi.net','first1saudi.net'].includes(u.hostname)||!['https:','http:'].includes(u.protocol))throw new Error('رابط الخبر يجب أن يكون من أول سعودي')
  u.protocol='https:';u.hostname='www.first1saudi.net';u.hash=''
  for(const k of [...u.searchParams.keys()])if(k!=='p')u.searchParams.delete(k)
  return u.href
}
export function normalizeWordPressSource(raw:unknown):Row|null {
  const p=obj(raw);if(!Number.isSafeInteger(p.id)||Number(p.id)<1||!p.link)return null
  const embed=obj(p._embedded);const photo=obj(Array.isArray(embed['wp:featuredmedia'])?embed['wp:featuredmedia'][0]:null)
  const body=String(obj(p.content).rendered??'');const title=rendered(p.title),content=htmlToPlainText(body)
  if(!title||!content)return null
  const images=extractContentImages(body)
  return {wp_post_id:p.id,url:canonicalStoryUrl(String(p.link)),title,content,excerpt:rendered(p.excerpt),published_at:p.date_gmt?`${String(p.date_gmt).replace(/Z$/,'')}Z`:p.date?`${p.date}+03:00`:null,categories:Array.isArray(embed['wp:term'])?embed['wp:term']:p.categories??[],image_url:typeof photo.source_url==='string'?photo.source_url:images[0]??null,image_caption:rendered(photo.caption),image_alt:String(photo.alt_text??''),raw:p,imported_via:'wordpress',updated_at:new Date().toISOString()}
}
/** RSS is a discovery fallback; keep complete feed content, never fabricate missing fields. */
export function normalizeRssSources(xml:string):Row[] {
  const get=(s:string,tag:string)=>s.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i'))?.[1]?.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/,'$1')||''
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].flatMap(match=>{
    const s=match[1],link=htmlToPlainText(get(s,'link')),html=get(s,'content:encoded')||get(s,'description')
    try {const url=canonicalStoryUrl(link);const content=htmlToPlainText(html);if(!content)return[];return [{wp_post_id: +(url.match(/\/(\d+)\.html/)?.[1]||0)||null,url,title:htmlToPlainText(get(s,'title')),content,excerpt:htmlToPlainText(get(s,'description')),published_at:Number.isFinite(Date.parse(get(s,'pubDate')))?new Date(get(s,'pubDate')).toISOString():null,categories:[],image_url:extractContentImages(html)[0]??null,raw:{rss:true},imported_via:'rss',updated_at:new Date().toISOString()}]}catch{return[]}
  })
}

export async function syncEditorialSources(refresh=false) {
  const db=await createServiceRoleClient()
  const {data:last}=await db.from('editorial_sync_runs').select('started_at').eq('status','completed').order('started_at',{ascending:false}).limit(1).maybeSingle()
  const {data:runId,error:startError}=await db.rpc('editorial_start_sync')
  if(startError)throw new Error(startError.message)
  if(!runId)return {id:null,newCount:0,imported:0,source:'wordpress',warning:'توجد مزامنة قيد التشغيل؛ لم يبدأ تشغيل مكرر',skipped:true}
  const run={id:runId}
  try {
    let sources:Row[]=[],via='wordpress',warning=''
    try {
      // Small public embedded pages avoid this site's projection/reset behavior.
      // Upsert the latest 50 posts daily (100 on a full refresh); IDs and URLs prevent repeats.
      const params=new URLSearchParams({per_page:'5',_embed:'wp:featuredmedia,wp:term'})
      const maxPages=refresh||!last?20:10
      for(let page=1;page<=maxPages;page++){
        if(page>1)params.set('page',String(page))
        const query=params.toString().replace(/%3A/gi,':').replace(/%2C/gi,',')
        const data=JSON.parse(await siteText(`${SITE}/wp-json/wp/v2/posts?${query}`))
        if(!Array.isArray(data)){
          if(obj(data).code==='rest_post_invalid_page_number')break
          throw new Error('استجابة ووردبريس ليست قائمة أخبار')
        }
        sources.push(...data.map(normalizeWordPressSource).filter((v):v is Row=>!!v))
        if(data.length<5)break
      }
    }catch(error){
      via='rss';warning=`تعذر REST؛ استخدم RSS: ${error instanceof Error?error.message:'خطأ المصدر'}`
      try{sources=normalizeRssSources(await siteText(`${SITE}/feed/`))}catch(rssError){throw new Error(`${warning}؛ RSS: ${rssError instanceof Error?rssError.message:'تعذر المصدر'}`)}
      if(!sources.length)throw new Error('تعذر جلب أخبار صالحة من REST وRSS')
    }
    let newCount=0
    for(const source of sources){
      let lookupQuery=db.from('editorial_sources').select('id,raw,content,title,image_url')
      lookupQuery=source.wp_post_id?lookupQuery.eq('wp_post_id',source.wp_post_id):lookupQuery.eq('url',source.url)
      const {data:previous,error:lookup}=await lookupQuery.maybeSingle();if(lookup)throw new Error(lookup.message)
      const cacheStillValid=previous?.content===source.content&&previous?.title===source.title&&previous?.image_url===source.image_url
      const payload={...source,raw:{...obj(source.raw),...(cacheStillValid&&obj(previous?.raw)._studioAnalysis?{_studioAnalysis:obj(previous?.raw)._studioAnalysis}:{})}}
      const result=previous?await db.from('editorial_sources').update(payload).eq('id',previous.id):await db.from('editorial_sources').upsert(payload,{onConflict:'url',ignoreDuplicates:true})
      if(result.error)throw new Error(result.error.message)
      if(!previous)newCount++
    }
    const {error}=await db.from('editorial_sync_runs').update({status:'completed',source:via,imported_count:sources.length,new_count:newCount,error:warning||null,completed_at:new Date().toISOString()}).eq('id',run.id)
    if(error)throw new Error(error.message)
    return {id:run.id,newCount,imported:sources.length,source:via,warning}
  }catch(error){const message=error instanceof Error?error.message:'فشلت المزامنة';await db.from('editorial_sync_runs').update({status:'failed',error:message,completed_at:new Date().toISOString()}).eq('id',run.id);throw error}
}

/** Reuse documentary source material from the archive, never its social poster as a news photo. */
export async function importArchiveSource(entry:Row):Promise<string|null> {
  const snapshot=obj(entry.snapshot)
  const link=String(entry.source_url||snapshot.post_url||'')
  const content=String(snapshot.source_content||'')
  const photo=String(snapshot.source_image_url||'')
  if(!link||!content||!photo)return null
  let url:string;try{url=canonicalStoryUrl(link)}catch{return null}
  const db=await createServiceRoleClient()
  const {data:existing}=await db.from('editorial_sources').select('id').eq('url',url).maybeSingle();if(existing)return existing.id
  const {data,error}=await db.from('editorial_sources').insert({url,wp_post_id:Number(snapshot.wp_post_id)>0?Number(snapshot.wp_post_id):null,title:String(entry.title||snapshot.post_title||''),content,excerpt:'',image_url:photo,raw:{archiveEntryId:entry.id},imported_via:'archive',published_at:snapshot.created_at||null}).select('id').single()
  if(error)throw new Error(error.message);return data.id
}

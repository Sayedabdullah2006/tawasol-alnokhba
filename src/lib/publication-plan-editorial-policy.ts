/** Selection and framing policy, separate from the owner's frozen studio prompts. */
export const EDITORIAL_POLICY_VERSION='story-first-2026-11-10'
export type EditorialKind='story'|'profile'
export type StoryAngle={version:string;kind:EditorialKind;mode:'evergreen'|'current'|'unsuitable';focus:string;headline:string;metric:string;dateContext:string;historicalAwards:boolean;domain:string;reason:string}
export function eligibleNarrative(analysis:Record<string,unknown>,angle:StoryAngle):boolean {
  if(!String(analysis.name||'').trim()||analysis.has_real_photo!==true||!['A','B'].includes(String(analysis.news_strength))||angle.mode==='unsuitable')return false
  // An evergreen personal story does not need a new trophy or an invented performance metric.
  return analysis.news_strength==='A'||(angle.mode==='evergreen'&&Array.isArray(analysis.key_facts)&&analysis.key_facts.length>=3)
}
export function editorialKind(day:string,slot:number):EditorialKind {
  const offset=Math.round((Date.parse(`${day}T00:00:00Z`)-Date.parse('2026-11-10T00:00:00Z'))/86400000)
  return (offset+slot)%2===0?'story':'profile'
}
export function storyOpeningError(main:string,angle:StoryAngle):string|null {
  if(angle.mode==='unsuitable')return 'المادة لا تملك زاوية حكاية مفيدة؛ اختر مادة أخرى'
  const opening=main.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,2).join(' ')
  if(angle.historicalAwards&&/(?:جائز[ةه]|جوائز|ميدالي|المركز\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس)|حصد|يحصد|نال|ينال|تُ?توّ?ج|تتويج)/u.test(opening))return 'افتتاحية المنشور تعيد تقديم تكريم قديم كخبر؛ قدّم الفكرة أو المسيرة واجعل التكريم وسنته معلومة لاحقة'
  return null
}
export const ACTIVE_SCHEDULE_STATES=['pending','checking','submitting','scheduled','uncertain']
export function isScheduleReserved(state:string|undefined):boolean{return ACTIVE_SCHEDULE_STATES.includes(state||'')}
export function remoteDeliveryState(status:unknown):'scheduled'|'completed'|'failed'|'uncertain'{
  const value=String(status).toUpperCase()
  return value==='COMPLETED'?'completed':['FAILED','MEDIA_IMPORT_FAILED'].includes(value)?'failed':value==='PARTIALLY_COMPLETED'?'uncertain':'scheduled'
}
export function proposePlanTime(day:string,preferred:string,occupied:string[],now=new Date()):string {
  const times=Array.from({length:13},(_,i)=>`${day}T${String(20+Math.floor(i/4)).padStart(2,'0')}:${String(i%4*15).padStart(2,'0')}:00+03:00`)
  times.sort((a,b)=>Math.abs(Date.parse(a)-Date.parse(preferred))-Math.abs(Date.parse(b)-Date.parse(preferred)))
  const selected=times.find(t=>Date.parse(t)>now.getTime()+60000&&occupied.every(other=>Math.abs(Date.parse(t)-Date.parse(other))>=3600000))
  if(!selected)throw new Error('لا يوجد موعد متاح بين 8 و11 مساءً لهذا اليوم؛ اختر تاريخًا بديلًا للمراجعة')
  return new Date(selected).toISOString()
}
export function validateScheduleTime(value:string,now=new Date()):string {
  const date=new Date(value),local=new Date(date.getTime()+3*3600000)
  if(!Number.isFinite(date.getTime())||date.getTime()<now.getTime()+60000)throw new Error('اختر موعدًا مستقبليًا')
  const minute=local.getUTCHours()*60+local.getUTCMinutes()
  if(minute<1200||minute>1380)throw new Error('وقت الخطة بين 8 و11 مساءً بتوقيت الرياض')
  return date.toISOString()
}
export function xThreadPayload(args:{main:string;firstReply:string;attachments:string[];accountIds:number[];when:string}) {
  if(!args.main.trim()||!args.firstReply.includes('first1saudi.net')||!args.attachments.length||!args.accountIds.length)throw new Error('أكمل النص والرد الأول والتصميم والقناة قبل الجدولة')
  if(/https?:\/\/(?:www\.)?first1saudi\.net/iu.test(args.main))throw new Error('رابط الحكاية في الرد الأول فقط')
  if(args.main.split('\n').some(l=>/^\s*\d+\/\d+/.test(l)))throw new Error('السلسلة المرقمة تحتاج فصل أجزائها ومراجعتها قبل الجدولة؛ لا ترسلها كمنشور واحد')
  const weighted=[...args.main].reduce((n,c)=>n+(/\p{Extended_Pictographic}/u.test(c)?2:1),0)
  if(weighted>280)throw new Error('التغريدة تتجاوز حد X؛ اختصرها قبل الجدولة')
  return {scheduledTime:args.when,isDraft:false,publications:args.accountIds.map(id=>({socialMediaAccountId:id,platformSettings:{type:'X_TWITTER'},posts:[{content:args.main,attachmentPaths:args.attachments},{content:args.firstReply}]}))}
}

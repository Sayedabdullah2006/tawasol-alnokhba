/** Pure calendar rules; news and image prompts remain in studio-reference-prompts.ts. */
export const PLAN_TIMEZONE = 'Asia/Riyadh'
export const DEFAULT_PLAN_TIMES = ['20:30', '22:30']
export const POST_TYPES = ['story', 'thread', 'carousel', 'number-card', 'discussion', 'quote'] as const
export type PlanPostType = typeof POST_TYPES[number]
export const POST_TYPE_LABELS: Record<PlanPostType, string> = { story: 'قصة', thread: 'سلسلة', carousel: 'كاروسيل', 'number-card': 'بطاقة رقم', discussion: 'نقاش', quote: 'اقتباس' }
export type PlanSlot = { slot: number; time: string; type: PlanPostType; topic: string; hook: string; handles: string[]; designDirection: string; test: string; notes: string; sourceIds?: string[]; sourceCount?:number;editorialKind?:'story'|'profile'; collaboration?: boolean; collaborationConfirmed?:boolean; quotePostUrl?:string; testException?: 'number-dominant-2026-11-21' }
export type PlanDay = { date: string; phase: string; slots: PlanSlot[] }
export type PlanProposal = { days: PlanDay[]; phases: { name: string; start: string; end: string }[]; fixedRules: string[]; weeklyMix: string[]; successCriteria: string[]; warnings: string[]; discussionQuestions: string[]; carouselIdeas: string[]; topStories?: { id: string; title: string; url: string; reason: string }[] }
export type PlanInput = { name: string; startDate: string; endDate: string; times: string[]; instructions: string }

export function riyadhDay(now = new Date()): string { return now.toLocaleDateString('en-CA', { timeZone: PLAN_TIMEZONE }) }
export function dayRange(start: string, end: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new Error('أدخل تاريخي البداية والنهاية الصحيحين')
  const first = Date.parse(`${start}T00:00:00Z`), last = Date.parse(`${end}T00:00:00Z`)
  if (!Number.isFinite(first) || !Number.isFinite(last) || new Date(first).toISOString().slice(0,10) !== start || new Date(last).toISOString().slice(0,10) !== end || last < first || last - first > 365 * 86400000) throw new Error('مدة الخطة غير صالحة؛ الحد الأقصى سنة')
  return Array.from({length: Math.round((last-first)/86400000)+1},(_,i)=>new Date(first+i*86400000).toISOString().slice(0,10))
}
export function validatePlanInput(value: unknown): PlanInput {
  const v = value as Partial<PlanInput> | null
  if (!v || typeof v.name !== 'string' || !v.name.trim() || v.name.length > 150) throw new Error('اسم الخطة مطلوب وبحد أقصى 150 حرفًا')
  const startDate = String(v.startDate ?? ''), endDate = String(v.endDate ?? '')
  dayRange(startDate,endDate)
  const times = Array.isArray(v.times) ? [...v.times] : DEFAULT_PLAN_TIMES
  if (times.length < 1 || times.length > 2 || new Set(times).size !== times.length || times.some(t=>!/^2[0-2]:[0-5]\d$/.test(t) && t!=='23:00')) throw new Error('اختر منشورًا أو منشورين بأوقات مختلفة بين 8 و11 مساءً')
  if (typeof v.instructions !== 'string' || !v.instructions.trim() || v.instructions.length > 60000) throw new Error('ألصق إرشادات الخطة؛ الحد الأقصى 60 ألف حرف')
  return {name:v.name.trim(),startDate,endDate,times:times.sort(),instructions:v.instructions}
}
const blankTopic = 'يُختار من أخبار الموقع الموثقة عند إعداد هذا اليوم'
function slot(type: PlanPostType,time: string,index: number,test = ''): PlanSlot { return {slot:index,time,type,topic:blankTopic,hook:'يُكتب من أقوى حقيقة في الخبر المختار',handles:[],designDirection:'ثلاثة اتجاهات ديناميكية وفق الخبر والصورة؛ الهوية الثالثة والنص الأدنى',test,notes:''} }

/** The owner's exact first-month phase dates are deterministic, rather than guessed by a model. */
export function firstThirtyDayProposal(input: PlanInput): PlanProposal {
  const dates=dayRange(input.startDate,input.endDate)
  if (input.startDate!=='2026-11-10'||input.endDate!=='2026-12-09'||dates.length!==30) throw new Error('هذه البنية تخص الخطة الأولى فقط')
  const days=dates.map((date,index):PlanDay=>{
    const phase=index<7?'تثبيت النمط الجديد':index<14?'اختبار عنصر واحد':index<21?'تكرار الصيغة الفائزة':'التوسع'
    const slots=input.times.map((time,i)=>slot('story',time,i))
    if (index>=7 && index<9) slots.forEach((s,i)=>{s.type=i===0?'thread':'story';s.test='سلسلة مرقمة مقابل منشور واحد؛ تغيير التنسيق فقط'})
    if (index>=9 && index<11) slots.forEach((s,i)=>{s.type=i===0?'carousel':'story';s.test='كاروسيل 3 صور مقابل صورة واحدة؛ تغيير التنسيق فقط'})
    if (index===11) slots.forEach((s,i)=>{s.type=i===0?'number-card':'story';s.test='استثناء اختبار';if(i===0){s.testException='number-dominant-2026-11-21';s.notes='نسختان للمراجعة: المعتاد بصورة 60% على الأقل، وبطاقة رقم مهيمن بصورة 25–35% ووجه واضح. الاستثناء لهذا اليوم فقط؛ البرومبت المرجعي ثابت.'}})
    if (index===12) {slots[0].type='discussion';slots[0].test='سؤال واحد محدد مرتبط بقصة موثقة'}
    if (index===13) {slots[0].type='quote';slots[0].test='اقتباس أفضل منشور وفق بيانات الأداء المتاحة';slots[0].notes='لا يُخمن المنشور الأفضل دون بيانات أداء أو اختيار المحرر'}
    if (index>=14 && index<21) {
      slots[0].notes='تُحدد الصيغة الفائزة من نتائج الأسبوع الثاني قبل إعداد اليوم؛ لا يُفترض فائز'
      if ([15,17,19].includes(index)&&slots[1]) slots[1].type='discussion'
    }
    if (date==='2026-11-26'||date==='2026-12-03') {slots[0].type='thread';slots[0].sourceCount=5;slots[0].topic='أوائل الأسبوع: خمسة إنجازات موثقة';slots[0].notes='خمس قصص مستقلة صالحة؛ لا يوصف أي إنجاز بالأول دون توثيق أسبقيته'}
    if (index>=21) {
      if (['2026-12-01','2026-12-05','2026-12-08'].includes(date)) {slots[0].type='carousel';slots[0].notes='3 إلى 4 صور فعلية، لا شبكة صور واحدة'}
      if (['2026-12-02','2026-12-04','2026-12-06','2026-12-09'].includes(date)&&slots[1]) slots[1].type='discussion'
      if (date==='2026-12-07') {slots[0].collaboration=true;slots[0].notes='تعاون محتمل مع صاحب إنجاز؛ يحتاج تنسيقًا صريحًا، لا ترسل رسائل أو تدّع اتفاقًا دون تفويض'}
    }
    return {date,phase,slots}
  })
  return {days,phases:[{name:'تثبيت النمط الجديد',start:'2026-11-10',end:'2026-11-16'},{name:'اختبار عنصر واحد',start:'2026-11-17',end:'2026-11-23'},{name:'تكرار الصيغة الفائزة',start:'2026-11-24',end:'2026-11-30'},{name:'التوسع',start:'2026-12-01',end:'2026-12-09'}],fixedRules:['منشوران أصليان يوميًا الساعة 20:30 و22:30 بتوقيت الرياض','لا إعادة نشر ذاتي؛ إعادة إبراز القصة عبر اقتباس بتعليق جديد','إعادات النشر والاقتباسات لا تتجاوز 20% كلٌ وفق تصنيفه','رابط الحكاية في رد أول منفصل','خطاف موثق ثم الاسم والإنجاز والنقاط والحساب المتحقق وسؤال محدد','لا اختلاق معلومات، ولا نشر تلقائي دون اعتماد المادة'],weeklyMix:['7–10 قصص إنجاز؛ 2–3 نقاشات؛ 1–2 كاروسيل في الأسبوع عند ملاءمة المرحلة','توجيه المرحلة المحدد مقدم على المزيج العام؛ الأسبوع الأول كله قصص بصورة واحدة'],successCriteria:['متوسط المشاهدات أكثر من 20,000 للمنشور الأصلي','10 ردود أو أكثر','4 منشورات على الأقل تتجاوز 30,000 مشاهدة'],warnings:['استثناء اختبار معتمد من المالك ليوم 21 نوفمبر فقط: نسختان للمراجعة، معتاد بصورة 60%+ ورقم مهيمن بصورة 25–35% ووجه واضح. لا ينتقل الاستثناء لأي يوم آخر ولا يغير البرومبت المثبت.','المزيج العام لا يطبق حرفيًا على الأسبوع الأول؛ توجيه تثبيت النمط بـ14 قصة هو الأكثر تحديدًا.','اختيار الصيغة الفائزة، وأفضل منشور للاقتباس، والتعاون والمناسبات يحتاج بيانات أو اعتمادًا عند حلول اليوم؛ لا تُخترع نتائج أو اتفاقات.','موضوعات الأيام المقبلة ترشيحات قابلة للمراجعة، ويجري اختيار الأخبار الفعلية من المزامنة اليومية قبل إعداد المسودات.'],discussionQuestions:['أي تجربة تعليمية أحدثت الفرق في مسارك، وما الذي تغير بعدها؟','ما الدعم العملي الذي يحتاجه الباحث السعودي لتحويل بحثه إلى منتج؟','حين تقرأ حكاية إنجاز، أيهما يساعدك أكثر: خطوات الوصول أم تفاصيل النتيجة؟','ما العائق الذي تتمنى أن تتناوله حكايات المبتكرين بوضوح أكبر؟'],carouselIdeas:['ثلاث شرائح لإنجاز موثق: صاحبه، رقم الإنجاز بسياقه، وما يتيحه للمهتمين من معلومات مثبتة.','أربع شرائح لمسيرة موثقة: البداية، التحول، الإنجاز، وسؤال ختامي؛ دون اختلاق مراحل أو تكرار نقاط التغريدة.']}
}

export function validateProposal(value: unknown,input: PlanInput): PlanProposal {
  const v=value as PlanProposal
  const dates=dayRange(input.startDate,input.endDate)
  if (!v||!Array.isArray(v.days)||v.days.length!==dates.length) throw new Error('جدول التحليل لا يغطي كل أيام المدة؛ أعد التحليل')
  const byDate=new Map(v.days.map(d=>[d.date,d]));if(byDate.size!==dates.length)throw new Error('الجدول يحتوي أيامًا مكررة')
  const days=dates.map(date=>{
    const d=byDate.get(date);if(!d||!Array.isArray(d.slots)||d.slots.length!==input.times.length)throw new Error('عدد المنشورات لا يطابق الخطة في '+date)
    return {date,phase:String(d.phase||'الخطة المعتمدة'),slots:d.slots.map((s,i)=>{
      if(!POST_TYPES.includes(s.type))throw new Error('نوع منشور غير مدعوم في '+date)
      const sourceCount=s.sourceCount??1
      if(!Number.isInteger(sourceCount)||sourceCount<1||sourceCount>5)throw new Error('الموعد المجمع يدعم من خبر إلى خمسة أخبار مستقلة؛ راجع العدد المطلوب في '+date)
      return {...slot(s.type,input.times[i],i),sourceCount,topic:String(s.topic||blankTopic),hook:String(s.hook||''),handles:Array.isArray(s.handles)?s.handles.filter(h=>typeof h==='string'):[],designDirection:String(s.designDirection||''),test:String(s.test||''),notes:String(s.notes||''),collaboration:!!s.collaboration}
    })}
  })
  const list=(x:unknown)=>Array.isArray(x)?x.filter((t):t is string=>typeof t==='string').slice(0,100):[]
  return {days,phases:Array.isArray(v.phases)?v.phases.filter(p=>p&&typeof p.name==='string'&&dates.includes(p.start)&&dates.includes(p.end)):[],fixedRules:list(v.fixedRules),weeklyMix:list(v.weeklyMix),successCriteria:list(v.successCriteria),warnings:list(v.warnings),discussionQuestions:list(v.discussionQuestions).slice(0,4),carouselIdeas:list(v.carouselIdeas).slice(0,2)}
}

/** Preserve the current/past and any published dates when editing an active plan. */
export function mergeFutureDays(previous: PlanProposal,next: PlanProposal,today: string,publishedDates: string[]=[]): PlanProposal {
  const locked=new Set(publishedDates)
  const kept=previous.days.filter(d=>d.date<=today||locked.has(d.date))
  return {...next,days:[...kept,...next.days.filter(d=>d.date>today&&!locked.has(d.date))].sort((a,b)=>a.date.localeCompare(b.date))}
}

export function eligibleSourceDate(lastUse: string|undefined,target: string,type: PlanPostType): boolean {
  return type==='quote'||!lastUse||Math.abs(Date.parse(target)-Date.parse(lastUse))>=30*86400000
}

export type TweetBundle={main:string;firstReply:string;hooks:string[];handles:string[];proposedTime:string;raw:string}
export function parseTweetBundle(raw: string,articleUrl: string):TweetBundle {
  const clean=raw.replace(/^#{1,4}[ \t]+/gm,'').replace(/\*\*/g,'')
  const pick=(from:string,to:string)=>clean.match(new RegExp(from+'\\s*[:：]?\\s*([\\s\\S]*?)(?='+to+'|$)','u'))?.[1]?.trim()||''
  const main=pick('التغريدة الرئيسية','الرد الأول|3 بدائل|ثلاثة بدائل|الحسابات المقترح|وقت النشر').replace(/^[ \t]*(?:الطول الموزون|عدد المحارف|طول التغريدة|عدد الأحرف)[^\n]*$/gm,'').trim()
  const reply=pick('الرد الأول(?:\\s*(?:\\([^\\n]*\\)|(?:مع\\s+)?(?:بالرابط|الرابط)))?','3 بدائل|ثلاثة بدائل|الحسابات المقترح|وقت النشر')
  const hooks=pick('(?:3|ثلاثة) بدائل للخطاف','الحسابات المقترح|وقت النشر').split('\n').map(s=>s.replace(/^\s*[\d١-٩]+[.)/\-]\s*/,'').trim()).filter(Boolean).slice(0,3)
  const handles=pick('الحسابات المقترح ذكرها','وقت النشر').split('\n').map(s=>s.trim()).filter(Boolean)
  if(!main||/https?:\/\/(?:www\.)?first1saudi\.net/iu.test(main)||hooks.length!==3)throw new Error('حزمة التغريدة تحتاج مراجعة: تحقق من النص الرئيسي وبدائل الخطاف وفصل الرابط')
  return {main,firstReply:reply.replace(/يُدرج رابط الحكاية بعد نشرها/g,articleUrl)||`اقرأ الحكاية: ${articleUrl}`,hooks,handles,proposedTime:pick('وقت النشر المقترح','(?!)'),raw}
}

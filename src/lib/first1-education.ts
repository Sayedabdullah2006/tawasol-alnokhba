import { OPENAI_MODEL } from '@/lib/ai-studio'
import { generateImageWithOpenAI } from '@/lib/image-generation'
import { compositeLogoBottomRight, resizeToPoster } from '@/lib/logo-overlay'
import { chatComplete, getOpenAI } from '@/lib/openai'
import { cancelScheduledPost, listScheduledPosts, publishNow, uploadMediaFromUrl } from '@/lib/postpulse'
import { createServiceRoleClient } from '@/lib/supabase-server'

export const FIRST1_EDUCATION_SOURCE = 'first1saudi-educational'

export type EducationTopic = {
  id: string
  title: string
  category: string
  sourceUrl: string
  facts: string[]
  contentTags: string[]
  format?: 'insight' | 'how-to'
  generationContext?: string
}

export type GeneratedEducation = {
  title: string
  caption: string
  infographicTitle: string
  infographicPoints: string[]
  visualDirection: string
  contentTags: string[]
}

type InfographicOptions = {
  visualInstructions?: string
  referenceImageUrls?: string[]
}

const TOPICS: EducationTopic[] = [
  {
    id: 'patent-readiness',
    title: 'قبل أن تقول: اختراعي جاهز',
    category: 'براءة واختراع',
    sourceUrl: 'https://www.saip.gov.sa/ar/services/patents/pages/patentregistration.aspx',
    facts: [
      'تتطلب براءة الاختراع الجدة والخطوة الابتكارية والقابلية للتطبيق الصناعي.',
      'الإفصاح العلني عن الاختراع قبل الإيداع قد يؤثر في شرط الجدة.',
    ],
    contentTags: ['#براءات_اختراع', '#مخترعون'],
  },
  {
    id: 'patent-search',
    title: 'ابحث قبل أن تبني النموذج',
    category: 'بحث وبراءات',
    sourceUrl: 'https://www.saip.gov.sa/ar/services/patents/pages/patentsearch.aspx',
    facts: [
      'توفر الهيئة السعودية للملكية الفكرية خدمة بحث في وثائق البراءات الوطنية.',
      'الخدمة متاحة للأفراد والمنشآت، ونتيجتها فورية ومجانية وفق وصف الخدمة.',
    ],
    contentTags: ['#بحث_البراءات', '#ابتكار'],
  },
  {
    id: 'mvp',
    title: 'لا تبنِ المنتج كاملاً أولاً',
    category: 'ريادة وابتكار',
    sourceUrl: 'https://www.monshaat.gov.sa/ar/node/12046',
    facts: [
      'الحد الأدنى من المنتج القابل للتطبيق يساعد على اختبار الفكرة في السوق.',
      'اختبار الفكرة مبكراً يقلل تكلفة بناء منتج كامل قبل التحقق من الحاجة إليه.',
    ],
    contentTags: ['#ريادة_الأعمال', '#نموذج_أولي'],
  },
  {
    id: 'market-study',
    title: 'الفكرة الجيدة تبدأ بسؤال السوق',
    category: 'ريادة وابتكار',
    sourceUrl: 'https://www.monshaat.gov.sa/ar/node/15493',
    facts: [
      'تساعد دراسة السوق على فهم العميل والسوق قبل اتخاذ قرارات المشروع.',
      'البحث المنظم يرفع جودة القرارات المرتبطة بالفكرة والفرصة.',
    ],
    contentTags: ['#دراسة_السوق', '#رواد_الأعمال'],
  },
  {
    id: 'prototype',
    title: 'النموذج الأولي ليس النسخة النهائية',
    category: 'تطوير المنتجات',
    sourceUrl: 'https://www.monshaat.gov.sa/ar/node/12046',
    facts: [
      'يمكن استخدام النموذج الأولي لاختبار الفكرة قبل التوسع في التنفيذ.',
      'التعلم من المستخدمين في المراحل المبكرة جزء من تحسين الحل.',
    ],
    contentTags: ['#تطوير_المنتجات', '#ابتكار'],
  },
]

const HOW_TO_TOPICS: EducationTopic[] = [
  {
    id: 'how-to-validate-problem', title: 'كيف تتأكد أن فكرتك تحل مشكلة حقيقية؟', category: 'كيف تبدأ؟ الابتكار',
    sourceUrl: 'https://www.monshaat.gov.sa/ar/node/15493',
    facts: ['دراسة السوق تساعد على فهم العميل والسوق قبل اتخاذ قرارات المشروع.', 'البحث المنظم يرفع جودة القرارات المرتبطة بالفكرة والفرصة.'],
    contentTags: ['#ابتكار', '#دراسة_السوق'], format: 'how-to',
  },
  {
    id: 'how-to-patent-search', title: 'كيف تبحث عن براءة قبل بناء اختراعك؟', category: 'كيف تبدأ؟ الملكية الفكرية',
    sourceUrl: 'https://www.saip.gov.sa/ar/services/patents/pages/patentsearch.aspx',
    facts: ['توفر الهيئة السعودية للملكية الفكرية خدمة بحث في وثائق البراءات الوطنية.', 'الخدمة متاحة للأفراد والمنشآت، ونتيجتها فورية ومجانية وفق وصف الخدمة.'],
    contentTags: ['#براءات_اختراع', '#بحث_البراءات'], format: 'how-to',
  },
  {
    id: 'how-to-document-idea', title: 'كيف توثّق فكرتك قبل أن تشاركها؟', category: 'كيف تبدأ؟ اختراع',
    sourceUrl: 'https://www.saip.gov.sa/ar/services/patents/pages/patentregistration.aspx',
    facts: ['تتطلب براءة الاختراع الجدة والخطوة الابتكارية والقابلية للتطبيق الصناعي.', 'الإفصاح العلني عن الاختراع قبل الإيداع قد يؤثر في شرط الجدة.'],
    contentTags: ['#اختراع', '#ملكية_فكرية'], format: 'how-to',
  },
  {
    id: 'how-to-build-mvp', title: 'كيف تصنع نموذجاً أولياً بدون تعقيد؟', category: 'كيف تبدأ؟ ريادة الأعمال',
    sourceUrl: 'https://www.monshaat.gov.sa/ar/node/12046',
    facts: ['الحد الأدنى من المنتج القابل للتطبيق يساعد على اختبار الفكرة في السوق.', 'اختبار الفكرة مبكراً يقلل تكلفة بناء منتج كامل قبل التحقق من الحاجة إليه.'],
    contentTags: ['#نموذج_أولي', '#ريادة_الأعمال'], format: 'how-to',
  },
  {
    id: 'how-to-interview-customer', title: 'كيف تسأل عميلك قبل أن تبني الحل؟', category: 'كيف تبدأ؟ ريادة الأعمال',
    sourceUrl: 'https://www.monshaat.gov.sa/ar/node/15493',
    facts: ['دراسة السوق تساعد على فهم العميل والسوق قبل اتخاذ قرارات المشروع.', 'فهم العميل والسوق يسبق اتخاذ قرارات المشروع.'],
    contentTags: ['#فهم_العميل', '#ريادة_الأعمال'], format: 'how-to',
  },
  {
    id: 'how-to-improve-prototype', title: 'كيف تطور نموذجك من أول ملاحظة؟', category: 'كيف تبدأ؟ تطوير المنتجات',
    sourceUrl: 'https://www.monshaat.gov.sa/ar/node/12046',
    facts: ['يمكن استخدام النموذج الأولي لاختبار الفكرة قبل التوسع في التنفيذ.', 'التعلم من المستخدمين في المراحل المبكرة جزء من تحسين الحل.'],
    contentTags: ['#تطوير_المنتجات', '#ابتكار'], format: 'how-to',
  },
  {
    id: 'how-to-test-market', title: 'كيف تختبر السوق قبل أن تصرف على المنتج؟', category: 'كيف تبدأ؟ السوق',
    sourceUrl: 'https://www.monshaat.gov.sa/ar/node/12046',
    facts: ['الحد الأدنى من المنتج القابل للتطبيق يساعد على اختبار الفكرة في السوق.', 'اختبار الفكرة مبكراً يقلل تكلفة بناء منتج كامل قبل التحقق من الحاجة إليه.'],
    contentTags: ['#اختبار_السوق', '#مشاريع_ناشئة'], format: 'how-to',
  },
  {
    id: 'how-to-prepare-patent', title: 'كيف تجهز فكرتك لرحلة البراءة؟', category: 'كيف تبدأ؟ براءات الاختراع',
    sourceUrl: 'https://www.saip.gov.sa/ar/services/patents/pages/patentregistration.aspx',
    facts: ['تتطلب براءة الاختراع الجدة والخطوة الابتكارية والقابلية للتطبيق الصناعي.', 'الإفصاح العلني عن الاختراع قبل الإيداع قد يؤثر في شرط الجدة.'],
    contentTags: ['#براءات_اختراع', '#مخترعون'], format: 'how-to',
  },
]

const EDUCATIONAL_BATCH_INTERVAL_DAYS = 7
const MIN_EDUCATIONAL_DAY_GAP = 2

function riyadhDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return { year: Number(value('year')), month: Number(value('month')), day: Number(value('day')) }
}

export function riyadhDay(date = new Date()): string {
  const { year, month, day } = riyadhDateParts(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function topicForDay(day: string): EducationTopic {
  const [year, month, date] = day.split('-').map(Number)
  const serial = Math.floor(Date.UTC(year, month - 1, date) / 86_400_000)
  // كل دفعة من ثلاثة أيام تتضمن دليلاً عملياً واحداً قابلًا للحفظ.
  if (Math.abs(serial) % 3 === 1) return HOW_TO_TOPICS[Math.abs(serial) % HOW_TO_TOPICS.length]
  return TOPICS[Math.abs(serial) % TOPICS.length]
}

function dayOffset(day: string, offset: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + offset)).toISOString().slice(0, 10)
}

function dayDistance(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

function cleanCaption(value: string): string {
  return value.replace(/\*+/g, '').replace(/https?:\/\/\S+/g, '').trim()
}

function normalizeTag(value: string): string | null {
  const tag = value.trim().replace(/^#+/, '').replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '')
  return tag ? `#${tag}` : null
}

export async function generateEducationCopy(topic: EducationTopic): Promise<GeneratedEducation> {
  const howToDirective = topic.format === 'how-to'
    ? 'هذا منشور «كيف تبدأ؟». اجعله دليلاً عملياً بثلاث خطوات فعلية مرتبة، لا نصيحة عامة. يبدأ العنوان وصياغة المنشور بكلمة «كيف»، وتكون كل نقطة في التصميم خطوة قصيرة قابلة للتنفيذ. لا تخترع أدوات أو أرقاماً أو متطلبات غير موجودة في الحقائق.'
    : 'هذا منشور تثقيفي من نوع معلومة أو إضاءة عملية.'
  const completion = await chatComplete(getOpenAI(), {
    model: OPENAI_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `أنت كاتب محتوى لحساب أول سعودي. اكتب منشوراً عربياً واحداً فقط، عملياً ومشوقاً ومفيداً للمبتكرين والمخترعين ورواد الأعمال في السعودية. اكتب بأسلوب عفوي ذكي بلهجة سعودية خفيفة ومفهومة، كأنك تفتح سالفة مفيدة مع شخص طموح؛ تجنب الفصحى الرسمية والتقريرية والعبارات المعلبة. ابدأ بخطاف قصير يثير الفضول، واجعل القارئ يشعر أن المعلومة تستحق الحفظ وإعادة النشر. حافظ على الدقة ولا تضف حقائق خارج المعطيات. ممنوع ذكر المصدر أو الرابط أو اسم الجهة داخل المنشور. لا تستخدم Markdown أو النجوم أو التعداد الشكلي. أعد JSON فقط بالمفاتيح: title, caption, infographicTitle, infographicPoints, visualDirection, contentTags. caption بين 55 و100 كلمة ومن دون أي هاشتاق. contentTags مصفوفة من هاشتاقين عربيين فقط، مرتبطين مباشرة بموضوع المنشور. لا تستخدم #First1Saudi. infographicPoints مصفوفة من 3 نقاط عربية قصيرة جداً. ${howToDirective}`,
      },
      {
        role: 'user',
        content: `الموضوع: ${topic.title}\nالتصنيف: ${topic.category}\nالحقائق المسموح بها فقط:\n- ${topic.facts.join('\n- ')}${topic.generationContext ? `\n\nسياق سعودي إضافي موثّق: ${topic.generationContext}\nاربطه بالموضوع ربطاً طبيعياً وواضحاً، ولا تذكره إلا وفق هذه الصياغة والحقائق. لا تضف أرقاماً أو إنجازات أو أسماء أخرى من عندك.` : ''}`,
      },
    ],
  })
  const raw = completion.choices[0]?.message?.content ?? '{}'
  let parsed: Partial<GeneratedEducation> = {}
  try { parsed = JSON.parse(raw) as Partial<GeneratedEducation> } catch { /* handled below */ }
  const points = Array.isArray(parsed.infographicPoints)
    ? parsed.infographicPoints.map(point => cleanCaption(String(point))).filter(Boolean).slice(0, 3)
    : []
  const caption = cleanCaption(String(parsed.caption ?? ''))
  const contentTags = Array.isArray(parsed.contentTags)
    ? parsed.contentTags.map(tag => normalizeTag(String(tag))).filter((tag): tag is string => !!tag && tag !== '#إضاءات' && tag !== '#First1Saudi').slice(0, 2)
    : []
  if (!caption || points.length !== 3) throw new Error('تعذّر تجهيز النص التثقيفي بصيغته المطلوبة')
  const tags = contentTags.length === 2 ? contentTags : topic.contentTags
  return {
    title: cleanCaption(String(parsed.title ?? topic.title)) || topic.title,
    caption: `${caption.replace(/#\S+/g, '').trim()}\n\n#إضاءات ${tags.join(' ')}`,
    infographicTitle: cleanCaption(String(parsed.infographicTitle ?? topic.title)) || topic.title,
    infographicPoints: points,
    visualDirection: cleanCaption(String(parsed.visualDirection ?? 'مخطط معلوماتي حديث وواضح')),
    contentTags: tags,
  }
}

export async function generateEducationInfographic(content: GeneratedEducation, filePrefix = 'first1-education', options: InfographicOptions = {}): Promise<string> {
  const service = await createServiceRoleClient()
  const { data: brand } = await service.from('brand_settings').select('first1saudi_logo_url').eq('id', 1).single()
  if (!brand?.first1saudi_logo_url) throw new Error('أضف شعار أول سعودي من إعدادات الهوية أولاً')

  const prompt = [
    'Create one premium 4:5 Arabic social infographic for First1Saudi, 1080x1350.',
    'Make it an original, elegant editorial information design for Saudi innovators and inventors. Use deep teal, Saudi green accents, warm gold details, and generous but balanced visual hierarchy. Full bleed artwork, no white logo panel, no huge empty spaces, no copied social-post screenshot.',
    `Headline: ${content.infographicTitle}`,
    `Use exactly these three compact Arabic callouts, each visually distinct with a simple icon or data mark: ${content.infographicPoints.map((point, index) => `${index + 1}. ${point}`).join(' | ')}`,
    'STRICT RIGHT-TO-LEFT ARABIC LAYOUT: every Arabic text block must be right-aligned and read from right to left. For the three callouts, place number 1 on the FAR RIGHT, number 2 in the center, and number 3 on the LEFT. The visual journey must flow right-to-left; never put 1 on the left or arrange the numbered steps left-to-right. Use correctly connected Arabic letterforms and clear RTL hierarchy.',
    `Visual direction: ${content.visualDirection}.`,
    options.visualInstructions ?? 'Use symbolic innovation visuals such as a patent document, magnifier, prototype, blueprint, light path, or idea-to-market journey. Do not use people, flags, official seals, fake logos, sources, URLs, citations, or long paragraphs.',
    'When the concept calls for Saudi achievers or people, portray a balanced group of at least three diverse Saudi achievers rather than a lone hero. They must feel like a collective of innovators, researchers, or students; do not make any person an identifiable real-world likeness. The only exception is a national-occasion instruction that explicitly supplies official portrait references.',
    'Add a compact, elegant social footer with the recognizable icons for X, Instagram, LinkedIn, Facebook, and TikTok followed by the exact handle @First1Saudi. Keep the footer small and readable.',
    'Do not draw any brand logo. The original First1Saudi logo will be overlaid directly within the artwork at the extreme lower-right. Keep only a compact text-free pocket there, about 150 by 100 pixels, while the same artwork, texture, and colour continue behind it. Never create a frame, box, panel, banner, border, blank area, or separate footer for the logo.',
  ].join('\n\n')
  const safetyFallbackPrompt = [
    'Create one premium 4:5 Arabic social infographic for First1Saudi.',
    `Headline: ${content.infographicTitle}.`,
    `Use exactly these three compact Arabic callouts: ${content.infographicPoints.map((point, index) => `${index + 1}. ${point}`).join(' | ')}`,
    'Strict RTL: callout 1 on the far right, 2 in the centre, and 3 on the left. Use clearly connected Arabic letterforms.',
    `Visual direction: ${content.visualDirection}.`,
    options.referenceImageUrls?.length ? 'Preserve every supplied reference person faithfully and integrate them into the infographic, rather than making a plain portrait.' : '',
    'Use a compact footer with X, Instagram, LinkedIn, Facebook, and TikTok icons followed by @First1Saudi. Do not draw the First1Saudi logo; it is overlaid after generation. Full-bleed artwork, no white panel, no logo frame, no unsupported claims, flags, weapons, political or military imagery.',
  ].filter(Boolean).join('\n\n')
  const { b64 } = await generateImageWithOpenAI(prompt, options.referenceImageUrls ?? [], { aspectRatio: '4:5', safetyFallbackPrompt })
  const poster = await resizeToPoster(Buffer.from(b64, 'base64'))
  const { buffer } = await compositeLogoBottomRight(poster, brand.first1saudi_logo_url, { widthRatio: 0.1 })
  const path = `${filePrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
  const { error } = await service.storage.from('content-images').upload(path, buffer, { contentType: 'image/png' })
  if (error) throw new Error(`تعذّر حفظ التصميم: ${error.message}`)
  return service.storage.from('content-images').getPublicUrl(path).data.publicUrl
}

/** معاينة غير منشورة: تنشئ نصاً وتصميماً واحداً من دون سجل أو جدولة. */
export async function previewFirst1Education(): Promise<{ title: string; caption: string; designUrl: string }> {
  const topic = topicForDay(riyadhDay())
  const content = await generateEducationCopy(topic)
  return { title: content.title, caption: content.caption, designUrl: await generateEducationInfographic(content) }
}

function isActiveStatus(status: unknown): boolean {
  return !['failed', 'cancelled', 'canceled', 'draft', 'media_import_failed'].includes(String(status ?? '').toLowerCase())
}

async function schedulingOccupancy(): Promise<{ times: string[]; educationalDays: Set<string> }> {
  const service = await createServiceRoleClient()
  const { data: localPosts } = await service
    .from('postpulse_posts')
    .select('design_url,scheduled_for,status')
    .gte('scheduled_for', new Date().toISOString())
  const activeLocal = (localPosts ?? []).filter(row => isActiveStatus(row.status) && row.scheduled_for)
  const localTimes = activeLocal.map(row => String(row.scheduled_for))
  const { data: educational } = await service
    .from('social_schedule')
    .select('design_image_url')
    .eq('source', FIRST1_EDUCATION_SOURCE)
    .eq('status', 'scheduled')
  const educationalDesigns = new Set((educational ?? []).map(row => String(row.design_image_url ?? '')).filter(Boolean))
  const educationalDays = new Set(
    activeLocal
      .filter(row => educationalDesigns.has(String(row.design_url ?? '')))
      .map(row => riyadhDay(new Date(String(row.scheduled_for)))),
  )
  try {
    const remote = await listScheduledPosts()
    return { times: [...new Set([...localTimes, ...remote.filter(row => isActiveStatus(row.status)).map(row => row.when)])], educationalDays }
  } catch {
    return { times: localTimes, educationalDays }
  }
}

function nextAvailableSlot(occupied: string[], educationalDays: Set<string>): Date {
  const now = Date.now() + 20 * 60_000
  const times = occupied.map(value => new Date(value).getTime()).filter(Number.isFinite)
  const hours = [9, 11, 13, 16, 18, 19, 20, 21, 22]
  const start = riyadhDateParts(new Date(now))
  for (let offset = 0; offset < 60; offset++) {
    const dayStart = new Date(Date.UTC(start.year, start.month - 1, start.day + offset))
    const dayKey = riyadhDay(dayStart)
    const hasNearbyEducationalPost = [...educationalDays]
      .some(educationDay => Math.abs(dayDistance(educationDay, dayKey)) < MIN_EDUCATIONAL_DAY_GAP)
    if (hasNearbyEducationalPost) continue
    for (const hour of hours) {
      const candidate = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), dayStart.getUTCDate(), hour - 3, 0, 0))
      if (candidate.getTime() < now) continue
      if (times.every(value => Math.abs(value - candidate.getTime()) >= 90 * 60_000)) return candidate
    }
  }
  throw new Error('لم يُعثر على وقت شاغر للجدولة خلال 60 يوماً')
}

export async function ensureDailyFirst1Education(): Promise<{ created: boolean; scheduledFor: string[]; itemIds: string[]; titles: string[] }> {
  const service = await createServiceRoleClient()
  const today = riyadhDay()
  const { data: existing, error: existingError } = await service
    .from('social_schedule')
    .select('id,post_title,batch_date')
    .eq('source', FIRST1_EDUCATION_SOURCE)
    .order('batch_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingError) throw new Error(`تعذّر التحقق من دفعة المحتوى: ${existingError.message}`)
  if (existing && dayDistance(String(existing.batch_date), today) < EDUCATIONAL_BATCH_INTERVAL_DAYS) {
    return { created: false, scheduledFor: [], itemIds: [String(existing.id)], titles: [String(existing.post_title)] }
  }

  const { error: reservationError } = await service.from('first1_education_batches').insert({ batch_date: today })
  if (reservationError?.code === '23505') {
    return { created: false, scheduledFor: [], itemIds: [], titles: [] }
  }
  if (reservationError) throw new Error(`تعذّر حجز الدفعة التثقيفية: ${reservationError.message}`)

  const topics = [0, 1, 2].map(offset => topicForDay(dayOffset(today, offset)))
  let prepared: Array<{ topic: EducationTopic; content: GeneratedEducation; designUrl: string }>
  try {
    prepared = await Promise.all(topics.map(async topic => {
      const content = await generateEducationCopy(topic)
      return { topic, content, designUrl: await generateEducationInfographic(content) }
    }))
  } catch (error) {
    await service.from('first1_education_batches').update({ state: 'failed', updated_at: new Date().toISOString() }).eq('batch_date', today)
    throw error
  }
  const { data: inserted, error: insertError } = await service.from('social_schedule').insert(prepared.map((entry, index) => ({
    wp_post_id: -Number(`8${today.replace(/-/g, '')}${index + 1}`),
    post_url: entry.topic.sourceUrl,
    post_title: entry.content.title,
    category: entry.topic.category,
    source: FIRST1_EDUCATION_SOURCE,
    source_content: `حقائق مرجعية داخلية:\n${entry.topic.facts.join('\n')}`,
    source_image_url: null,
    design_image_url: entry.designUrl,
    tweets: entry.content.caption,
    chosen_concept: entry.content.visualDirection,
    batch_date: today,
    status: 'suggested',
    email_sent: false,
  }))).select('id')
  if (insertError || !inserted?.length) {
    await service.from('first1_education_batches').update({ state: 'failed', updated_at: new Date().toISOString() }).eq('batch_date', today)
    throw new Error(`تعذّر حفظ دفعة المحتوى التثقيفي: ${insertError?.message ?? 'خطأ غير معروف'}`)
  }

  // كل تصميم يدخل السجل الموحد، ليصبح مرشحاً للنشرة ومتاحاً للمراجعة لاحقاً.
  try {
    await service.from('generated_designs').insert(prepared.map(entry => ({
      source: 'daily',
      title: entry.content.title,
      content: entry.content.caption,
      category: 'إضاءات أول سعودي',
      image_url: entry.designUrl,
      source_image_url: null,
    })))
  } catch {
    // يبقى مسار الجدولة مستقلاً عن السجل التحريري الإضافي.
  }

  await service.from('first1_education_batches').update({
    state: 'generated', scheduled_count: 0, updated_at: new Date().toISOString(),
  }).eq('batch_date', today)
  return { created: true, scheduledFor: [], itemIds: inserted.map(row => String(row.id)), titles: prepared.map(entry => entry.content.title) }
}

/** يعيد توزيع المنشورات التثقيفية المستقبلية فقط، من دون المساس بما نُشر فعلياً. */
export async function rebalanceScheduledFirst1Education(): Promise<{ rescheduled: number; scheduledFor: string[]; titles: string[] }> {
  const service = await createServiceRoleClient()
  const now = new Date()
  const { data: items, error: itemError } = await service
    .from('social_schedule')
    .select('id,post_title,tweets,design_image_url')
    .eq('source', FIRST1_EDUCATION_SOURCE)
    .eq('status', 'scheduled')
  if (itemError) throw new Error(`تعذّر قراءة المنشورات التثقيفية: ${itemError.message}`)

  const byContentAndDesign = new Map(
    (items ?? []).map(item => [`${item.tweets ?? ''}\u0000${item.design_image_url ?? ''}`, item]),
  )
  const { data: posts, error: postsError } = await service
    .from('postpulse_posts')
    .select('id,schedule_id,content,design_url,status,scheduled_for,accounts')
    .gte('scheduled_for', now.toISOString())
    .eq('status', 'scheduled')
  if (postsError) throw new Error(`تعذّر قراءة مواعيد PostPulse: ${postsError.message}`)

  const scheduled = (posts ?? [])
    .map(post => ({ post, item: byContentAndDesign.get(`${post.content ?? ''}\u0000${post.design_url ?? ''}`) }))
    .filter((entry): entry is { post: NonNullable<typeof posts>[number]; item: NonNullable<typeof items>[number] } => Boolean(entry.item && entry.post.schedule_id))
    .sort((a, b) => new Date(String(a.post.scheduled_for)).getTime() - new Date(String(b.post.scheduled_for)).getTime())
  if (!scheduled.length) return { rescheduled: 0, scheduledFor: [], titles: [] }

  // نحتفظ بآخر يوم تثقيفي نُشر، حتى لا تأتي أول جدولة جديدة في اليوم التالي له.
  const educationDesigns = new Set((items ?? []).map(item => String(item.design_image_url ?? '')).filter(Boolean))
  const { data: previousPosts, error: previousError } = await service
    .from('postpulse_posts')
    .select('design_url,status,scheduled_for')
    .lt('scheduled_for', now.toISOString())
  if (previousError) throw new Error(`تعذّر قراءة سجل النشر التثقيفي: ${previousError.message}`)
  const educationalDays = new Set(
    (previousPosts ?? [])
      .filter(post => educationDesigns.has(String(post.design_url ?? '')) && isActiveStatus(post.status))
      .map(post => riyadhDay(new Date(String(post.scheduled_for)))),
  )

  const cancelled: typeof scheduled = []
  for (const entry of scheduled) {
    try {
      await cancelScheduledPost(String(entry.post.schedule_id))
      await service.from('postpulse_posts').update({ status: 'cancelled' }).eq('id', entry.post.id)
      await service.from('social_schedule').update({ status: 'suggested' }).eq('id', entry.item.id)
      cancelled.push(entry)
    } catch (error) {
      throw new Error(`تعذّر إلغاء جدولة «${entry.item.post_title}»: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`)
    }
  }

  const { times: occupied } = await schedulingOccupancy()
  const scheduledFor: string[] = []
  const titles: string[] = []
  for (const entry of cancelled) {
    const slot = nextAvailableSlot(occupied, educationalDays)
    const media = await uploadMediaFromUrl(String(entry.item.design_image_url))
    const published = await publishNow({
      content: String(entry.item.tweets ?? ''),
      attachmentPaths: media.path ? [media.path] : [],
      accountIds: Array.isArray(entry.post.accounts) ? entry.post.accounts as number[] : undefined,
      scheduledTime: slot.toISOString(),
    })
    await service.from('postpulse_posts').insert({
      schedule_id: published.scheduleId,
      content: entry.item.tweets,
      design_url: entry.item.design_image_url,
      accounts: published.accountIds,
      status: 'scheduled',
      scheduled_for: slot.toISOString(),
      event_raw: published.result as object,
    })
    await service.from('social_schedule').update({ status: 'scheduled' }).eq('id', entry.item.id)
    occupied.push(slot.toISOString())
    educationalDays.add(riyadhDay(slot))
    scheduledFor.push(slot.toISOString())
    titles.push(String(entry.item.post_title))
  }
  return { rescheduled: cancelled.length, scheduledFor, titles }
}

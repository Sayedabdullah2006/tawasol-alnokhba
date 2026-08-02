import { OPENAI_MODEL } from '@/lib/ai-studio'
import { generateImageWithOpenAI } from '@/lib/image-generation'
import { compositeLogoBottomRight, resizeToPoster } from '@/lib/logo-overlay'
import { chatComplete, getOpenAI } from '@/lib/openai'
import { listScheduledPosts, publishNow, uploadMediaFromUrl } from '@/lib/postpulse'
import { createServiceRoleClient } from '@/lib/supabase-server'

export const FIRST1_EDUCATION_SOURCE = 'first1saudi-educational'

type EducationTopic = {
  id: string
  title: string
  category: string
  sourceUrl: string
  facts: string[]
  contentTags: string[]
}

type GeneratedEducation = {
  title: string
  caption: string
  infographicTitle: string
  infographicPoints: string[]
  visualDirection: string
  contentTags: string[]
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

const MAX_EDUCATIONAL_POSTS_PER_DAY = 1

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

async function generateCopy(topic: EducationTopic): Promise<GeneratedEducation> {
  const completion = await chatComplete(getOpenAI(), {
    model: OPENAI_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'أنت كاتب محتوى لحساب أول سعودي. اكتب منشوراً عربياً واحداً فقط، عملياً ومشوقاً ومفيداً للمبتكرين والمخترعين ورواد الأعمال في السعودية. اكتب بأسلوب عفوي ذكي بلهجة سعودية خفيفة ومفهومة، كأنك تفتح سالفة مفيدة مع شخص طموح؛ تجنب الفصحى الرسمية والتقريرية والعبارات المعلبة. ابدأ بخطاف قصير يثير الفضول، واجعل القارئ يشعر أن المعلومة تستحق الحفظ وإعادة النشر. حافظ على الدقة ولا تضف حقائق خارج المعطيات. ممنوع ذكر المصدر أو الرابط أو اسم الجهة داخل المنشور. لا تستخدم Markdown أو النجوم أو التعداد الشكلي. أعد JSON فقط بالمفاتيح: title, caption, infographicTitle, infographicPoints, visualDirection, contentTags. caption بين 55 و100 كلمة ومن دون أي هاشتاق. contentTags مصفوفة من هاشتاقين عربيين فقط، مرتبطين مباشرة بموضوع المنشور. لا تستخدم #First1Saudi. infographicPoints مصفوفة من 3 نقاط عربية قصيرة جداً.',
      },
      {
        role: 'user',
        content: `الموضوع: ${topic.title}\nالتصنيف: ${topic.category}\nالحقائق المسموح بها فقط:\n- ${topic.facts.join('\n- ')}`,
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

async function generateInfographic(content: GeneratedEducation): Promise<string> {
  const service = await createServiceRoleClient()
  const { data: brand } = await service.from('brand_settings').select('first1saudi_logo_url').eq('id', 1).single()
  if (!brand?.first1saudi_logo_url) throw new Error('أضف شعار أول سعودي من إعدادات الهوية أولاً')

  const prompt = [
    'Create one premium 4:5 Arabic social infographic for First1Saudi, 1080x1350.',
    'Make it an original, elegant editorial information design for Saudi innovators and inventors. Use deep teal, Saudi green accents, warm gold details, and generous but balanced visual hierarchy. Full bleed artwork, no white logo panel, no huge empty spaces, no copied social-post screenshot.',
    `Headline: ${content.infographicTitle}`,
    `Use exactly these three compact Arabic callouts, each visually distinct with a simple icon or data mark: ${content.infographicPoints.map((point, index) => `${index + 1}. ${point}`).join(' | ')}`,
    `Visual direction: ${content.visualDirection}.`,
    'Use symbolic innovation visuals such as a patent document, magnifier, prototype, blueprint, light path, or idea-to-market journey. Do not use people, flags, official seals, fake logos, sources, URLs, citations, or long paragraphs.',
    'Add a compact, elegant social footer with the recognizable icons for X, Instagram, LinkedIn, Facebook, and TikTok followed by the exact handle @First1Saudi. Keep the footer small and readable.',
    'Do not draw any brand logo. Reserve only a subtle compact safe zone at the extreme lower-right, about 150 by 100 pixels, clear of text and icons for the original First1Saudi logo overlay. It must blend with the artwork rather than look like an empty panel.',
  ].join('\n\n')
  const { b64 } = await generateImageWithOpenAI(prompt, [], { aspectRatio: '4:5' })
  const poster = await resizeToPoster(Buffer.from(b64, 'base64'))
  const { buffer } = await compositeLogoBottomRight(poster, brand.first1saudi_logo_url, { widthRatio: 0.1 })
  const path = `first1-education-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
  const { error } = await service.storage.from('content-images').upload(path, buffer, { contentType: 'image/png' })
  if (error) throw new Error(`تعذّر حفظ التصميم: ${error.message}`)
  return service.storage.from('content-images').getPublicUrl(path).data.publicUrl
}

/** معاينة غير منشورة: تنشئ نصاً وتصميماً واحداً من دون سجل أو جدولة. */
export async function previewFirst1Education(): Promise<{ title: string; caption: string; designUrl: string }> {
  const topic = topicForDay(riyadhDay())
  const content = await generateCopy(topic)
  return { title: content.title, caption: content.caption, designUrl: await generateInfographic(content) }
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
    if (educationalDays.has(dayKey) && MAX_EDUCATIONAL_POSTS_PER_DAY <= 1) continue
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
  if (existing && dayDistance(String(existing.batch_date), today) < 3) {
    return { created: false, scheduledFor: [], itemIds: [String(existing.id)], titles: [String(existing.post_title)] }
  }

  const topics = [0, 1, 2].map(offset => topicForDay(dayOffset(today, offset)))
  const prepared = await Promise.all(topics.map(async topic => {
    const content = await generateCopy(topic)
    return { topic, content, designUrl: await generateInfographic(content) }
  }))
  const { times: occupied, educationalDays } = await schedulingOccupancy()
  const slots = prepared.map(() => {
    const slot = nextAvailableSlot(occupied, educationalDays)
    occupied.push(slot.toISOString())
    educationalDays.add(riyadhDay(slot))
    return slot
  })
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
  if (insertError || !inserted?.length) throw new Error(`تعذّر حفظ دفعة المحتوى التثقيفي: ${insertError?.message ?? 'خطأ غير معروف'}`)

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

  const scheduledFor: string[] = []
  const failures: string[] = []
  for (const [index, entry] of prepared.entries()) {
    try {
      const media = await uploadMediaFromUrl(entry.designUrl)
      const published = await publishNow({ content: entry.content.caption, attachmentPaths: [media.path], scheduledTime: slots[index].toISOString() })
      await service.from('postpulse_posts').insert({
        schedule_id: published.scheduleId,
        content: entry.content.caption,
        design_url: entry.designUrl,
        accounts: published.accountIds,
        status: 'scheduled',
        scheduled_for: slots[index].toISOString(),
        event_raw: published.result as object,
      })
      await service.from('social_schedule').update({ status: 'scheduled' }).eq('id', inserted[index].id)
      scheduledFor.push(slots[index].toISOString())
    } catch {
      failures.push(entry.content.title)
    }
  }
  if (failures.length) {
    throw new Error(`تم حفظ دفعة المحتوى، لكن تعذّرت جدولة: ${failures.join('، ')}`)
  }
  return { created: true, scheduledFor, itemIds: inserted.map(row => String(row.id)), titles: prepared.map(entry => entry.content.title) }
}

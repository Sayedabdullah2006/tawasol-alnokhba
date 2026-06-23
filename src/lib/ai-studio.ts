/**
 * استوديو الذكاء الاصطناعي — طبقة منطق قابلة لإعادة الاستخدام (headless).
 *
 * استُخرجت من /api/admin/ai-studio لتُستدعى من مكانين:
 *   1) راوت الأدمن التفاعلي (خطوة بخطوة).
 *   2) المُنسّق اليومي /api/cron/daily-social (تشغيل كامل بلا تدخّل بشري).
 *
 * نفس البرومبتات (SYS_*) ونفس النماذج — لا يوجد سلوك مختلف عن الواجهة.
 */
import OpenAI from 'openai'
import sharp from 'sharp'
import { getOpenAI, SYS_ANALYZE, SYS_TWEETS, SYS_CONCEPTS, SYS_IMAGE, buildConceptDirectives } from './openai'
import { generateImageWithGemini, generateImageFromParts } from './gemini'
import { compositeLogoBottomRight, resizeToPoster } from './logo-overlay'
import { createServiceRoleClient } from './supabase-server'

export const OPENAI_MODEL = 'gpt-5.5'

/**
 * قفل الوجه — تعليمة قصوى تُحاط بموجّه Gemini لتقليل إعادة رسمه للوجه.
 * مكتوبة بالعربية والإنجليزية لأقصى التزام من النموذج.
 */
export const FACE_LOCK =
  '‼️🔒 ABSOLUTE TOP RULE (overrides everything): This is a PHOTO EDIT of the attached real photograph. ' +
  'COPY THE PERSON’S FACE FROM THE ATTACHED PHOTO EXACTLY, pixel-for-pixel — same bone structure, same eyes, nose, mouth, beard/eyebrows, skin tone, age and expression. ' +
  'DO NOT redraw, regenerate, beautify, age, slim, swap or replace the face. If you cannot preserve the exact face, output the original photo unchanged. ' +
  'Generating a new or different-looking person is STRICTLY FORBIDDEN. ' +
  'بالعربية: انسخ وجه الشخص من الصورة المرفقة كما هو حرفياً دون أي تغيير أو إعادة رسم؛ ممنوع توليد وجه/شخص مختلف منعاً باتاً.'

/**
 * توجيه تخطيط الفيديو — يُلحق فقط عند تفعيل "الخبر يتضمّن فيديو" في الاستوديو.
 * يُعيد هيكلة التصميم: مساحة فيديو أفقية كبيرة فارغة + صورة الشخص في إطار احترافي.
 */
export const VIDEO_LAYOUT =
  '=== 🎬 VIDEO LAYOUT OVERRIDE (أولوية قصوى — يُعيد هيكلة التخطيط) ===\n' +
  'هذا المنشور يتضمّن فيديو. أعِد هيكلة التكوين على النحو التالي مع الحفاظ على هوية First1Saudi والمقاس 1080×1350 (4:5):\n' +
  '1) خصّص «مساحة فيديو» مستطيلة أفقية كبيرة بنسبة 16:9 تمتد بعرض التصميم بالكامل في الجزء العلوي (تشغل تقريباً النصف العلوي). ' +
  'اتركها فارغة تماماً كحاوية انتظار: مستطيل بزوايا دائرية بلون تيل عميق (#0A2D35) بإطار ذهبي رفيع (#FFD700) وأيقونة تشغيل (مثلث Play) شفافة في وسطه. ' +
  '⛔ لا تضع أي صورة أو شخص أو نص داخل مساحة الفيديو — ستُملأ بفيديو لاحقاً. اجعلها عريضة وواضحة وبارزة.\n' +
  '2) ضع صورة الشخص الحقيقية (من الصورة المرفقة) في «إطار احترافي» أصغر (إطار بزوايا دائرية بحدود ذهبية رفيعة وظل ناعم) أسفل مساحة الفيديو أو إلى جانبها، مع الحفاظ على الوجه كما هو تماماً.\n' +
  '3) أسفل ذلك: الاسم وسطر الإنجاز ونقاط الحقائق + الفوتر المنحني مع @First1Saudi، كالمعتاد.\n' +
  'الأولوية للوضوح: مساحة الفيديو هي العنصر الأبرز، وصورة الشخص في إطار ثانوي.'

/**
 * توجيه "الصياغة الدائمة" — يُحقَن في الأتمتة (إعادة نشر الأرشيف) فقط.
 * يمنع أي إيحاء بأن الخبر حدثٌ آنيّ/عاجل، لأن الخبر قد يكون قديماً.
 */
export const EVERGREEN_NOTE =
  '‼️ مهم — صياغة دائمة (إعادة نشر): هذا المحتوى يُعاد نشره وقد يكون الخبر قديماً. ' +
  'اكتب بأسلوب دائم يُبرز الإنجاز كقيمة ومصدر فخر مستمر، ولا توحِ إطلاقاً بأنه حدثٌ وقع الآن أو خبرٌ عاجل. ' +
  'تجنّب تماماً كلمات الزمن الآني مثل: (اليوم، الآن، للتو، مؤخراً، أمس، هذا الأسبوع، حديثاً، أعلن اليوم، عاجل، خبر عاجل، تزامناً مع). ' +
  'لا تذكر تاريخاً أو فترة توحي بأن الحدث جديد. ركّز على الإنجاز نفسه وقيمته لا على توقيت وقوعه.'

/** إطار الحملة للتغريدات فقط — عبارة افتتاحية ثابتة + هاشتاق ثابت + إيموجي معبّرة. */
export const TWEET_CAMPAIGN_NOTE =
  'ابدأ كل تغريدة من التغريدات الثلاث بالعبارة الافتتاحية الثابتة في سطرها الأول: «فخرٌ سعودي لا يُنسى» ' +
  '(يجوز إيموجي واحد لائق قبلها مثل ❤️ أو 🇸🇦). ' +
  'وأضِف الهاشتاق الثابت #ذاكرة_الإنجاز ضمن هاشتاقات كل تغريدة، إلى جانب #First1Saudi و#اسم_الشخص. ' +
  '‼️ تجاوز قاعدة «إيموجي واحد كحد أقصى» المذكورة سابقاً: استخدم في كل تغريدة 3 إيموجي معبّرة على الأقل ' +
  '(وبحدٍّ أقصى نحو 4) ذات صلة بمضمون الإنجاز وموزّعة بما يخدم المعنى — دون إكثار أو حشو أو تكرار.'

export interface Concept {
  title?: string
  mood?: string
  brief?: string
}

/** يبني نص الخبر الموحّد الذي يُمرَّر لكل الخطوات (مع المعلومات الإضافية إن وُجدت). */
export function buildNewsText(args: { title?: string; content?: string; extraInfo?: string }): string {
  const extraInfoText =
    typeof args.extraInfo === 'string' && args.extraInfo.trim()
      ? `\n\nمعلومات إضافية من الأدمن (راعِها في التحليل والاتجاهات والتصميم):\n${args.extraInfo.trim()}`
      : ''
  return `العنوان: ${args.title ?? ''}\nالمحتوى: ${args.content ?? ''}${extraInfoText}`
}

/** الخطوة 1 — تحليل الخبر إلى JSON. */
export async function analyzeNews(
  openai: OpenAI,
  args: { newsText: string; sourceImages: string[] },
): Promise<unknown> {
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: 'text', text: args.newsText }]
  for (const img of args.sourceImages) userContent.push({ type: 'image_url', image_url: { url: img } })
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: SYS_ANALYZE }, { role: 'user', content: userContent }],
  })
  const raw = completion.choices[0]?.message?.content ?? '{}'
  try { return JSON.parse(raw) } catch { return { raw } }
}

/** الخطوة 2 — توليد 3 تغريدات (نص مرقّم). `extra` تعليمات إضافية اختيارية. */
export async function generateTweets(
  openai: OpenAI,
  args: { analysis: unknown; newsText: string; extra?: string },
): Promise<string> {
  const user =
    `${JSON.stringify(args.analysis)}\n\n${args.newsText}` +
    (args.extra ? `\n\n${args.extra}` : '')
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: SYS_TWEETS },
      { role: 'user', content: user },
    ],
  })
  return completion.choices[0]?.message?.content ?? ''
}

/** الخطوة 3 — اقتراح 3 اتجاهات تصميم. */
export async function generateConcepts(
  openai: OpenAI,
  args: { analysis: unknown; newsText: string; sourceImages: string[]; excludeTitles?: string[] },
): Promise<Concept[]> {
  // توجيهات التنويع: مجموعة عشوائية من عائلات الاتجاه + محاور التنويع + استبعاد السابق
  const directives = buildConceptDirectives({ exclude: args.excludeTitles })
  const conceptContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: `${JSON.stringify(args.analysis)}\n\n${args.newsText}\n\n${directives}` },
  ]
  for (const img of args.sourceImages) conceptContent.push({ type: 'image_url', image_url: { url: img } })
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: SYS_CONCEPTS }, { role: 'user', content: conceptContent }],
  })
  const raw = completion.choices[0]?.message?.content ?? '{}'
  try {
    const p = JSON.parse(raw)
    if (Array.isArray(p?.concepts)) return p.concepts
    if (Array.isArray(p)) return p
  } catch { /* تجاهل */ }
  return []
}

/** يحوّل اتجاهاً مختاراً إلى نص الموجّه (chosenConcept) المُمرَّر لخطوة الصورة. */
export function conceptToString(c: Concept | undefined): string {
  if (!c) return ''
  return [c.title, c.mood].filter(Boolean).join(' — ') + (c.brief ? `\n${c.brief}` : '')
}

/** الخطوة 4 — توليد التصميم عبر Gemini + تركيب اللوقو + الرفع إلى التخزين. */
export async function generateDesign(
  openai: OpenAI,
  args: { analysis: unknown; chosenConcept: string; sourceImages: string[]; note?: string; extra?: string; hasVideo?: boolean },
): Promise<{ imageUrl: string; prompt: string }> {
  const { analysis, chosenConcept, sourceImages, note, extra, hasVideo } = args
  const primarySource = sourceImages[0] ?? null

  const service = await createServiceRoleClient()
  const { data: brand } = await service.from('brand_settings').select('first1saudi_logo_url').eq('id', 1).single()
  const logoUrl: string | null = brand?.first1saudi_logo_url ?? null

  const promptCompletion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: SYS_IMAGE },
      {
        role: 'user',
        content:
          `بيانات الخبر (JSON):\n${JSON.stringify(analysis)}\n\n` +
          `الاتجاه المعتمد:\n${chosenConcept}\n\n` +
          (sourceImages.length > 1
            ? `الصور الحقيقية المرفقة (${sourceImages.length}) على الروابط التالية — ادمجها جميعاً بتكوين متناسق داخل التصميم الواحد مع الحفاظ على واقعيتها:\n${sourceImages.map((u, i) => `${i + 1}. ${u}`).join('\n')}\n`
            : `الصورة الحقيقية المرفقة هي على الرابط: ${primarySource}\n`) +
          `اترك مساحة فارغة أسفل يمين الفوتر للوقو (سيُضاف لاحقاً برمجياً) ولا ترسم أي شعار هناك.\n` +
          (hasVideo
            ? `\n‼️ هذا الخبر يتضمّن فيديو: صمّم التخطيط حول «مساحة فيديو أفقية كبيرة فارغة» (نسبة 16:9) في الجزء العلوي تُملأ لاحقاً، وضع صورة الشخص في «إطار احترافي» أصغر تحتها أو بجانبها. اترك مساحة الفيديو فارغة تماماً دون أي صورة بداخلها.\n`
            : '') +
          (note && note.trim()
            ? `\n‼️ ملاحظات الأدمن على التصميم (طبّقها بدقّة مع الحفاظ على ثوابت الهوية والصورة الحقيقية): ${note.trim()}\n`
            : '') +
          (extra && extra.trim() ? `\n${extra.trim()}\n` : ''),
      },
    ],
  })
  const designPrompt = promptCompletion.choices[0]?.message?.content ?? ''

  // قفل الوجه: يُحاط به موجّه Gemini من الطرفين (بداية ونهاية) لتقليل إعادة رسم الوجه.
  // عند وجود فيديو: نُلحق توجيه تخطيط الفيديو في النهاية (أولوية قصوى).
  const geminiPrompt = hasVideo
    ? `${FACE_LOCK}\n\n${designPrompt}\n\n${VIDEO_LAYOUT}\n\n${FACE_LOCK}`
    : `${FACE_LOCK}\n\n${designPrompt}\n\n${FACE_LOCK}`
  const { b64 } = await generateImageWithGemini(geminiPrompt, sourceImages)
  const rawImage = Buffer.from(b64, 'base64')
  const posterBase = await resizeToPoster(rawImage)
  const { buffer: finalImage, mimeType } = logoUrl
    ? await compositeLogoBottomRight(posterBase, logoUrl)
    : { buffer: posterBase, mimeType: 'image/png' }

  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png'
  const path = `studio-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error: upErr } = await service.storage.from('content-images').upload(path, finalImage, { contentType: mimeType })
  if (upErr) throw new Error(`فشل رفع الصورة: ${upErr.message}`)
  const { data: pub } = service.storage.from('content-images').getPublicUrl(path)

  return { imageUrl: pub.publicUrl, prompt: designPrompt }
}

export interface InfographicPerson { imageUrl: string; name: string; blurb: string }

export const INFOGRAPHIC_DIRECTIONS = [
  'شبكة بطاقات أنيقة بحواف ناعمة وظلال خفيفة',
  'أعمدة عمودية متناسقة بفواصل ذهبية',
  'تصميم دائري/مموّج عصري بعمق وتدرّجات',
]

/** يضيف رقماً دائرياً على زاوية صورة الشخص — مرساة ربط بصرية موثوقة للنموذج. */
async function badgePerson(url: string, n: number): Promise<{ mimeType: string; data: string }> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`تعذّر تحميل صورة الشخص ${n}`)
  const base = await sharp(Buffer.from(await resp.arrayBuffer())).resize(560, 560, { fit: 'cover' }).png().toBuffer()
  const badge = Buffer.from(
    `<svg width="560" height="560" xmlns="http://www.w3.org/2000/svg">
       <circle cx="70" cy="70" r="46" fill="#2D8B3F" stroke="#FFD700" stroke-width="5"/>
       <text x="70" y="70" font-size="56" font-family="Arial" font-weight="bold" fill="#ffffff"
             text-anchor="middle" dominant-baseline="central">${n}</text>
     </svg>`,
  )
  const out = await sharp(base).composite([{ input: badge, top: 0, left: 0 }]).png().toBuffer()
  return { mimeType: 'image/png', data: out.toString('base64') }
}

/**
 * يولّد إنفوجرافيك يعرض عدة أشخاص، كل شخص بصورته الحقيقية + اسمه ونبذته حرفياً.
 * ربط موثوق: كل صورة تحمل رقماً، والشخص رقم N يُكتب اسمه ونبذته بجانب الصورة ذات الرقم N.
 */
export async function generateInfographic(
  args: { title: string; people: InfographicPerson[]; extraInfo?: string; direction?: string },
): Promise<{ imageUrl: string; prompt: string }> {
  const { title, people, extraInfo } = args
  if (!people.length) throw new Error('أضِف صورة شخص واحدة على الأقل')
  const direction = args.direction || INFOGRAPHIC_DIRECTIONS[0]

  const service = await createServiceRoleClient()
  const { data: brand } = await service.from('brand_settings').select('first1saudi_logo_url').eq('id', 1).single()
  const logoUrl: string | null = brand?.first1saudi_logo_url ?? null

  // صور مرقّمة كمرساة ربط
  const refs = await Promise.all(people.map((p, i) => badgePerson(p.imageUrl, i + 1)))

  const peopleList = people
    .map((p, i) => `• الشخص رقم ${i + 1} (الصورة التي تحمل الرقم ${i + 1}): الاسم "${p.name}" — النبذة "${p.blurb}"`)
    .join('\n')

  const prompt = [
    `صمّم إنفوجرافيك عمودي احترافي بهوية First1Saudi يعرض ${people.length} أشخاص — الاتجاه الإبداعي لهذا التصميم: «${direction}».`,
    `العنوان الرئيسي أعلى التصميم: "${title || 'إنفوجرافيك'}".`,
    ``,
    `‼️ ربط إلزامي عبر الأرقام: كل صورة مرفقة عليها **رقم دائري** في زاويتها. ضع اسم ونبذة الشخص رقم N **بجانب/أسفل الصورة التي تحمل الرقم N نفسه حصراً**. لا تخلط بين الصور والأسماء إطلاقاً.`,
    `اكتب اسم كل شخص ونبذته **حرفياً كما وردا** بين علامتي الاقتباس.`,
    `⛔ استخدم الصور الحقيقية كما هي (نفس الوجه/الملامح)؛ لا تُولّد ولا تختلق وجوهاً، ولا تكتب نصاً غير الوارد أدناه.`,
    `‼️ لا تُظهر الأرقام الدائرية في التصميم النهائي — هي للربط فقط؛ أزِلها/أخفِها أو غطّها بالتصميم.`,
    ``,
    `الأشخاص:`,
    peopleList,
    ``,
    `الهوية: تيل عميق #0A2D35–#0D3D47 · أخضر سعودي #2D8B3F–#3A9B4F · ذهبي #FFD700 · أبيض. فوتر فيه أيقونات سوشال و"@First1Saudi".`,
    `اترك مساحة فارغة أسفل يمين الفوتر للوقو (يُضاف برمجياً) ولا ترسم شعاراً.`,
    `OUTPUT: عمودي 1080×1350، ultra-HD، نصوص عربية حادّة صحيحة الاتجاه (RTL)، بلا اختلاق نص ولا إيموجي.`,
    extraInfo && extraInfo.trim() ? `\nمعلومات إضافية تُراعى: ${extraInfo.trim()}` : '',
  ].filter(Boolean).join('\n')

  const geminiPrompt = `${FACE_LOCK}\n\n${prompt}\n\n${FACE_LOCK}`
  const { b64 } = await generateImageFromParts(geminiPrompt, refs)
  const rawImage = Buffer.from(b64, 'base64')
  const posterBase = await resizeToPoster(rawImage)
  const { buffer: finalImage, mimeType } = logoUrl
    ? await compositeLogoBottomRight(posterBase, logoUrl)
    : { buffer: posterBase, mimeType: 'image/png' }

  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png'
  const path = `infographic-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error: upErr } = await service.storage.from('content-images').upload(path, finalImage, { contentType: mimeType })
  if (upErr) throw new Error(`فشل رفع الصورة: ${upErr.message}`)
  const { data: pub } = service.storage.from('content-images').getPublicUrl(path)

  return { imageUrl: pub.publicUrl, prompt }
}

/**
 * يعيد استضافة صورة مصدر خارجية على تخزين Supabase ويُعيد رابطاً عاماً.
 *
 * ضروري للأخبار من first1saudi.net: تمرير روابطها مباشرةً إلى OpenAI/Gemini يفشل
 * لأن تلك الخدمات تحمّل الصورة من المصدر، وموقع الأخبار بطيء/يحجب التحميل الخارجي
 * ("400 Timeout while downloading ..."). برفعها إلى Supabase (CDN) تصبح سريعة وموثوقة.
 */
export async function rehostImage(url: string): Promise<string> {
  // إن كانت الصورة أصلاً على تخزيننا، لا داعي لإعادة الجلب من مصدر خارجي.
  const service = await createServiceRoleClient()

  // إعادة محاولة للتعامل مع تقطّع المصدر (خاصة first1saudi.net).
  let resp: Response | null = null
  let lastErr = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController()
      const to = setTimeout(() => ctrl.abort(), 20000)
      resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: ctrl.signal })
      clearTimeout(to)
      if (resp.ok) break
      lastErr = `${resp.status}`
      resp = null
    } catch (e) {
      lastErr = e instanceof Error ? e.message : 'خطأ شبكة'
      resp = null
    }
  }
  if (!resp) throw new Error(`تعذّر تحميل صورة المصدر — قد يكون الموقع المصدر غير متاح مؤقتاً (${lastErr})`)
  const mime = resp.headers.get('content-type') || 'image/jpeg'
  const buf = Buffer.from(await resp.arrayBuffer())
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
  const path = `studio-src-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await service.storage.from('content-images').upload(path, buf, { contentType: mime })
  if (error) throw new Error(`فشل رفع صورة المصدر: ${error.message}`)
  return service.storage.from('content-images').getPublicUrl(path).data.publicUrl
}

export interface StudioResult {
  analysis: unknown
  tweets: string
  concepts: Concept[]
  chosenConcept: string
  imageUrl: string
  prompt: string
  sourceImages: string[] // صور المصدر بعد إعادة استضافتها على Supabase (روابط دائمة)
}

/**
 * تشغيل كامل للأربع خطوات بلا تدخّل بشري (للمُنسّق اليومي).
 * يختار تلقائياً الاتجاه الأول من المفاهيم المقترحة.
 */
export async function runStudioPipeline(input: {
  title?: string
  content?: string
  sourceImages: string[]
  extraInfo?: string
  note?: string
}): Promise<StudioResult> {
  if (!input.sourceImages?.length) throw new Error('لا توجد صورة مصدر للخبر')
  const openai = getOpenAI()
  const newsText = buildNewsText(input)

  // أعِد استضافة الصور الخارجية على Supabase أولاً (تجنّب فشل تحميل OpenAI/Gemini).
  const sourceImages = await Promise.all(input.sourceImages.map(rehostImage))

  const analysis = await analyzeNews(openai, { newsText, sourceImages })
  const tweets = await generateTweets(openai, {
    analysis,
    newsText,
    extra: `${EVERGREEN_NOTE}\n\n${TWEET_CAMPAIGN_NOTE}`,
  })
  const concepts = await generateConcepts(openai, { analysis, newsText, sourceImages })
  const chosenConcept = conceptToString(concepts[0])
  const { imageUrl, prompt } = await generateDesign(openai, {
    analysis,
    chosenConcept,
    sourceImages,
    note: input.note,
    extra: EVERGREEN_NOTE,
  })

  return { analysis, tweets, concepts, chosenConcept, imageUrl, prompt, sourceImages }
}

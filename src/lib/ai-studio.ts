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
import { STUDIO_BRAND_RULES, STUDIO_LOGO_RESERVATION, STUDIO_DESIGN_DIRECTIONS } from './studio-design-guidelines'
import sharp from 'sharp'
import { getOpenAI, chatComplete, SYS_ANALYZE, SYS_TWEETS, SYS_CONCEPTS, buildConceptDirectives, buildTweetDirectives } from './openai'
import { generateImageWithOpenAI, generateImageFromPartsWithOpenAI } from './image-generation'
import { compositeLogoBottomRight, resizeToPoster } from './logo-overlay'
import { createServiceRoleClient } from './supabase-server'
import { selectEditorialTemplate } from './editorial-template-selector'
import { greetingCopyFromNewsText } from './studio-print-copy'
import { buildCompactImagePrompt, videoLayoutFor, type VideoOrientation } from './studio-image-prompt'
export { buildCompactImagePrompt, videoLayoutFor, type VideoOrientation } from './studio-image-prompt'

export const OPENAI_MODEL = 'gpt-5.5'

/**
 * قفل الصورة المرجعية — تعليمة تحفظ اللقطة الأصلية داخل التكوين التحريري.
 * مكتوبة بالعربية والإنجليزية كي يتكيّف القالب مع الصورة بدلاً من إعادة رسمها.
 */
export const FACE_LOCK =
  'REFERENCE PHOTO RULE: treat each attached photo as an intact documentary photograph. ' +
  'Keep any person, clothing, pose, and scene from the supplied photograph unchanged; do not redraw, restyle, replace, or synthesize a person. ' +
  'Build the editorial layout around the photo using its natural crop and negative space. Keep text and graphics away from the face, hands, and important clothing. ' +
  'بالعربية: استخدم الصورة المرجعية كما هي كلقطة وثائقية حقيقية، ولا تعِد رسم الشخص أو تغيّر ملامحه أو ملابسه أو وضعيته؛ ابنِ التصميم حولها، ولا تحشر الصورة بين النصوص أو تضع النص فوق الوجه أو الجسد.'

/**
 * توجيه "الصياغة الدائمة" — يُحقَن في الأتمتة (إعادة نشر الأرشيف) فقط.
 * يمنع أي إيحاء بأن الخبر حدثٌ آنيّ/عاجل، لأن الخبر قد يكون قديماً.
 */
export const EVERGREEN_NOTE =
  '‼️ مهم — صياغة دائمة (إعادة نشر): هذا المحتوى يُعاد نشره وقد يكون الخبر قديماً. ' +
  'اكتب بأسلوب دائم يُبرز الإنجاز كقيمة ومصدر فخر مستمر، ولا توحِ إطلاقاً بأنه حدثٌ وقع الآن أو خبرٌ عاجل. ' +
  'تجنّب تماماً كلمات الزمن الآني مثل: (اليوم، الآن، للتو، مؤخراً، أمس، هذا الأسبوع، حديثاً، أعلن اليوم، عاجل، خبر عاجل، تزامناً مع). ' +
  'لا تذكر تاريخاً أو فترة توحي بأن الحدث جديد. ركّز على الإنجاز نفسه وقيمته لا على توقيت وقوعه.'

/** إطار الحملة للتغريدات فقط — روح فخر سعودي + هاشتاق ثابت + إيموجي، بمطالع متنوّعة (لا عبارة افتتاح واحدة متكرّرة). */
export const TWEET_CAMPAIGN_NOTE =
  'أضِف روح الفخر السعودي في كل تغريدة لكن بصياغة مختلفة في كل مرة — ‼️ لا تبدأ التغريدات بعبارة افتتاحية واحدة ثابتة تتكرّر (تجنّب تكرار مطلع مثل «فخرٌ سعودي لا يُنسى» في كل توليد). ' +
  'أدرِج الهاشتاق الثابت #ذاكرة_الإنجاز ضمن هاشتاقات كل تغريدة، إلى جانب #First1Saudi و#اسم_الشخص. ' +
  '‼️ تجاوز قاعدة «إيموجي واحد كحد أقصى»: استخدم في كل تغريدة 3 إيموجي معبّرة على الأقل ' +
  '(وبحدٍّ أقصى نحو 4) ذات صلة بمضمون الإنجاز وموزّعة بما يخدم المعنى — دون إكثار أو حشو أو تكرار.'

export interface Concept {
  title?: string
  mood?: string
  brief?: string
  /** A complete image-model prompt prepared once with the three concepts. */
  imagePrompt?: string
}

const REQUIRED_STUDIO_CONCEPTS: Array<Required<Omit<Concept, 'imagePrompt'>>> = STUDIO_DESIGN_DIRECTIONS

function requireThreeConcepts(value: unknown): Concept[] {
  const supplied: Concept[] = Array.isArray(value)
    ? value
      .filter((entry): entry is Concept => Boolean(entry) && typeof entry === 'object')
      .map(entry => ({
        title: typeof entry.title === 'string' ? entry.title.trim() : '',
        mood: typeof entry.mood === 'string' ? entry.mood.trim() : '',
        brief: typeof entry.brief === 'string' ? entry.brief.trim() : '',
        imagePrompt: typeof entry.imagePrompt === 'string' ? entry.imagePrompt.trim() : '',
      }))
      .filter(entry => entry.title || entry.brief)
      .slice(0, 3)
    : []

  const normalizedTitle = (title?: string) => title?.toLocaleLowerCase('ar-SA') ?? ''
  const titles = new Set(supplied.map(entry => normalizedTitle(entry.title)).filter(Boolean))
  for (const fallback of REQUIRED_STUDIO_CONCEPTS) {
    if (supplied.length === 3) break
    const fallbackTitle = normalizedTitle(fallback.title)
    if (!titles.has(fallbackTitle)) {
      supplied.push(fallback)
      titles.add(fallbackTitle)
    }
  }
  return supplied.slice(0, 3)
}

export async function prepareConceptImagePrompts(
  openai: OpenAI,
  args: { analysis: unknown; concepts: Concept[]; sourceImageCount: number; hasVideo?: boolean; videoOrientation?: VideoOrientation },
): Promise<Concept[]> {
  // لا نخزن برومبتات تحرير الصور الطويلة مع الاتجاهات. كانت البرومبتات القديمة
  // تطلب تغييرات حساسة على الأشخاص، فتُرفض فوراً من نموذج الصور عند إعادة الاستخدام.
  // يُبنى برومبت قصير وآمن وقت التوليد من الحقائق والاتجاه المختار.
  void openai
  void args.analysis
  void args.sourceImageCount
  void args.hasVideo
  void args.videoOrientation
  return requireThreeConcepts(args.concepts).map(concept => ({
    title: concept.title,
    mood: concept.mood,
    brief: concept.brief,
  }))
}

/**
 * أنماط تصميم متمايزة — تُوزَّع على منشورات الدفعة اليومية (نمط مختلف لكل منشور)
 * لضمان تنوّع بصري واضح بدل نمط واحد متكرّر، مع الحفاظ على ثوابت هوية First1Saudi.
 */
export const POSTER_STYLES: string[] = STUDIO_DESIGN_DIRECTIONS.map(direction => `${direction.title}: ${direction.brief}`)

/** يخلط أنماط التصميم ويعيدها (لتوزيع نمط مختلف على كل منشور في الدفعة). */
export function shuffledPosterStyles(): string[] {
  return [...POSTER_STYLES].sort(() => Math.random() - 0.5)
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
  const completion = await chatComplete(openai, {
    model: OPENAI_MODEL,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: SYS_ANALYZE }, { role: 'user', content: userContent }],
  })
  const raw = completion.choices[0]?.message?.content ?? '{}'
  const posterCopy = greetingCopyFromNewsText(args.newsText)
  try {
    const analysis = JSON.parse(raw)
    return posterCopy && analysis && typeof analysis === 'object'
      ? { ...analysis, poster_copy: posterCopy }
      : analysis
  } catch { return { raw, ...(posterCopy ? { poster_copy: posterCopy } : {}) } }
}

/** الخطوة 2 — توليد 3 تغريدات (نص مرقّم). `extra` تعليمات إضافية اختيارية. */
export async function generateTweets(
  openai: OpenAI,
  args: { analysis: unknown; newsText: string; extra?: string },
): Promise<string> {
  const user =
    `${JSON.stringify(args.analysis)}\n\n${args.newsText}\n\n${buildTweetDirectives()}` +
    (args.extra ? `\n\n${args.extra}` : '')
  const completion = await chatComplete(openai, {
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
  args: { analysis: unknown; newsText: string; sourceImages: string[]; excludeTitles?: string[]; hasVideo?: boolean; videoOrientation?: VideoOrientation },
): Promise<Concept[]> {
  // توجيهات التنويع: مجموعة عشوائية من عائلات الاتجاه + محاور التنويع + استبعاد السابق
  const directives = buildConceptDirectives({ exclude: args.excludeTitles })
  const conceptContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: `${JSON.stringify(args.analysis)}\n\n${args.newsText}\n\n${directives}` },
  ]
  for (const img of args.sourceImages) conceptContent.push({ type: 'image_url', image_url: { url: img } })
  const completion = await chatComplete(openai, {
    model: OPENAI_MODEL,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: SYS_CONCEPTS }, { role: 'user', content: conceptContent }],
  })
  const raw = completion.choices[0]?.message?.content ?? '{}'
  try {
    const p = JSON.parse(raw)
    if (Array.isArray(p?.concepts)) {
      return prepareConceptImagePrompts(openai, {
        analysis: args.analysis, concepts: requireThreeConcepts(p.concepts), sourceImageCount: args.sourceImages.length, hasVideo: args.hasVideo, videoOrientation: args.videoOrientation,
      })
    }
    if (Array.isArray(p)) {
      return prepareConceptImagePrompts(openai, {
        analysis: args.analysis, concepts: requireThreeConcepts(p), sourceImageCount: args.sourceImages.length, hasVideo: args.hasVideo, videoOrientation: args.videoOrientation,
      })
    }
  } catch { /* تجاهل */ }
  return prepareConceptImagePrompts(openai, {
    analysis: args.analysis, concepts: requireThreeConcepts([]), sourceImageCount: args.sourceImages.length, hasVideo: args.hasVideo, videoOrientation: args.videoOrientation,
  })
}

/** يحوّل اتجاهاً مختاراً إلى نص الموجّه (chosenConcept) المُمرَّر لخطوة الصورة. */
export function conceptToString(c: Concept | undefined): string {
  if (!c) return ''
  return [c.title, c.mood].filter(Boolean).join(' — ') + (c.brief ? `\n${c.brief}` : '')
}

/** Keeps a moderation retry faithful to the selected studio direction instead of using a generic poster. */
export function buildStudioSafetyFallbackPrompt(args: { analysis: unknown; chosenConcept: string; sourceText?: string; hasVideo?: boolean; videoOrientation?: VideoOrientation }): string {
  return buildCompactImagePrompt(args)
}


/** الخطوة 4 — توليد التصميم عبر OpenAI Images + تركيب اللوقو + الرفع إلى التخزين. */
export async function generateDesign(
  openai: OpenAI,
  args: { analysis: unknown; chosenConcept: string; sourceImages: string[]; sourceText?: string; note?: string; extra?: string; hasVideo?: boolean; videoOrientation?: VideoOrientation; preparedPrompt?: string },
): Promise<{ imageUrl: string; prompt: string }> {
  const { analysis, chosenConcept, sourceImages, note, extra, hasVideo, videoOrientation, preparedPrompt } = args

  const service = await createServiceRoleClient()
  const { data: brand } = await service.from('brand_settings').select('first1saudi_logo_url').eq('id', 1).single()
  const logoUrl: string | null = brand?.first1saudi_logo_url ?? null

  const templateDirective = await selectEditorialTemplate({
    sourceImageUrls: sourceImages,
    variantKey: `${chosenConcept}:${note ?? ''}`,
  })
  // لا نعيد استخدام برومبتات قديمة محفوظة مع المفهوم، لأنها قد تحتوي أوامر
  // تحرير حساسة على الصورة المرجعية. نستخلص فقط الحقائق والاتجاه الآمن الحالي.
  void openai
  void preparedPrompt
  const designPrompt = buildCompactImagePrompt({ analysis, chosenConcept, sourceText: args.sourceText, note, extra, hasVideo, videoOrientation, templateDirective })

  // قفل الصورة: يُحاط به موجّه الصورة من الطرفين حتى يبني النموذج القالب حول اللقطة الحقيقية.
  // عند وجود فيديو: نُلحق توجيه تخطيط الفيديو في النهاية (أولوية قصوى).
  const imagePrompt = hasVideo
    ? `${FACE_LOCK}\n\n${designPrompt}\n\n${videoLayoutFor(videoOrientation)}\n\n${FACE_LOCK}`
    : `${FACE_LOCK}\n\n${designPrompt}\n\n${FACE_LOCK}`
  const { b64 } = await generateImageWithOpenAI(imagePrompt, sourceImages, {
    quality: 'high',
    safetyFallbackPrompt: buildStudioSafetyFallbackPrompt({ analysis, chosenConcept, sourceText: args.sourceText, hasVideo, videoOrientation }),
  })
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

/**
 * تعديل دقيق لتصميم جاهز: يأخذ صورة التصميم النهائي ويطبّق التعديل المطلوب فقط
 * (حذف/إضافة كلمة، حذف عنصر…) مع إبقاء نفس التصميم والصورة والتخطيط تماماً — بلا
 * إعادة توليد من معطيات الطلب. لا يُعيد تركيب الشعار (موجود أصلاً داخل الصورة).
 */
export async function editDesign(args: { designImageUrl: string; note: string; exactText?: string; referenceImageUrls?: string[]; preserveEdits?: string[] }): Promise<{ imageUrl: string }> {
  const { designImageUrl, note, exactText = '', referenceImageUrls = [], preserveEdits = [] } = args
  if (!designImageUrl) throw new Error('لا يوجد تصميم للتعديل')
  if (!note.trim()) throw new Error('اكتب التعديل المطلوب')
  const service = await createServiceRoleClient()

  const prompt =
    'EDIT the attached social-media design image (this is an image-editing task, not generation).\n' +
    '‼️ APPLY THIS CHANGE NOW — it MUST be clearly and visibly applied to the image: ' + note.trim() + '\n' +
    'بالعربية — نفّذ هذا التعديل على الصورة المرفقة فوراً بحيث يظهر واضحاً: ' + note.trim() + '\n\n' +
    (exactText.trim() ? `EXACT NEW TEXT — Add this exact Arabic phrase in a small, readable line without changing any existing text: "${exactText.trim()}". Copy every character exactly as supplied, with correct connected RTL Arabic shaping. Do not invent, shorten, translate, spell-correct, or alter it.\n` : '') +
    'TEXT LOCK — Treat every visible Arabic and English word, number, date, hashtag, handle, logo, and typographic treatment in the current design as immutable, pixel-accurate content. Do not redraw, retype, translate, paraphrase, spell-correct, move, crop, remove, reflow, or alter any existing text, even by one letter. The only permitted text addition is the exact phrase supplied in the EXACT NEW TEXT instruction.\n' +
    'Then keep the REST of the design as close to the original as possible: same overall layout, same background and colors, ' +
    'the same person/photo and face (do not change or regenerate the person), the same footer/logo, and the same other text. ' +
    (preserveEdits.length
      ? `These are earlier completed edits. They are mandatory requirements that must remain visibly present; never remove, replace, or weaken them while applying the new edit: ${preserveEdits.map((entry, index) => `${index + 1}. ${entry}`).join(' | ')}. `
      : '') +
    (referenceImageUrls.length
      ? `The ${referenceImageUrls.length} additional attached image(s) are the mandatory replacement visual source(s). Replace or integrate the requested photo content from them while preserving every depicted person's exact facial identity, features, skin tone, body proportions, clothing, accessories, and appearance. Never alter, beautify, restyle, or invent their face, body, or clothes. Keep the purple Mawhiba calligraphy logo and every white letter within it completely intact; do not crop, erase, translate, or regenerate any part of either campaign logo. `
      : '') +
    'Only modify what the requested change requires — but DO make that change; do not return the image unchanged.\n' +
    'Do not add any new words inside or underneath the original logo area. Preserve the existing logo as supplied. Render Arabic text crisp and correctly shaped (RTL). Output the edited design as a portrait 1080×1350 (4:5) ultra-HD image.'

  const { b64 } = await generateImageWithOpenAI(prompt, [designImageUrl, ...referenceImageUrls], { allowSafetyFallback: false })
  const posterBase = await resizeToPoster(Buffer.from(b64, 'base64'))
  const path = `studio-edit-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
  const { error } = await service.storage.from('content-images').upload(path, posterBase, { contentType: 'image/png' })
  if (error) throw new Error(`فشل رفع الصورة: ${error.message}`)
  return { imageUrl: service.storage.from('content-images').getPublicUrl(path).data.publicUrl }
}

export interface InfographicPerson { imageUrl: string; name: string; blurb: string }

export const INFOGRAPHIC_DIRECTIONS = [
  'الاحتفالي الكلاسيكي: بطاقات أشخاص متوازنة بإطارات ذهبية وأسماء كاملة وخلفية زمردية مرتبطة بالمجال',
  'الدرامي الحماسي: بطاقات صور حقيقية بحضور أكبر وإضاءة ذهبية سينمائية دون تغيير الوجوه أو ترتيب الأشخاص',
  'الأنيق المختصر: شبكة أشخاص هادئة بمساحات سالبة وتايبوغرافي راقٍ وزخارف قليلة',
]

/** يضيف رقماً دائرياً على زاوية صورة الشخص — مرساة ربط بصرية موثوقة للنموذج. */
async function badgePerson(url: string, n: number): Promise<{ mimeType: string; data: string }> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`تعذّر تحميل صورة الشخص ${n}`)
  const base = await sharp(Buffer.from(await resp.arrayBuffer())).resize(560, 560, { fit: 'cover' }).png().toBuffer()
  const badge = Buffer.from(
    `<svg width="560" height="560" xmlns="http://www.w3.org/2000/svg">
       <circle cx="78" cy="78" r="60" fill="#2D8B3F" stroke="#FFD700" stroke-width="6"/>
       <text x="78" y="78" font-size="72" font-family="Arial" font-weight="bold" fill="#ffffff"
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
    `‼️ استخدم كل صورة **مرّة واحدة فقط** بعدد ${people.length} بطاقة — لا تكرّر أي شخص أو صورة، ولا تدمج شخصين، ولا تُسقط أحداً. رتّبهم بترتيب الأرقام.`,
    `اكتب اسم كل شخص ونبذته **حرفياً كما وردا** بين علامتي الاقتباس.`,
    `⛔ استخدم الصور الحقيقية كما هي (نفس الوجه/الملامح)؛ لا تُولّد ولا تختلق وجوهاً، ولا تكتب نصاً غير الوارد أدناه.`,
    `‼️ لا تُظهر الأرقام الدائرية في التصميم النهائي — هي للربط فقط؛ غطِّها بإطار البطاقة أو احذفها.`,
    ``,
    `الأشخاص:`,
    peopleList,
    ``,
    STUDIO_BRAND_RULES,
    STUDIO_LOGO_RESERVATION,
    `‼️ لا ترسم أي مربّع أبيض أو إطار فارغ للشعار في الزوايا — الشعار يُضاف برمجياً فوق التصميم، فاجعل الخلفية ممتدّة بلا فراغات بيضاء.`,
    `OUTPUT: عمودي 1080×1350، ultra-HD، نصوص عربية حادّة صحيحة الاتجاه (RTL)، بلا اختلاق نص ولا إيموجي.`,
    extraInfo && extraInfo.trim() ? `\nمعلومات إضافية تُراعى: ${extraInfo.trim()}` : '',
  ].filter(Boolean).join('\n')

  const imagePrompt = `${FACE_LOCK}\n\n${prompt}\n\n${FACE_LOCK}`
  const safetyFallbackPrompt = [
    'Create a premium 4:5 Arabic editorial infographic for First1Saudi about an accomplished Saudi figure or group.',
    `Headline: ${title.slice(0, 220)}.`,
    `Use these verified concise facts as callouts: ${people.map(person => `${person.name}: ${person.blurb}`).join(' | ')}`,
    `Creative direction: ${direction.slice(0, 1800)}.`,
    'Preserve every supplied reference person exactly in face, identity, body, clothing, apparent age, and hairstyle. Integrate them into the composition rather than producing a plain portrait.',
    'Use strict RTL Arabic hierarchy.',
    STUDIO_BRAND_RULES,
    STUDIO_LOGO_RESERVATION,
    'Full-bleed artwork only, no white panel, no frame, no invented claims, flags, weapons, political or military imagery.',
  ].join('\n\n')
  const { b64 } = await generateImageFromPartsWithOpenAI(imagePrompt, refs, { safetyFallbackPrompt })
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
 * ضروري للأخبار من first1saudi.net: تمرير روابطها مباشرةً إلى نماذج الصور يفشل
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
  styleDirective?: string // نمط تصميم إلزامي لهذا المنشور (لتنويع الدفعة)
}): Promise<StudioResult> {
  const openai = getOpenAI()
  const newsText = buildNewsText(input)

  // أعِد استضافة الصور الخارجية على Supabase أولاً (تجنّب فشل تحميل نماذج الصور لها).
  const sourceImages = await Promise.all(input.sourceImages.map(rehostImage))

  const analysis = await analyzeNews(openai, { newsText, sourceImages })
  const tweets = await generateTweets(openai, {
    analysis,
    newsText,
    extra: `${EVERGREEN_NOTE}\n\n${TWEET_CAMPAIGN_NOTE}`,
  })
  const concepts = await generateConcepts(openai, { analysis, newsText, sourceImages })
  const chosenConcept = conceptToString(concepts[0])
  // نمط إلزامي لهذا المنشور (إن مُرِّر) — يضمن تمايزاً بصرياً واضحاً بين منشورات الدفعة.
  const styleNote = input.styleDirective
    ? `‼️ نمط التصميم الإلزامي لهذا المنشور: ${input.styleDirective}\n` +
      `اجعل التخطيط والمعالجة البصرية متمايزة بوضوح بهذا النمط تحديداً، مع الحفاظ على التسلسل المعتمد والهوية ومساحات الأصول الرقمية والصورة الحقيقية.`
    : ''
  const { imageUrl, prompt } = await generateDesign(openai, {
    analysis,
    chosenConcept,
    sourceImages,
    sourceText: newsText,
    note: input.note,
    extra: [EVERGREEN_NOTE, styleNote].filter(Boolean).join('\n\n'),
    preparedPrompt: concepts[0]?.imagePrompt,
  })

  return { analysis, tweets, concepts, chosenConcept, imageUrl, prompt, sourceImages }
}

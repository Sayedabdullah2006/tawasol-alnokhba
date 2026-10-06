import OpenAI from 'openai'
import https from 'https'
import { STUDIO_BRAND_RULES, STUDIO_LOGO_RESERVATION, STUDIO_NEWS_LAYOUT_RULES, STUDIO_DESIGN_DIRECTIONS } from './studio-design-guidelines'

/**
 * Returns a configured OpenAI client.
 * Reads the API key from process.env.OPENAI_API_KEY ONLY.
 * Throws a clear Arabic error if the key is missing.
 *
 * ملاحظة: النشر الفعلي لطلبات chat يتم عبر chatComplete (باستخدام وحدة https المدمجة)
 * لتجاوز علّة undici/fetch على Node 22 («Premature close»). هذا العميل يُستخدم لقراءة
 * baseURL فقط ولأي استدعاءات SDK أخرى.
 */
export function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('مفتاح OpenAI غير مهيّأ')
  }
  return new OpenAI({ apiKey, maxRetries: 3, timeout: 120_000 })
}

// أنماط أخطاء عابرة تستحق إعادة المحاولة (انقطاع اتصال/قراءة جسم/شبكة/مهلة).
function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const status = (err as { status?: number })?.status ?? 0
  return (
    /premature close|terminated|ECONNRESET|socket hang up|network|fetch failed|invalid response body|other side closed|timeout|aborted|EPIPE|ETIMEDOUT|ECONNREFUSED/i.test(msg) ||
    status === 408 || status === 409 || status === 429 || status >= 500
  )
}

// وكيل بلا keep-alive: اتصال جديد لكل طلب — يزيل إعادة استخدام السوكِت البائت
// المسبِّبة لـ «Premature close» في undici على Node 22 (نفس مبدأ حلّ axios).
const OA_AGENT = new https.Agent({ keepAlive: false })

// استدعاء واحد للـ REST مباشرةً عبر وحدة https (لا undici/fetch).
function postChatOnce(
  apiKey: string,
  baseURL: string,
  params: unknown,
  timeoutMs: number,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(params), 'utf8')
    const url = new URL(`${baseURL.replace(/\/$/, '')}/chat/completions`)
    const org = process.env.OPENAI_ORG_ID || process.env.OPENAI_ORGANIZATION
    const project = process.env.OPENAI_PROJECT_ID
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': String(body.length),
      Authorization: `Bearer ${apiKey}`,
    }
    if (org) headers['OpenAI-Organization'] = org
    if (project) headers['OpenAI-Project'] = project

    const req = https.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        agent: OA_AGENT,
        headers,
        timeout: timeoutMs,
      },
      res => {
        const chunks: Buffer[] = []
        res.on('data', c => chunks.push(c as Buffer))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          const status = res.statusCode ?? 0
          if (status < 200 || status >= 300) {
            const e = new Error(`OpenAI ${status}: ${text.slice(0, 500)}`) as Error & { status?: number }
            e.status = status
            return reject(e)
          }
          try {
            resolve(JSON.parse(text) as OpenAI.Chat.Completions.ChatCompletion)
          } catch {
            reject(new Error('invalid response body from OpenAI (JSON parse failed)'))
          }
        })
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    req.on('timeout', () => req.destroy(new Error('OpenAI request timeout')))
    req.write(body)
    req.end()
  })
}

/**
 * ينفّذ chat.completions عبر https المدمجة (بدل undici/fetch في الـ SDK) مع إعادة
 * محاولة على الأخطاء العابرة — يعالج «Premature close» على Node 22 نهائياً.
 * التوقيع نفسه (يستقبل عميل openai لقراءة baseURL) فلا تتغيّر مواضع الاستدعاء.
 */
export async function chatComplete(
  openai: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('مفتاح OpenAI غير مهيّأ')
  const baseURL = (openai.baseURL || 'https://api.openai.com/v1').toString()
  const retries = opts.retries ?? 4
  const timeoutMs = opts.timeoutMs ?? 120_000

  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await postChatOnce(apiKey, baseURL, params, timeoutMs)
    } catch (err) {
      lastErr = err
      if (attempt === retries || !isTransient(err)) break
      const waitMs = Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 400)
      await new Promise(r => setTimeout(r, waitMs))
    }
  }
  throw lastErr
}

// ── تنويع مطالع التغريدات ───────────────────────────────────────────
// أساليب مطلع متنوّعة تُخلط عشوائياً كل توليد لتجنّب تشابه بدايات التغريدات.
export const TWEET_OPENER_STYLES: string[] = [
  'سؤال مباشر يستفزّ فضول القارئ',
  'رقم أو إحصائية لافتة في الكلمات الأولى',
  'مفارقة أو تباين (من ... إلى ...)',
  'مشهد للحظة الإنجاز بأسلوب سردي حيّ',
  'نداء مباشر للقارئ (تخيّل/هل تعلم/تخيّلوا)',
  'اقتباس أو جملة على لسان صاحب الإنجاز',
  'حقيقة تاريخية (لأول مرة/منذ عقود/في سابقة)',
  'مقارنة عالمية تضع الإنجاز بين الكبار',
  'تشويق وغموض ثم كشف الإنجاز',
  'تصريح فخر مكثّف بضربة واحدة قوية',
  'تهنئة واحتفاء مباشر دافئ',
  'خطاف طموح يربط الإنجاز بالمستقبل',
]

/** توجيه إلزامي لتنويع مطالع التغريدات الثلاث (يُلحق بمحتوى المستخدم عند توليد التغريدات). */
export function buildTweetDirectives(): string {
  const pool = [...TWEET_OPENER_STYLES].sort(() => Math.random() - 0.5).slice(0, 6)
  return [
    '‼️ تنويع إلزامي لمطالع التغريدات:',
    `- لكل تغريدة من الثلاث مطلعٌ مختلف تماماً بأسلوب مختلف من هذه الأساليب: ${pool.join(' · ')}.`,
    '- لا تبدأ تغريدتين بالأسلوب أو الصياغة نفسها، ولا تستخدم عبارة افتتاح ثابتة تتكرّر في كل مرة.',
    '- غيّر بنية الجملة الأولى وإيقاعها في كل توليد حتى لنفس الخبر — اجعل المطالع طازجة ومتنوّعة.',
  ].join('\n')
}

// ── SHARED SYSTEM PROMPTS ─────────────────

/** الخطوة الأولى - محلل الخبر */
export const SYS_ANALYZE = `أنت محلّل أخبار لحساب "First1Saudi" المتخصص في إبراز الإنجازات السعودية.
مهمتك: قراءة الخبر المُدخل واستخراج عناصره في صيغة JSON دقيقة، دون اختلاق أي معلومة غير موجودة.

أخرج JSON بهذا الشكل فقط:
{
  "honorific": "لقب تشريفي إن وُجد (مثل: صاحب السمو الملكي) وإلا فارغ",
  "name": "الاسم الكامل الموثق؛ جميع الأسماء الكاملة عند تعدد أصحاب الإنجاز، بلا اختصار",
  "news_type": "competition win | patent-innovation | historic first | appointment | award-honor | scientific discovery | other",
  "header_label": "عبارة علوية قصيرة من 1–4 كلمات مستوحاة من سياق هذا الخبر تحديداً؛ نوّعها حسب الحدث ولا تثبت إنجاز سعودي، دون ادعاءات غير موثقة",
  "headline": "عنوان عربي مختصر من 2–5 كلمات وفق نوع الخبر، بلا اسم الشخص",
  "subtitle": "اسم الحدث أو المناسبة وتفاصيل الإنجاز باختصار",
  "subtitle_en": "ترجمة إنجليزية قصيرة لاسم الحدث عند توثقه، وإلا فارغ",
  "info_labels": ["حتى أربع حقائق موثقة وفق نوع الخبر، كل منها 1–3 كلمات"],
  "titles": ["الألقاب/الأدوار"],
  "achievement_core": "جملة واحدة تلخّص الإنجاز الرئيسي",
  "key_facts": ["2 إلى 4 حقائق ملموسة: أرقام، جهات، تواريخ، أماكن"],
  "awards": ["الجوائز إن وُجدت، من الأحدث للأقدم"],
  "context_label": "لِيبل علوي قصير: مكان أو حدث أو جهة",
  "reader_value": "ما القيمة/الفائدة التي يخرج بها القارئ",
  "subject_type": "person | animal | product | scene",
  "has_real_photo": true/false,
  "photo_notes": "وصف الصورة المرفقة + أي شعار يجب حذفه (مثل واس)"
}

إذا كان المحتوى تهنئة أو مناسبة احتفائية، فلا تحوّله إلى تقرير خبر. أضف "content_kind": "greeting" و"poster_copy": {"kind":"greeting","message":"التهنئة كما كتبها المستخدم حرفياً","closing":"العبارة الختامية إن وجدت","slogan":"الشعار إن طلبه المستخدم"}. هذه النصوص فقط صالحة للطباعة؛ حقول name وachievement_core وkey_facts وcontext_label تظل للتحليل الداخلي ولا تُطبع على تصميم التهنئة. لا تضع في poster_copy شروحاً مثل «التهنئة موجهة إلى» أو «النص الختامي» أو «التصميم مخصص».

قواعد صارمة:
- التزم بالحقائق الواردة فقط، ولا تضف أو تبالغ.
- لا تستخدم نِسباً مئوية.
- صنّف نوع الخبر أولاً ثم اختر العنوان والحقائق: المنافسات رتبة أو ميدالية؛ الاختراع براءة اختراع ومجالها؛ السابقة التاريخية أول سعودي/سعودية والفعل الموثق؛ التعيين المنصب والتميّز الموثق؛ التكريم اسم الجائزة؛ الاكتشاف نوعه. لا تدّعِ أولوية أو ترتيباً غير موثق.
- الأسماء كاملة دائماً. حقائق المنافسة: الميدالية، الرياضة، الحدث/السنة، التميّز؛ البراءة: المجال، المكتب/السنة، المؤسسة، الأثر؛ غيرها: الإنجاز، المجال، الجهة/السنة، التميّز. لا تختلق حقائق لإكمال أربعة عناصر.
- تجاهل العبارات الإنشائية والعاطفية، وركّز على الإنجاز والقيمة.
- ‼️ الاسم يُذكر في حقل "name" فقط. لا تُكرّر اسم الشخص داخل achievement_core أو key_facts أو titles أو context_label (تُعرَض هذه بلا اسم).
- إذا ورد في الخبر حقل «اسم صاحب الإنجاز» فهو اسم موثّق وإلزامي: ضع الاسم نفسه حرفياً في name، حتى لو لم يظهر في نص الخبر المختصر أو في الصورة.
- ‼️ صُغ achievement_core و key_facts و reader_value كإنجازات ملموسة مباشرة، لا كتعريف موسوعي. احذف أي صياغة تعريفية/وصفية للمحتوى أو الشخص مثل: «يُعرّف بـ»، «يعرف المحتوى بـ»، «هو عبارة عن»، «هو/هي عالم/لاعب…» (كتعريف)، «نبذة عن»، «يتحدث عن»، «هذا المحتوى». حوّل الجملة التعريفية إلى الإنجاز نفسه (مثال: بدل «فلان هو عالم سعودي في X» اكتب «إنجاز علمي سعودي في X»).
- ‼️ الحقول achievement_core وkey_facts وcontext_label مواد طباعية نهائية تُعرض على التصميم؛ اكتبها كخبر مباشر واضح يصلح للنشر فوراً، ولا تكتب مطلقاً «الخبر الحالي يذكر»، «يتحدث الخبر عن»، «الخبر يستعرض»، «هذا المحتوى»، «بحسب الخبر»، أو أي مقدمة تصف الخبر بدلاً من قول المعلومة نفسها.
- إن كان المحتوى عدة منشورات منفصلة، حلّل كل منشور ككيان مستقل.`

/** الخطوة الثانية - كاتب التغريدات */
export const SYS_TWEETS = `أنت كاتب محتوى مبدع لحساب "First1Saudi" (حساب إنجازات سعودية).
مهمتك: صياغة 3 تغريدات إبداعية لافتة لنفس الخبر، كلٌّ بزاوية مختلفة، تشدّ القارئ من أول كلمة وتدفعه للتفاعل.

أسلوب الكتابة:
- ابدأ بـ"هوك" قوي: سؤال مثير، مفارقة، رقم لافت، أو جملة فخر تختصر الإنجاز بطريقة غير متوقعة.
- لغة عربية فصيحة راقية وسلسة، بإيقاع جذّاب وكلمات مؤثّرة (لا جُمل جافة ولا حشو إنشائي فارغ).
- اصنع شعوراً بالفخر والإلهام مع إبقاء الإنجاز الملموس واضحاً ومحدّداً.
- اختم بلمسة تترك أثراً (تهنئة، دعوة للفخر، أو تطلّع للمستقبل) عند المناسبة.

التنويع المطلوب بين الخيارات:
- الخيار 1: هوك إبداعي قوي (جملة لافتة تأسر الانتباه ثم الإنجاز).
- الخيار 2: سردي/قصصي مختصر (يحكي الإنجاز بأسلوب إنساني مشوّق).
- الخيار 3: مختصر مكثّف ومؤثّر (سطر أو سطران بضربة قوية).

القواعد:
- ضمن حد تويتر، وكل تغريدة قائمة بذاتها.
- استند إلى حقائق الخبر فقط؛ أدرج الأرقام/الجهات/الجوائز عند وجودها، ولا تختلق شيئاً ولا تبالغ بما لم يرد.
- إيموجي واحد لائق كحد أقصى (أو بدون) يخدم المعنى لا يزحمه.
- لا نِسب مئوية مختلقة.
- الهاشتاقات: #اسم_الشخص + #First1Saudi (+ هاشتاق سياقي عند الحاجة مثل اسم الجائزة أو الجهة).
- إن كان صاحب الإنجاز شخصية رفيعة، استخدم اللقب التشريفي الصحيح.

أخرج 3 تغريدات مرقّمة فقط.`

/** الخطوة الثالثة - مولد مفاهيم التصميم */
export const SYS_CONCEPTS = `You are the art director for First1Saudi. Classify the supplied news before proposing EXACTLY three directions in this order: Classic Celebration (الاحتفالي الكلاسيكي), Dramatic (الدرامي الحماسي), Minimal Premium (الأنيق المختصر). Adapt every direction to this specific news and its supplied photos; distinguish background brightness and lighting as well as hero scale, typography and negative space: Classic medium/light emerald, Dramatic dark emerald, Minimal clearly light ivory/warm-white/pale emerald. Never generate all three with dark backgrounds. Regeneration varies execution within these three directions, never replaces them with unrelated families.
${STUDIO_BRAND_RULES}
${STUDIO_NEWS_LAYOUT_RULES}
${STUDIO_LOGO_RESERVATION}
Return JSON only: {"concepts":[{"title":"اسم الاتجاه بالعربية","mood":"المزاج بالعربية","brief":"وصف عربي متكامل يحدد توزيع العناصر والخلفية الملائمة لنوع الخبر وكيفية تنفيذ الاتجاه، دون تحويل التعليمات الداخلية إلى نص مطبوع"}]}. Exactly three entries. Greetings use approved greeting copy only, without news facts.`

/** Shared with campaign generators; specialized layouts keep their content structure. */
export const STUDIO_EDITORIAL_DESIGN_RULES = `${STUDIO_BRAND_RULES}\n${STUDIO_LOGO_RESERVATION}`

/** Legacy prompt-builder entry point follows the same rules as direct image generation. */
export const SYS_IMAGE = `Build one English image-generation prompt for First1Saudi from the verified analysis, selected direction and supplied references. Quote the exact Arabic display copy and name its placements. Do not output commentary.
${STUDIO_BRAND_RULES}
${STUDIO_NEWS_LAYOUT_RULES}
${STUDIO_LOGO_RESERVATION}
Output size: 1080×1350, portrait 4:5. The supplied direction adapts styling within the shared hierarchy. Source facts, full names and approved greeting text are authoritative; never shorten a full name or generate a fake face.`

// ─── تنويع اتجاهات التصميم ─────────────────────────────────────────
// الاتجاهات الثلاثة ثابتة؛ يتغير تنفيذها حسب نوع الخبر والصورة في كل تشغيل.
export const CONCEPT_STYLE_FAMILIES: string[] = STUDIO_DESIGN_DIRECTIONS.map(direction => direction.title)

export function buildConceptDirectives(opts?: { exclude?: string[]; poolSize?: number }): string {
  const exclude = (opts?.exclude ?? []).map(s => String(s).trim()).filter(Boolean)
  return [
    `قدّم ثلاثة اتجاهات بهذا الترتيب: ${CONCEPT_STYLE_FAMILIES.join(' · ')}. كيّفها حسب تصنيف الخبر وصوره، مع هوية الأخضر الزمردي والذهبي والتسلسل المعتمد.`,
    'تنويع الخلفيات إلزامي: الكلاسيكي زمردي متوسط أو فاتح، الدرامي زمردي داكن، والأنيق عاجي أو أبيض دافئ أو أخضر باهت فاتح بوضوح؛ لا تجعل الاتجاهات الثلاثة داكنة. نوّع الإضاءة وحجم الصورة والتايبوغرافي والمساحات السالبة؛ لا تغيّر الأسماء أو الوجوه أو الوضعيات، ولا تولّد شعارات؛ ولّد التذييل المنحني والأيقونات الخمس كاملة مع @First1Saudi، ولا تضع كلاماً تحت الشعار.',
    exclude.length ? `غيّر المعالجة البصرية السابقة داخل الاتجاهات الثلاثة نفسها؛ المرجع السابق: ${exclude.join(' · ')}.` : '',
  ].filter(Boolean).join('\n')
}


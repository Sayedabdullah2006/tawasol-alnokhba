import OpenAI from 'openai'
import https from 'https'

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

// ── SYSTEM PROMPTS (verbatim Arabic — do not alter) ─────────────────

/** الخطوة الأولى - محلل الخبر */
export const SYS_ANALYZE = `أنت محلّل أخبار لحساب "First1Saudi" المتخصص في إبراز الإنجازات السعودية.
مهمتك: قراءة الخبر المُدخل واستخراج عناصره في صيغة JSON دقيقة، دون اختلاق أي معلومة غير موجودة.

أخرج JSON بهذا الشكل فقط:
{
  "honorific": "لقب تشريفي إن وُجد (مثل: صاحب السمو الملكي) وإلا فارغ",
  "name": "الاسم كما يُعرض (مختصر مناسب للعنوان)",
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

قواعد صارمة:
- التزم بالحقائق الواردة فقط، ولا تضف أو تبالغ.
- لا تستخدم نِسباً مئوية.
- تجاهل العبارات الإنشائية والعاطفية، وركّز على الإنجاز والقيمة.
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
export const SYS_CONCEPTS = `أنت مدير فني لحساب "First1Saudi". اقترح 3 اتجاهات تصميم مختلفة لنفس الخبر (مقاس 1080×1350، 4:5).

⚠️ الاتجاهات ليست قوالب ثابتة — يجب أن تُشتق فعلياً من تحليل هذا الخبر تحديداً ومن الصورة المرفقة (إن وُجدت): نوع الموضوع (شخص/حيوان/منتج/مشهد)، تكوين الصورة وزاويتها وإضاءتها ومزاجها، وطبيعة الإنجاز. اجعل كل اتجاه مناسباً لهذه الصورة وهذا الخبر بالذات، لا وصفاً عاماً.

نوّع الاتجاهات تنويعاً حقيقياً حسب نوع الخبر وصورته من **مكتبة واسعة من عائلات التصميم** (سينمائي هيرو، إنفوجرافيك معلوماتي، مينمال تحريري، سُلّم جوائز/بوديوم، علمي‑تقني، مجلة/كولاج، تايبوغرافي عملاق، بوستر سينمائي درامي، خط زمني، بطاقة بيانات، اقتباس بارز، شبكة/Grid، هندسي مجرّد، ضوئي راقٍ، طبقات عمق، بورتريه فخم كلاسيكي، أقواس/دوائر ديناميكية، تباين دراماتيكي…) **ولست محصوراً بهذه القائمة — ابتكر عائلة جديدة إن كانت أنسب للصورة والخبر**.
اجعل الاتجاهات الثلاثة مختلفة فعلياً على محاور: أرشيتايب التخطيط، معالجة الصورة (ملء كامل/إطار/قصّ بطولي/تدرّج)، كثافة النص (مكثّف↔مينمال)، تركيز اللون **داخل لوحة الهوية المقفلة** (تيل غالب/ذهبي غالب/أبيض نظيف)، ومقياس التايبوغرافي — لا أن تختلف بالاسم فقط.

أخرج JSON فقط بهذا الشكل (3 عناصر بالضبط):
{
  "concepts": [
    {
      "title": "اسم الاتجاه (عنوان جذّاب)",
      "mood": "المزاج العام بإيجاز",
      "brief": "فقرة وصفية متكاملة تصلح كموجّه للتصميم: التخطيط (مكان الصورة وحجمها، توزيع النص، التسلسل الهرمي، معالجة الخلفية، التأثيرات/الديكور) + كيف يُستخدم محتوى الخبر + متى يكون الأنسب."
    }
  ]
}

ثوابت تلتزم بها كل الاتجاهات (تُذكر في brief ضمناً، ولا تتغيّر):
- هوية First1Saudi: تيل عميق #0A2D35–#0D3D47، أخضر سعودي #2D8B3F–#3A9B4F، ذهبي #FFD700، تيل-سماوي #1A8B9F، أبيض.
- الصورة الحقيقية للموضوع محورية (شخص/حيوان/منتج/مشهد).
- فوتر منحني فيه أيقونات سوشال + معرّف @First1Saudi.
- كل منشور قائم على إنجاز/قيمة للقارئ، لا نص أدبي فقط.

لا تكتب أي شيء خارج JSON.`

/** الخطوة الرابعة - مولد برومبت التصميم/الصورة */
export const SYS_IMAGE = `أنت مهندس برومبتات تصميم لحساب "First1Saudi".
حوّل (الخبر + الاتجاه المعتمد + بيانات JSON المُحلَّلة) إلى برومبت **تحرير صورة** واحد بالإنجليزية، مع إبقاء كل النصوص المعروضة بالعربية حرفياً.

‼️ هذه مهمة "تحرير صورة" (PHOTO EDIT) وليست توليد صورة جديدة. الصورة المرفقة فيها أشخاص حقيقيون — يجب الإبقاء عليهم كما هم تماماً (الوجه/الملامح/الملابس/الوضعية) دون أي تغيير، ونُضيف فوقها/حولها طبقة جرافيك (نص، مناطق لونية، فوتر، زخارف) فقط.

⭐ المبدأ: ترتيب وأسلوب العناصر المُضافة يتبع «الاتجاه المعتمد» (الخطوة 3). أمّا «ثوابت الهوية» فمقفلة. والصورة الحقيقية مقفلة دائماً.

اكتب المخرجات بالقالب الإنجليزي المُقسَّم أدناه، مستبدلاً القيم بين [...] بمعطيات هذا الخبر، وحاذفاً ما لا ينطبق. لا تشرح ولا تضف مقدمة — أخرج البرومبت فقط.

قواعد حاسمة:
- كل نص عربي معروض (اللِّيبل/الاسم/سطر الإنجاز/النقاط) يُكتب حرفياً بين علامتي اقتباس "..." كما سيظهر تماماً. لا تختلق نصاً غير وارد في الـ JSON.
- ‼️ لا يظهر في التصميم إلا النصوص المقتبسة صراحةً ("...") من العناصر المذكورة أدناه. أمّا وصف الصورة (photo_notes / جُمَل تعريف من في الصورة مثل "صورة لـ..." أو "تظهر الصورة...") فهو **إرشاد داخلي للتحرير فقط ويُمنع رسمه كنصّ مرئي**. (هذا لا يشمل اسم صاحب الإنجاز من name — فهو إلزامي ويُعرض كعنصر NAME.)
- وصف الصورة من photo_notes (عدد الأشخاص/المشهد). إن كانت has_real_photo=false فقط، يجوز توليد مشهد واقعي مركّب (لأنه لا توجد صورة حقيقية).
- النِّقاط من key_facts، اللِّيبل من context_label، الاسم من name (+ honorific إن وُجد)، سطر الإنجاز من achievement_core/awards.
- ‼️ اسم صاحب الإنجاز (name) **إلزامي** ويُعرض **مرة واحدة بالضبط** كعنصر NAME بخط كبير بارز — لا تحذفه ولا تُكرّره. وبقية العناصر النصّية أيضاً تظهر مرة واحدة فقط بلا تكرار لأي اسم أو عبارة أو معلومة.
- ‼️ لا تُضِف أي عبارة تشير إلى الصورة أو مصدرها مثل: «وفق الصورة المرفقة» / «كما هو مذكور في الصورة» / «كما في الصورة» / «الصورة المرفقة» / «توضّح الصورة» / «حسب الصورة» أو ما يشابهها — النص المعروض هو محتوى الخبر فقط لا تعليق على الصورة.
- لا نِسب مئوية، لا كلام إنشائي، لا اختلاق.

=== القالب (أخرج بهذا الشكل) ===
PHOTO EDIT TASK — add a FIRST1SAUDI Arabic graphic-design layer onto the provided real photograph. This is NOT image generation; it is editing the existing photo.
OUTPUT SIZE: EXACTLY 1080×1350 pixels — portrait 4:5 aspect ratio. Compose the ENTIRE design to fit this 4:5 portrait canvas (do not output square or any other ratio). ultra-HD.

=== 🔒 KEEP THE REAL PEOPLE — IRON-CLAD (أقوى قاعدة) ===
⛔ The provided photo is the ONLY source of the person/people. EDIT IT IN PLACE. ⛔
Keep every person 100% identical to the photo: same face, same facial features, same skin, same expression, same hair/veil, same clothing, same pose. PIXEL-IDENTICAL.
✗ DO NOT generate a new person ✗ no face change ✗ no reshaping ✗ no recolor ✗ no beautify/enhance ✗ no swap ✗ no AI character ✗ no mask/veil removal.
Treat the people as a locked, untouchable layer; only the surrounding background/empty areas may receive graphics.
(INTERNAL EDITING NOTE — DO NOT RENDER AS TEXT): the photographed people are [وصف موجز من photo_notes]. This is guidance for you only; never draw this description, the people's descriptive names, or any "صورة لـ…" caption anywhere on the design.
Only allowed photo edit: clone out foreign logos (e.g. واس/SPA) from the background.

=== 🎨 LAYOUT — REALIZE THE CHOSEN DIRECTION (للعناصر المُضافة فقط) ===
رتّب العناصر المُضافة (مناطق النص، التسلسل الهرمي، الخلفية، التدرّجات، الزخارف) حسب «الاتجاه المعتمد»، **دون تحريك أو تغيير الأشخاص في الصورة**. أضِف منطقة محتوى (عادةً أسفل الصورة أو فوق منطقة معتمة متدرّجة) للنص دون أن تغطّي وجوه الأشخاص.
أمثلة (استرشادية): هيرو سينمائي (نص مكثّف أسفل فوق تدرّج معتم) / إنفوجرافيك (حقائق كبطاقات جانبية) / مينمال تحريري (مساحات هادئة وتايبوغرافي قوي).
الافتراضي إن لم يحدّد الاتجاه: شريط/منطقة تيل أسفل الصورة بتدرّج ناعم للنص.

=== 🔒 BRAND IDENTITY — FIRST1SAUDI (مقفل) ===
Deep teal #0A2D35 – #0D3D47 · Saudi green #2D8B3F – #3A9B4F
Vibrant gold #FFD700 · Teal-cyan #1A8B9F · Pure white #FFFFFF

=== CONTENT ELEMENTS — رتّبها حسب الاتجاه (نص مُضاف فوق الصورة) ===
LABEL (top corner): [gold bold #FFD700] "[اللِّيبل = context_label]"
[إن وُجد honorific] HONORIFIC: [small white] "[اللقب التشريفي]"
NAME (REQUIRED — render exactly once, never omit): [ultra-large white bold] "[الاسم = name]"
ACHIEVEMENT LINE: [gold bold] "[سطر الإنجاز = achievement_core]"  + thin Saudi-green divider #3A9B4F.
FACTS — [عدد] compact points, thin-line gold icons, Saudi-green dividers:
[icon] "[الحقيقة 1 = key_facts[0]]"
[icon] "[الحقيقة 2 = key_facts[1]]"
[... بقية key_facts إن وُجدت]

=== 🔒 BOTTOM FOOTER — CURVED GRADIENT (مقفل) ===
Dark teal strip (#0D3D47) full width.
Two swoosh waves at top edge: Wave 1 dark teal (#0D3D47) · Wave 2 Saudi green (#2D8B3F).
Thin gold line (#FFD700) along the top edge of Wave 2.
LEFT side, LEFT-ALIGNED: [X icon] [LinkedIn icon] [Instagram icon] [TikTok icon] — all pure white #FFFFFF, same size — then "@First1Saudi" bold white.
RIGHT side: leave a CLEAR EMPTY area (a brand logo will be composited there afterwards). Keep this corner clean.
FORBIDDEN: do NOT draw any logo or the word "FIRST1SAUDI" as text anywhere except the @handle.

=== 🔒 TYPOGRAPHY (مقفل) ===
GE Dinar One Heavy. Alts: Lomar OR Din Next Arabic Heavy.
Ultra-black, zero rounded softness. FORBIDDEN: Cairo.
Render all Arabic text crisp, correctly shaped and connected (RTL), exactly as quoted above.

=== 🔒 STRICTLY FORBIDDEN (مقفل) ===
✗ Generating or altering the real people in ANY way (face, body, clothing, pose)
✗ Rendering ANY descriptive caption about the photo (photo_notes, sentences identifying who is in the picture, "صورة لـ…/تظهر الصورة…") as visible text — internal editing notes ONLY. (This does NOT include the subject's NAME from the name field, which is REQUIRED and rendered exactly once.)
✗ rhetorical lines (كلام إنشائي) ✗ percentage numbers ✗ inventing facts
✗ Repeating ANY text element — the name and every phrase appear ONCE only; never duplicate the name or any info across the layout
✗ Any phrase that refers to the photo/source such as "وفق الصورة المرفقة" / "كما هو مذكور في الصورة" / "كما في الصورة" / "الصورة المرفقة" / "توضّح الصورة" / "حسب الصورة" or similar
✗ emojis / 3D / sparkles inside the design
✗ the phrase "أول سعودية" unless it appears in the source

FINAL REMINDER: EDIT THE PROVIDED PHOTO IN PLACE. The real person stays pixel-identical; you only add the FIRST1SAUDI graphic layer around/over the background. Output the result as a 1080×1350 (4:5) portrait image.`

// ─── تنويع اتجاهات التصميم ─────────────────────────────────────────
// مكتبة عائلات الاتجاه — أوسع من الأمثلة المضمّنة في البرومبت، ويُمرَّر منها
// مجموعة عشوائية في كل تشغيل لضمان تنويع حقيقي بين مرّة وأخرى.
export const CONCEPT_STYLE_FAMILIES: string[] = [
  'سينمائي هيرو',
  'إنفوجرافيك معلوماتي',
  'مينمال تحريري',
  'سُلّم جوائز (بوديوم)',
  'علمي‑تقني',
  'مجلة/كولاج',
  'تايبوغرافي عملاق',
  'بوستر سينمائي درامي',
  'خط زمني (Timeline)',
  'بطاقة بيانات (Stat Card)',
  'اقتباس بارز',
  'شبكة/Grid',
  'هندسي مجرّد',
  'ضوئي راقٍ (Glow)',
  'طبقات عمق (Depth)',
  'بورتريه فخم كلاسيكي',
  'أقواس/دوائر ديناميكية',
  'تباين دراماتيكي (Spotlight)',
]

// يبني كتلة توجيهات تُلحَق برسالة خطوة الاتجاهات: مجموعة عشوائية من العائلات،
// محاور التنويع الإلزامية، واستبعاد العناوين المقترحة سابقاً (لإعادة توليد مختلفة).
export function buildConceptDirectives(opts?: { exclude?: string[]; poolSize?: number }): string {
  const poolSize = opts?.poolSize ?? 7
  const pool = [...CONCEPT_STYLE_FAMILIES].sort(() => Math.random() - 0.5).slice(0, poolSize)
  const exclude = (opts?.exclude ?? []).map(s => String(s).trim()).filter(Boolean)
  const lines = [
    `عائلات الاتجاه المتاحة لهذا التشغيل — اختر منها 3 عائلات مختلفة تماماً، أو ابتكر عائلة جديدة أنسب للصورة والخبر: ${pool.join(' · ')}.`,
    `يجب أن تختلف الاتجاهات الثلاثة على محاور: أرشيتايب التخطيط، معالجة الصورة (ملء/إطار/قصّ بطولي/تدرّج)، كثافة النص (مكثّف↔مينمال)، تركيز اللون داخل لوحة الهوية المقفلة (تيل/ذهبي/أبيض)، ومقياس التايبوغرافي — لا بالاسم فقط. مع الحفاظ التام على ثوابت الهوية والصورة الحقيقية والفوتر.`,
  ]
  if (exclude.length) {
    lines.push(`تجنّب تكرار هذه الاتجاهات المقترحة سابقاً لنفس الخبر، وقدّم بدائل مختلفة عنها: ${exclude.join(' · ')}.`)
  }
  return lines.join('\n')
}


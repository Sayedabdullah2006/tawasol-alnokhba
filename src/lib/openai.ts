import OpenAI from 'openai'
import https from 'https'
import { STUDIO_DESIGN_DIRECTIONS } from './studio-design-guidelines'
export { SYS_ANALYZE, SYS_TWEETS, SYS_CONCEPTS, SYS_IMAGE } from './studio-reference-prompts'
export { STUDIO_EDITORIAL_DESIGN_RULES } from './studio-design-guidelines'

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


/** Fact-bound opening variations; never invent a quote, scene or number. */
export const TWEET_OPENER_STYLES: string[] = [
  'الإنجاز نفسه في جملة مكتملة، قبل فئة المنافسة أو التفاصيل التصنيفية.',
  'الفكرة أو الحل وأثره الموثق؛ الجهة أو الرقم يخدمان المعنى حين يفيدان.',
  'نتيجة المنافسة الدقيقة ضمن فئتها، دون تعميم السابقة أو إعادة معناها في المتن.',
  'التحول الموثق في مسيرة الشخص قبل تفاصيله، دون تصدير تكريم قديم.',
  'الفرصة التي أتاحها الإنجاز وفق المصدر، دون تحويل أهلية المشاركة إلى فوز أو تأهل غير مثبت.',
]

export function buildTweetDirectives(): string {
  const pool = [...TWEET_OPENER_STYLES].sort(() => Math.random() - 0.5).slice(0, 3)
  return [
    'أنتج التغريدة الرئيسية وردًا أول منفصلًا بالرابط وثلاثة بدائل للخطاف والحسابات المتحققة والموعد المقترح؛ لا تدمج أقسام المراجعة في نص النشر.',
    'نوّع الافتتاحية وفق الحقائق الفعلية: ' + pool.join(' · '),
    'اذكر الاسم والتفاصيل التي تضيف معنى جديدًا، دون تكرار معنى الخطاف. البنية حسب الحكاية؛ النقاط اختيارية وليست عددًا مفروضًا. اختم بسؤال رأي واضح مرتبط بالقصة يستطيع القارئ العام الإجابة عنه، ونوّع الأسئلة بدل فرض «ما سؤالك الأول؟». وسمان ذوا صلة كحد أقصى في النهاية. لا تفرض وسم هوية؛ عند الطول سلسلة مرقمة بجمل كاملة. لا تختلق رقمًا أو حساب @. النشر المقترح 20:00–23:00 الرياض في اليوم التالي للحزمة المستقلة؛ الخطة تتبع يومها وموعدها المعتمد.',
  ].join('\n')
}

/** Export retained for older callers; these are fallback hints, not fixed families. */
export const CONCEPT_STYLE_FAMILIES = STUDIO_DESIGN_DIRECTIONS.map(direction => direction.title)
export function buildConceptDirectives(opts?: { exclude?: string[]; poolSize?: number }): string {
  const exclude = (opts?.exclude ?? []).map(s => String(s).trim()).filter(Boolean)
  return [
    `اقترح ثلاثة اتجاهات ديناميكية بحسب الخبر وصورته، تختلف في التكوين وحجم الصورة والإيقاع البصري وتنظيم الإنفوجرافيك. الاسم في الأعلى ثم خبر مترابط يوضح ما حُصد وفي أي مناسبة أو جهة، ثم رقم واحد موثق ومفيد إن وجد؛ الصورة الأصلية أكبر عنصر وتشغل 60% على الأقل والتفاصيل للتغريدة. لا تغيّر هذا التسلسل للتنويع. يدمج نموذج الصور المرجع في التصميم نفسه مع تثبيت ملامح الشخص وملابسه وهيئته، ولا تركّب الصورة برمجيًا بعد الخلفية. الاتجاهات السابقة تلميحات للتنويع لا عائلات ثابتة.`,
    exclude.length ? 'غيّر التنفيذ والعناوين السابقة حسب الخبر والصورة، مع ثبات التسلسل والهوية. الاتجاهات السابقة: ' + exclude.join(' · ') : '',
  ].filter(Boolean).join('\n')
}

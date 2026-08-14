import 'server-only'

import { chatComplete, getOpenAI } from '@/lib/openai'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { getXInsights, type XInsights } from '@/lib/x-insights'

type MetricBag = Record<string, number | undefined>

export type GrowthAlert = {
  id: string
  severity: 'high' | 'medium' | 'info'
  title: string
  detail: string
  action: string
  postUrl?: string
}

export type GrowthPulse = {
  postId: string
  postUrl: string
  text: string
  ageHours: number
  impressions: number
  replyRate: number
  shareRate: number
  velocity: number | null
  status: 'منطلق' | 'واعد' | 'مستقر' | 'يحتاج تدخلاً'
}

export type GrowthConversation = {
  x_post_id: string
  conversation_type: 'mention' | 'reply' | 'quote'
  author_username: string | null
  author_name: string | null
  post_text: string
  post_url: string
  public_metrics: MetricBag
  status: 'open' | 'reviewed' | 'replied' | 'dismissed'
  updated_at: string
}

export type GrowthExperiment = {
  id: string
  name: string
  hypothesis: string
  primary_metric: 'reply_rate' | 'share_rate' | 'follow_intent' | 'engagement_rate'
  variant_a: { text: string; postId?: string }
  variant_b: { text: string; postId?: string }
  status: 'draft' | 'running' | 'completed' | 'cancelled'
  result: Record<string, unknown> | null
  created_at: string
}

export type WeeklyPlan = {
  generatedAt: string
  focus: string
  targets: Array<{ label: string; value: string }>
  actions: Array<{ day: string; task: string; purpose: string }>
  themes: string[]
}

export type DraftVariant = {
  objective: 'replies' | 'shares' | 'follows'
  label: string
  text: string
  score: number
  rationale: string
}

export type DraftAnalysis = {
  analyzedAt: string
  originalScore: number
  strengths: string[]
  risks: string[]
  variants: DraftVariant[]
}

export type XGrowthDashboard = {
  pulses: GrowthPulse[]
  alerts: GrowthAlert[]
  conversations: GrowthConversation[]
  experiments: GrowthExperiment[]
  weeklyPlan: WeeklyPlan
  lastDraftAnalysis: DraftAnalysis | null
  snapshotCount: number
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function metric(metrics: MetricBag | null | undefined, key: string) {
  const value = Number(metrics?.[key] ?? 0)
  return Number.isFinite(value) ? value : 0
}

function makeWeeklyPlan(insights: XInsights): WeeklyPlan {
  const top = insights.topPosts[0]
  const replyTarget = Math.max(0.5, round(insights.summary.engagementRate * 0.3, 1))
  const shareTarget = Math.max(0.3, round(insights.summary.engagementRate * 0.2, 1))
  return {
    generatedAt: new Date().toISOString(),
    focus: top
      ? `تكرار زاوية المنشور الأعلى أداءً دون إعادة صياغته حرفيًا: ${top.text.slice(0, 90)}`
      : 'بناء عينة أولية من منشورات متنوعة قابلة للقياس قبل تثبيت نمط المحتوى.',
    targets: [
      { label: 'هدف الردود', value: `${replyTarget}% من الظهور` },
      { label: 'هدف المشاركة', value: `${shareTarget}% من الظهور` },
      { label: 'زمن الاستجابة', value: 'مراجعة الردود خلال ساعتين' },
    ],
    actions: [
      { day: 'الأحد', task: 'منشور سؤال نوعي حول إنجاز سعودي حديث', purpose: 'رفع احتمالية الرد' },
      { day: 'الاثنين', task: 'متابعة الردود واختيار أفضل سؤال للمناقشة', purpose: 'تعميق المحادثة' },
      { day: 'الثلاثاء', task: 'منشور مرجعي قابل للحفظ والمشاركة', purpose: 'رفع نسخ الرابط والحفظ' },
      { day: 'الأربعاء', task: 'اقتباس مساهمة موثوقة مع إضافة تحريرية', purpose: 'توسيع شبكة الوصول' },
      { day: 'الخميس', task: 'قصة قصيرة تنتهي بسبب واضح لمتابعة الحساب', purpose: 'رفع نية المتابعة' },
      { day: 'الجمعة', task: 'مراجعة التنبيهات وعدم تكرار الزوايا الضعيفة', purpose: 'خفض الإشارات السلبية' },
      { day: 'السبت', task: 'توثيق نتيجة تجربة A/B واختيار الفائز', purpose: 'تحسين الأسبوع التالي' },
    ],
    themes: top
      ? ['الحوار حول الإنجاز', 'الدروس القابلة للتطبيق', 'الأثر الإنساني للابتكار']
      : ['إنجاز سعودي موثق', 'فرصة مستقبلية', 'سؤال يفتح نقاشًا متخصصًا'],
  }
}

function buildAlerts(insights: XInsights, conversations: GrowthConversation[]): GrowthAlert[] {
  const alerts: GrowthAlert[] = []
  const scored = insights.posts.filter(post => post.impressions > 0)
  const avgReplyRate = scored.length
    ? scored.reduce((sum, post) => sum + post.replies / Math.max(post.impressions, 1) * 1_000, 0) / scored.length
    : 0

  for (const post of scored.slice(0, 12)) {
    const replyRate = post.replies / Math.max(post.impressions, 1) * 1_000
    const shareRate = (post.reposts + post.quotes + post.bookmarks) / Math.max(post.impressions, 1) * 1_000
    if (post.impressions >= 200 && replyRate >= Math.max(2, avgReplyRate * 1.5)) {
      alerts.push({
        id: `conversation-${post.id}`,
        severity: 'high',
        title: 'نافذة محادثة نشطة',
        detail: `معدل الردود ${round(replyRate, 1)} لكل ألف ظهور، أعلى من المعتاد للحساب.`,
        action: 'راجع الردود الآن واكتب متابعة تضيف معلومة جديدة.',
        postUrl: post.url,
      })
    } else if (post.impressions >= 500 && replyRate < 0.5) {
      alerts.push({
        id: `silent-${post.id}`,
        severity: 'medium',
        title: 'وصول بلا محادثة',
        detail: `حقق المنشور ${post.impressions} ظهورًا لكن الردود منخفضة.`,
        action: 'اختبر سؤالًا محددًا في منشور متابعة بدل طلب تفاعل عام.',
        postUrl: post.url,
      })
    }
    if (shareRate >= 5) {
      alerts.push({
        id: `share-${post.id}`,
        severity: 'info',
        title: 'محتوى قابل للمشاركة',
        detail: `معدل التضخيم ${round(shareRate, 1)} لكل ألف ظهور.`,
        action: 'حوّل الفكرة إلى جزء ثانٍ أو مرجع مختصر دون نسخ المنشور.',
        postUrl: post.url,
      })
    }
  }

  const open = conversations.filter(item => item.status === 'open').length
  if (open) alerts.unshift({
    id: 'open-conversations',
    severity: 'high',
    title: `${open} محادثة بانتظار المراجعة`,
    detail: 'هذه التفاعلات بدأها المستخدمون، وهي أفضل فرصة آمنة لبناء الحوار.',
    action: 'راجع صندوق فرص المحادثة واقترح ردودًا بشرية مخصصة.',
  })
  if (!scored.length) alerts.push({
    id: 'missing-data',
    severity: 'medium',
    title: 'لا توجد بيانات ظهور قابلة للمقارنة',
    detail: 'يحتاج المحرك إلى مزامنة منشورات X حتى يكتشف فرص الانتشار.',
    action: 'أكمل إعداد مفتاح X ثم شغّل تحديث البيانات.',
  })
  return alerts.slice(0, 8)
}

export async function getXGrowthDashboard(insights: XInsights): Promise<XGrowthDashboard> {
  const service = await createServiceRoleClient()
  const [snapshotResult, conversationResult, experimentResult, workspaceResult] = await Promise.all([
    service.from('x_post_metric_snapshots').select('x_post_id,captured_at,public_metrics').order('captured_at', { ascending: false }).limit(500),
    service.from('x_growth_conversations').select('x_post_id,conversation_type,author_username,author_name,post_text,post_url,public_metrics,status,updated_at').order('updated_at', { ascending: false }).limit(50),
    service.from('x_growth_experiments').select('id,name,hypothesis,primary_metric,variant_a,variant_b,status,result,created_at').order('created_at', { ascending: false }).limit(20),
    service.from('x_growth_workspace').select('last_draft_analysis,weekly_plan').eq('id', true).maybeSingle(),
  ])
  for (const result of [snapshotResult, conversationResult, experimentResult, workspaceResult]) {
    if (result.error) throw new Error(`تعذّر تحميل مركز نمو X: ${result.error.message}`)
  }

  const snapshots = snapshotResult.data ?? []
  const snapshotsByPost = new Map<string, typeof snapshots>()
  for (const snapshot of snapshots) {
    const list = snapshotsByPost.get(snapshot.x_post_id) ?? []
    list.push(snapshot)
    snapshotsByPost.set(snapshot.x_post_id, list)
  }

  const pulses: GrowthPulse[] = insights.posts.slice(0, 12).map(post => {
    const history = snapshotsByPost.get(post.id) ?? []
    const latest = history[0]
    const previous = history.find(item => new Date(latest?.captured_at ?? 0).getTime() - new Date(item.captured_at).getTime() >= 55 * 60 * 1000)
    const elapsedHours = previous && latest
      ? Math.max(1, (new Date(latest.captured_at).getTime() - new Date(previous.captured_at).getTime()) / 3_600_000)
      : 0
    const velocity = previous && latest
      ? round((metric(latest.public_metrics, 'impression_count') - metric(previous.public_metrics, 'impression_count')) / elapsedHours, 1)
      : null
    const replyRate = post.impressions ? post.replies / post.impressions * 1_000 : 0
    const shareRate = post.impressions ? (post.reposts + post.quotes + post.bookmarks) / post.impressions * 1_000 : 0
    const ageHours = Math.max(0, Math.floor((Date.now() - new Date(post.createdAt).getTime()) / 3_600_000))
    const status = velocity !== null && velocity >= 100 ? 'منطلق'
      : replyRate >= 2 || shareRate >= 4 ? 'واعد'
        : ageHours < 24 && post.impressions < 200 ? 'يحتاج تدخلاً'
          : 'مستقر'
    return {
      postId: post.id,
      postUrl: post.url,
      text: post.text,
      ageHours,
      impressions: post.impressions,
      replyRate: round(replyRate, 1),
      shareRate: round(shareRate, 1),
      velocity,
      status,
    }
  })
  const conversations = (conversationResult.data ?? []) as GrowthConversation[]
  const storedPlan = workspaceResult.data?.weekly_plan as WeeklyPlan | null | undefined
  const storedDraft = workspaceResult.data?.last_draft_analysis as DraftAnalysis | null | undefined
  return {
    pulses,
    alerts: buildAlerts(insights, conversations),
    conversations,
    experiments: (experimentResult.data ?? []) as GrowthExperiment[],
    weeklyPlan: storedPlan ?? makeWeeklyPlan(insights),
    lastDraftAnalysis: storedDraft ?? null,
    snapshotCount: snapshots.length,
  }
}

function heuristicDraftAnalysis(draft: string): DraftAnalysis {
  const trimmed = draft.trim()
  const hasQuestion = /[؟?]/.test(trimmed)
  const hasLink = /https?:\/\//i.test(trimmed)
  const originalScore = Math.max(30, Math.min(85, 55 + (hasQuestion ? 12 : 0) - (hasLink ? 5 : 0) + (trimmed.length <= 240 ? 8 : -10)))
  const base = trimmed.replace(/\s+/g, ' ')
  return {
    analyzedAt: new Date().toISOString(),
    originalScore,
    strengths: [trimmed.length <= 280 ? 'طول مناسب لمنشور مركز' : 'الفكرة الأساسية واضحة ويمكن اختصارها', hasQuestion ? 'يتضمن مدخلًا للحوار' : 'يحمل فكرة قابلة لإعادة الصياغة'],
    risks: [!hasQuestion ? 'لا يوجد سؤال محدد يحفّز ردًا نوعيًا' : 'يجب أن يبقى السؤال مرتبطًا بالموضوع', hasLink ? 'وجود الرابط قد يسحب الانتباه من الفكرة' : 'يحتاج سببًا أوضح للمشاركة أو الحفظ'],
    variants: [
      { objective: 'replies', label: 'لزيادة الردود', text: `${base}\n\nما الجانب الذي ترون أنه يصنع الأثر الأكبر في هذا الإنجاز؟`, score: Math.min(96, originalScore + 10), rationale: 'سؤال محدد يفتح نقاشًا مرتبطًا بالمحتوى.' },
      { objective: 'shares', label: 'لزيادة المشاركة', text: `${base}\n\nخلاصة تستحق الاحتفاظ بها ومشاركتها مع المهتمين بهذا المجال.`, score: Math.min(94, originalScore + 8), rationale: 'يوضح القيمة العملية للمشاركة دون طلب مباشر للتفاعل.' },
      { objective: 'follows', label: 'لزيادة المتابعة', text: `${base}\n\nنواصل توثيق الإنجازات السعودية وما تفتحه من فرص للمستقبل.`, score: Math.min(92, originalScore + 7), rationale: 'يمنح القارئ سببًا واضحًا لمتابعة الحساب.' },
    ],
  }
}

export async function optimizeXDraft(draft: string, userId: string): Promise<DraftAnalysis> {
  if (draft.trim().length < 12) throw new Error('اكتب مسودة من 12 حرفًا على الأقل')
  let analysis: DraftAnalysis
  try {
    const completion = await chatComplete(getOpenAI(), {
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.2',
      messages: [
        { role: 'system', content: 'أنت محرر نمو لحساب First1Saudi على X. حلل المسودة دون اختلاق حقائق. أخرج JSON فقط: originalScore رقم 0-100، strengths مصفوفة قصيرة، risks مصفوفة قصيرة، variants ثلاث عناصر objectives بالترتيب replies/shares/follows ولكل منها label وtext وscore وrationale. اجعل كل نسخة عربية رسمية دافئة، أقل من 280 حرفًا، لا تطلب إعجابًا أو إعادة نشر، ولا تستخدم تلاعبًا أو وعودًا غير موثقة. نسخة الردود تسأل سؤالًا نوعيًا، نسخة المشاركة تقدم قيمة مرجعية، ونسخة المتابعة توضح وعد الحساب التحريري.' },
        { role: 'user', content: draft.trim() },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.55,
    })
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Omit<DraftAnalysis, 'analyzedAt'>
    if (!Array.isArray(parsed.variants) || parsed.variants.length !== 3) throw new Error('invalid variants')
    analysis = { ...parsed, analyzedAt: new Date().toISOString() }
  } catch {
    analysis = heuristicDraftAnalysis(draft)
  }
  const service = await createServiceRoleClient()
  const { error } = await service.from('x_growth_workspace').upsert({
    id: true,
    last_draft_analysis: analysis,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) throw new Error(`تعذّر حفظ تحليل المسودة: ${error.message}`)
  return analysis
}

export async function regenerateWeeklyPlan(userId: string) {
  const insights = await getXInsights('365d')
  const plan = makeWeeklyPlan(insights)
  const service = await createServiceRoleClient()
  const { error } = await service.from('x_growth_workspace').upsert({
    id: true,
    weekly_plan: plan,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) throw new Error(`تعذّر حفظ الخطة الأسبوعية: ${error.message}`)
  return plan
}

export async function createGrowthExperiment(input: {
  name: string
  hypothesis: string
  primaryMetric: GrowthExperiment['primary_metric']
  variantA: string
  variantB: string
}, userId: string) {
  if ([input.name, input.hypothesis, input.variantA, input.variantB].some(value => value.trim().length < 4)) {
    throw new Error('أكمل اسم التجربة والفرضية والنسختين')
  }
  const service = await createServiceRoleClient()
  const { data, error } = await service.from('x_growth_experiments').insert({
    name: input.name.trim(),
    hypothesis: input.hypothesis.trim(),
    primary_metric: input.primaryMetric,
    variant_a: { text: input.variantA.trim() },
    variant_b: { text: input.variantB.trim() },
    created_by: userId,
  }).select('id,name,hypothesis,primary_metric,variant_a,variant_b,status,result,created_at').single()
  if (error) throw new Error(`تعذّر إنشاء التجربة: ${error.message}`)
  return data as GrowthExperiment
}

export async function updateGrowthExperimentStatus(id: string, status: GrowthExperiment['status']) {
  const service = await createServiceRoleClient()
  const { data, error } = await service.from('x_growth_experiments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id,name,hypothesis,primary_metric,variant_a,variant_b,status,result,created_at')
    .single()
  if (error) throw new Error(`تعذّر تحديث التجربة: ${error.message}`)
  return data as GrowthExperiment
}

export async function updateConversationStatus(postId: string, status: GrowthConversation['status']) {
  const service = await createServiceRoleClient()
  const { error } = await service.from('x_growth_conversations').update({ status, updated_at: new Date().toISOString() }).eq('x_post_id', postId)
  if (error) throw new Error(`تعذّر تحديث المحادثة: ${error.message}`)
  return { postId, status }
}

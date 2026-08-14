'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type {
  DraftAnalysis,
  GrowthConversation,
  GrowthExperiment,
  WeeklyPlan,
  XGrowthDashboard,
} from '@/lib/x-growth'

type Tab = 'monitor' | 'optimizer' | 'conversations' | 'alerts' | 'plan' | 'experiments'

const tabs: Array<{ id: Tab; label: string; number: string }> = [
  { id: 'monitor', label: 'مراقب الأداء', number: '١' },
  { id: 'optimizer', label: 'محسن المنشور', number: '٢' },
  { id: 'conversations', label: 'فرص المحادثة', number: '٣' },
  { id: 'alerts', label: 'تنبيهات الانتشار', number: '٤' },
  { id: 'plan', label: 'الخطة الأسبوعية', number: '٥' },
  { id: 'experiments', label: 'مختبر التجارب', number: '٦' },
]

async function postAction<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/admin/x-growth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'تعذّر تنفيذ الإجراء')
  return data as T
}

function SectionIntro({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-green text-lg font-black text-white">{number}</span>
      <div><h2 className="text-xl font-black text-dark">{title}</h2><p className="mt-1 text-sm leading-6 text-muted">{description}</p></div>
    </div>
  )
}

export default function XGrowthCenter({ initial }: { initial: XGrowthDashboard }) {
  const { showToast } = useToast()
  const [tab, setTab] = useState<Tab>('monitor')
  const [draft, setDraft] = useState('')
  const [analysis, setAnalysis] = useState<DraftAnalysis | null>(initial.lastDraftAnalysis)
  const [plan, setPlan] = useState<WeeklyPlan>(initial.weeklyPlan)
  const [experiments, setExperiments] = useState<GrowthExperiment[]>(initial.experiments)
  const [conversations, setConversations] = useState<GrowthConversation[]>(initial.conversations)
  const [busy, setBusy] = useState<string | null>(null)
  const [experiment, setExperiment] = useState({
    name: '', hypothesis: '', primaryMetric: 'reply_rate' as GrowthExperiment['primary_metric'], variantA: '', variantB: '',
  })

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key)
    try { await task() } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّر تنفيذ الإجراء', 'error')
    } finally { setBusy(null) }
  }

  const optimize = () => run('optimize', async () => {
    const data = await postAction<{ analysis: DraftAnalysis }>({ action: 'optimize', draft })
    setAnalysis(data.analysis)
    showToast('تم تحليل المسودة وإنتاج ثلاث نسخ', 'success')
  })

  const regeneratePlan = () => run('plan', async () => {
    const data = await postAction<{ plan: WeeklyPlan }>({ action: 'plan' })
    setPlan(data.plan)
    showToast('تم تحديث الخطة الأسبوعية', 'success')
  })

  const createExperiment = () => run('experiment', async () => {
    const data = await postAction<{ experiment: GrowthExperiment }>({ action: 'experiment', ...experiment })
    setExperiments(current => [data.experiment, ...current])
    setExperiment({ name: '', hypothesis: '', primaryMetric: 'reply_rate', variantA: '', variantB: '' })
    showToast('تم إنشاء التجربة في وضع المسودة', 'success')
  })

  const updateExperiment = (id: string, status: GrowthExperiment['status']) => run(`experiment-${id}`, async () => {
    const data = await postAction<{ experiment: GrowthExperiment }>({ action: 'experimentStatus', id, status })
    setExperiments(current => current.map(item => item.id === id ? data.experiment : item))
    showToast(status === 'running' ? 'بدأت التجربة' : 'تم تحديث حالة التجربة', 'success')
  })

  const updateConversation = (postId: string, status: GrowthConversation['status']) => run(`conversation-${postId}`, async () => {
    await postAction({ action: 'conversation', postId, status })
    setConversations(current => current.map(item => item.x_post_id === postId ? { ...item, status } : item))
    showToast('تم تحديث حالة المحادثة', 'success')
  })

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    showToast('تم نسخ النص', 'success')
  }

  return (
    <section className="rounded-3xl border border-border bg-card p-4 shadow-sm md:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-black text-green">مساعد نمو شبه آلي</p><h2 className="mt-1 text-2xl font-black text-dark">مركز دعم الحساب</h2></div>
        <p className="max-w-xl text-xs leading-6 text-muted">التحليل والتوصيات آلية، أما النشر والرد والمتابعة فتظل بموافقة المشرف لحماية جودة الحساب والالتزام بسياسات X.</p>
      </div>

      <nav className="mb-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-6" aria-label="أدوات نمو الحساب">
        {tabs.map(item => (
          <button key={item.id} onClick={() => setTab(item.id)} className={`rounded-xl border px-3 py-3 text-right text-xs font-black transition ${tab === item.id ? 'border-green bg-green text-white shadow-md' : 'border-border bg-white text-muted hover:border-green/40 hover:text-dark'}`}>
            <span className="ml-1 opacity-70">{item.number}</span> {item.label}
          </button>
        ))}
      </nav>

      {tab === 'monitor' && (
        <div>
          <SectionIntro number="١" title="مراقب أداء المنشور" description={`يقارن الردود والمشاركة لكل ألف ظهور ويتابع سرعة النمو عبر ${initial.snapshotCount} لقطة محفوظة.`} />
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[760px] text-right text-xs">
              <thead className="bg-black/[0.035] text-muted"><tr><th className="p-3">المنشور</th><th className="p-3">العمر</th><th className="p-3">الظهور</th><th className="p-3">رد/ألف</th><th className="p-3">مشاركة/ألف</th><th className="p-3">سرعة الظهور</th><th className="p-3">الحالة</th></tr></thead>
              <tbody className="divide-y divide-border">
                {initial.pulses.map(item => <tr key={item.postId}>
                  <td className="max-w-[330px] p-3"><a href={item.postUrl} target="_blank" rel="noreferrer" className="line-clamp-2 font-bold text-dark hover:text-green">{item.text}</a></td>
                  <td className="p-3 text-muted">{item.ageHours} س</td><td className="p-3 font-bold">{item.impressions.toLocaleString('ar-SA')}</td><td className="p-3">{item.replyRate}</td><td className="p-3">{item.shareRate}</td><td className="p-3">{item.velocity === null ? 'بانتظار لقطة ثانية' : `${item.velocity}/س`}</td>
                  <td className="p-3"><span className="rounded-full bg-green/10 px-2 py-1 font-bold text-green">{item.status}</span></td>
                </tr>)}
              </tbody>
            </table>
            {!initial.pulses.length && <p className="p-10 text-center text-sm text-muted">ستظهر المنشورات هنا بعد أول مزامنة ناجحة مع X.</p>}
          </div>
        </div>
      )}

      {tab === 'optimizer' && (
        <div>
          <SectionIntro number="٢" title="محسن المنشور قبل النشر" description="يقيّم المسودة ويولد نسخة للحوار، وأخرى للمشاركة، وثالثة لرفع نية المتابعة دون طلب تفاعل مصطنع." />
          <textarea value={draft} onChange={event => setDraft(event.target.value)} rows={5} maxLength={1000} placeholder="ألصق مسودة المنشور هنا..." className="w-full rounded-2xl border border-border bg-white p-4 text-sm leading-7 text-dark outline-none focus:border-green" />
          <div className="mt-3 flex items-center justify-between"><span className="text-xs text-muted">{draft.length}/1000</span><Button onClick={optimize} loading={busy === 'optimize'} disabled={draft.trim().length < 12}>تحليل وتحسين المسودة</Button></div>
          {analysis && <div className="mt-6 space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {analysis.variants.map(variant => <article key={variant.objective} className="rounded-2xl border border-border bg-white p-4">
                <div className="flex items-center justify-between"><h3 className="font-black text-dark">{variant.label}</h3><b className="text-green">{variant.score}/100</b></div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-dark">{variant.text}</p><p className="mt-3 text-xs leading-5 text-muted">{variant.rationale}</p>
                <button onClick={() => copy(variant.text)} className="mt-3 text-xs font-black text-green hover:underline">نسخ النسخة</button>
              </article>)}
            </div>
            <div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-green/5 p-3 text-xs leading-6"><b>نقاط القوة:</b> {analysis.strengths.join(' • ')}</div><div className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900"><b>المخاطر:</b> {analysis.risks.join(' • ')}</div></div>
          </div>}
        </div>
      )}

      {tab === 'conversations' && (
        <div>
          <SectionIntro number="٣" title="مركز فرص المحادثة" description="يجمع الردود والإشارات الواردة التي بدأها المستخدمون، ثم يضعها في قائمة مراجعة بشرية." />
          <div className="space-y-3">
            {conversations.map(item => <article key={item.x_post_id} className="rounded-2xl border border-border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xs text-muted"><b className="text-dark">@{item.author_username ?? 'مستخدم X'}</b> · {item.conversation_type === 'reply' ? 'رد' : item.conversation_type === 'quote' ? 'اقتباس' : 'إشارة'}</div><span className="rounded-full bg-black/5 px-2 py-1 text-xs">{item.status}</span></div>
              <a href={item.post_url} target="_blank" rel="noreferrer" className="mt-3 block text-sm font-bold leading-7 text-dark hover:text-green">{item.post_text}</a>
              <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => updateConversation(item.x_post_id, 'reviewed')} loading={busy === `conversation-${item.x_post_id}`}>تمت المراجعة</Button><Button size="sm" variant="ghost" onClick={() => updateConversation(item.x_post_id, 'dismissed')}>تجاهل</Button><a href={item.post_url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center px-3 text-xs font-black text-green">فتح للرد في X</a></div>
            </article>)}
            {!conversations.length && <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">ستظهر الردود والإشارات هنا بعد مزامنة الربط.</p>}
          </div>
        </div>
      )}

      {tab === 'alerts' && (
        <div>
          <SectionIntro number="٤" title="تنبيهات نافذة الانتشار" description="يرصد الوصول بلا محادثة، والتضخيم المرتفع، والردود المتروكة، ويقترح الإجراء التالي." />
          <div className="grid gap-3 md:grid-cols-2">
            {initial.alerts.map(alert => <article key={alert.id} className={`rounded-2xl border p-4 ${alert.severity === 'high' ? 'border-red-200 bg-red-50' : alert.severity === 'medium' ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
              <h3 className="font-black text-dark">{alert.title}</h3><p className="mt-2 text-xs leading-6 text-muted">{alert.detail}</p><p className="mt-2 text-sm font-bold text-dark">{alert.action}</p>{alert.postUrl && <a href={alert.postUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-black text-green">فتح المنشور</a>}
            </article>)}
          </div>
        </div>
      )}

      {tab === 'plan' && (
        <div>
          <SectionIntro number="٥" title="مولد الخطة الأسبوعية" description="يحوّل نتائج الحساب إلى مهام تحريرية يومية وأهداف قابلة للقياس." />
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-green/5 p-4"><div><p className="text-xs font-black text-green">تركيز الأسبوع</p><p className="mt-1 max-w-3xl text-sm font-bold leading-7 text-dark">{plan.focus}</p></div><Button size="sm" variant="outline" onClick={regeneratePlan} loading={busy === 'plan'}>تحديث الخطة</Button></div>
          <div className="grid gap-3 md:grid-cols-3">{plan.targets.map(target => <div key={target.label} className="rounded-xl border border-border bg-white p-3"><p className="text-xs text-muted">{target.label}</p><b className="mt-1 block text-dark">{target.value}</b></div>)}</div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">{plan.actions.map(action => <article key={action.day} className="flex gap-3 rounded-xl border border-border bg-white p-3"><b className="min-w-16 text-green">{action.day}</b><div><p className="text-sm font-bold text-dark">{action.task}</p><p className="mt-1 text-xs text-muted">{action.purpose}</p></div></article>)}</div>
        </div>
      )}

      {tab === 'experiments' && (
        <div>
          <SectionIntro number="٦" title="مختبر تجارب المحتوى" description="يسجل فرضية ونسختين مختلفتين معنويًا، ثم تُنشران في أوقات منفصلة وتُقارن النتيجة بعد تطبيعها حسب الظهور." />
          <div className="grid gap-3 rounded-2xl border border-border bg-white p-4 md:grid-cols-2">
            <input value={experiment.name} onChange={event => setExperiment(current => ({ ...current, name: event.target.value }))} placeholder="اسم التجربة" className="rounded-xl border border-border p-3 text-sm outline-none focus:border-green" />
            <select value={experiment.primaryMetric} onChange={event => setExperiment(current => ({ ...current, primaryMetric: event.target.value as GrowthExperiment['primary_metric'] }))} className="rounded-xl border border-border p-3 text-sm outline-none focus:border-green"><option value="reply_rate">معدل الرد</option><option value="share_rate">معدل المشاركة</option><option value="follow_intent">نية المتابعة</option><option value="engagement_rate">معدل التفاعل</option></select>
            <input value={experiment.hypothesis} onChange={event => setExperiment(current => ({ ...current, hypothesis: event.target.value }))} placeholder="الفرضية: السؤال المحدد يرفع الردود..." className="rounded-xl border border-border p-3 text-sm outline-none focus:border-green md:col-span-2" />
            <textarea value={experiment.variantA} onChange={event => setExperiment(current => ({ ...current, variantA: event.target.value }))} rows={4} placeholder="النسخة A" className="rounded-xl border border-border p-3 text-sm outline-none focus:border-green" />
            <textarea value={experiment.variantB} onChange={event => setExperiment(current => ({ ...current, variantB: event.target.value }))} rows={4} placeholder="النسخة B" className="rounded-xl border border-border p-3 text-sm outline-none focus:border-green" />
            <div className="md:col-span-2"><Button onClick={createExperiment} loading={busy === 'experiment'}>حفظ تجربة جديدة</Button></div>
          </div>
          <div className="mt-4 space-y-2">{experiments.map(item => <article key={item.id} className="rounded-xl border border-border bg-white p-4"><div className="flex items-center justify-between gap-2"><h3 className="font-black text-dark">{item.name}</h3><span className="rounded-full bg-black/5 px-2 py-1 text-xs">{item.status}</span></div><p className="mt-1 text-xs text-muted">{item.hypothesis}</p><div className="mt-3 grid gap-2 md:grid-cols-2"><p className="rounded-lg bg-black/[0.025] p-3 text-xs leading-6"><b>A:</b> {item.variant_a.text}</p><p className="rounded-lg bg-black/[0.025] p-3 text-xs leading-6"><b>B:</b> {item.variant_b.text}</p></div><div className="mt-3 flex gap-2">{item.status === 'draft' && <Button size="sm" variant="outline" onClick={() => updateExperiment(item.id, 'running')} loading={busy === `experiment-${item.id}`}>بدء التجربة</Button>}{item.status === 'running' && <Button size="sm" variant="outline" onClick={() => updateExperiment(item.id, 'completed')} loading={busy === `experiment-${item.id}`}>إنهاء التجربة</Button>}</div></article>)}</div>
        </div>
      )}
    </section>
  )
}

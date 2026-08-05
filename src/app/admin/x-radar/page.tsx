'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useToast } from '@/components/ui/Toast'

type RadarItem = {
  id: string; source_type: 'verified_topic' | 'verified_reply_to_first1'; author_username: string | null
  author_name: string | null; post_text: string; post_url: string; relevance_score: number
  recommendation: 'reply' | 'quote' | 'ignore'; draft_text: string | null; status: 'pending' | 'approved' | 'ignored'
}

export default function XRadarPage() {
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()
  const [items, setItems] = useState<RadarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [automationApproved, setAutomationApproved] = useState(false)

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/x-radar')
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error ?? 'تعذر تحميل الرادار')
    setItems(data.items ?? [])
    setAutomationApproved(Boolean(data.automationApproved))
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.push('/dashboard'); return }
      try { await load() } catch (error) { showToast(error instanceof Error ? error.message : 'تعذر التحميل', 'error') }
      setLoading(false)
    }
    init()
  }, [load, router, showToast, supabase])

  const action = async (id: string | null, type: 'scan' | 'generate' | 'update' | 'publish', patch: Record<string, unknown> = {}) => {
    setBusy(id ?? type)
    try {
      const response = await fetch('/api/admin/x-radar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: type, id, ...patch }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'تعذر تنفيذ الطلب')
      await load()
      showToast(type === 'scan' ? `تم الفحص: ${data.found ?? 0} منشور` : type === 'publish' ? 'تم النشر في X' : 'تم الحفظ', 'success')
    } catch (error) { showToast(error instanceof Error ? error.message : 'تعذر تنفيذ الطلب', 'error') }
    finally { setBusy(null) }
  }

  if (loading) return <div className="p-6 flex justify-center"><LoadingSpinner /></div>

  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto space-y-5" dir="rtl">
      <header className="flex flex-wrap gap-3 items-start justify-between border-b border-border pb-5">
        <div><h1 className="text-2xl font-black text-dark">رادار أول سعودي في X</h1><p className="text-sm text-muted mt-1">يرصد المنشورات والردود من الحسابات الموثقة فقط، ويولّد مسودات للمراجعة.</p></div>
        <Button onClick={() => action(null, 'scan')} loading={busy === 'scan'}>فحص الآن</Button>
      </header>
      <section className="border border-border bg-card p-4 rounded-lg flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-bold text-dark">النشر التلقائي</h2><p className="text-xs text-muted">يبقى مغلقا إلى أن تصدر موافقة X الخطية على بوت الردود بالذكاء الاصطناعي.</p></div>
        <label className="flex items-center gap-2 text-sm font-bold text-muted"><input type="checkbox" checked={false} disabled={!automationApproved} onChange={() => undefined} /> تفعيل النشر التلقائي</label>
      </section>
      <div className="space-y-3">
        {items.length === 0 && <div className="text-center py-14 text-muted border border-dashed border-border rounded-lg">لا توجد نتائج بعد. اربط X ثم اضغط «فحص الآن».</div>}
        {items.map(item => <article key={item.id} className="border border-border bg-card p-4 rounded-lg space-y-3">
          <div className="flex flex-wrap justify-between gap-2"><div><a href={item.post_url} target="_blank" rel="noreferrer" className="font-bold text-dark hover:text-green">@{item.author_username ?? item.author_name ?? 'حساب موثق'}</a><span className="text-xs text-muted mr-2">{item.source_type === 'verified_reply_to_first1' ? 'رد موثق على أول سعودي' : 'منشور موثق مرتبط بالاهتمامات'}</span></div><span className="text-xs text-green font-bold">ملاءمة {item.relevance_score}%</span></div>
          <p className="text-sm text-dark whitespace-pre-wrap leading-7">{item.post_text}</p>
          <textarea value={item.draft_text ?? ''} onChange={event => setItems(current => current.map(value => value.id === item.id ? { ...value, draft_text: event.target.value } : value))} placeholder="ولّد مسودة تفاعل أو اكتبها هنا" className="w-full min-h-20 border border-border rounded-lg p-3 text-sm" />
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => action(item.id, 'generate')} loading={busy === item.id}>توليد مسودة</Button><Button size="sm" variant="outline" onClick={() => action(item.id, 'update', { draft: item.draft_text, status: 'approved', recommendation: item.recommendation })}>اعتماد للمراجعة النهائية</Button>{item.status === 'approved' && <Button size="sm" onClick={() => { if (window.confirm('سيُنشر النص في X بالشكل المختار. هل تؤكد؟')) action(item.id, 'publish', { draft: item.draft_text }) }} loading={busy === item.id}>نشر في X</Button>}<Button size="sm" variant="outline" onClick={() => action(item.id, 'update', { status: 'ignored' })}>تجاهل</Button></div>
        </article>)}
      </div>
    </main>
  )
}

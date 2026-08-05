'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useToast } from '@/components/ui/Toast'

type RadarItem = {
  id: string; source_type: 'verified_topic' | 'verified_reply_to_first1' | 'saudi_cabinet'; author_username: string | null
  author_name: string | null; post_text: string; post_url: string; relevance_score: number
  recommendation: 'reply' | 'quote' | 'ignore'; draft_text: string | null; status: 'pending' | 'approved' | 'ignored' | 'published'
}

type RadarScan = { id: string; trigger: 'manual' | 'scheduled'; window_start: string; window_end: string; found: number; triggered_at: string }
type RadarHistoryItem = { id: string; source_type: RadarItem['source_type']; author_username: string | null; author_name: string | null; post_text: string; post_url: string; relevance_score: number }

export default function XRadarPage() {
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()
  const [items, setItems] = useState<RadarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [automationApproved, setAutomationApproved] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current')
  const [history, setHistory] = useState<RadarScan[]>([])
  const [historyItems, setHistoryItems] = useState<RadarHistoryItem[]>([])
  const [historyBusy, setHistoryBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/x-radar')
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error ?? 'تعذر تحميل الرادار')
    const nextItems = data.items ?? []
    setItems(nextItems)
    setSelectedIds(current => new Set([...current].filter(id => nextItems.some((item: RadarItem) => item.id === id))))
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

  const action = async (id: string | null, type: 'scan' | 'generate' | 'generate_all' | 'update' | 'approve_selected' | 'publish' | 'publish_selected', patch: Record<string, unknown> = {}) => {
    setBusy(id ?? type)
    try {
      const response = await fetch('/api/admin/x-radar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: type, id, ...patch }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'تعذر تنفيذ الطلب')
      if (type === 'scan') setActiveTab('current')
      if (data.item?.id) {
        setItems(current => current.map(item => item.id === data.item.id ? data.item as RadarItem : item))
      } else {
        await load()
      }
      showToast(type === 'scan'
        ? data.found
          ? `تم الفحص: ${data.found} منشور موثق`
          : `لم تظهر نتائج موثقة بعد. نتائج مطابقة: ${data.matchingTopics ?? 0} منشور و${data.matchingReplies ?? 0} رد و${data.matchingCabinetPosts ?? 0} خبر رسمي`
        : type === 'generate'
          ? data.item?.draft_text
            ? 'تم توليد المسودة. راجع النص ثم اعتمده.'
            : 'لم يُقترح تفاعل لهذا المنشور. يمكنك كتابة مسودة يدوية إن رغبت.'
        : type === 'generate_all' ? `تم تقييم ${data.inspected ?? 0} منشور وتوليد ${data.generated ?? 0} مسودة`
          : type === 'approve_selected' ? `تم اعتماد ${data.approved ?? 0} مسودة للنشر`
            : type === 'publish_selected' ? `تم نشر ${data.published ?? 0} تفاعل في X`
              : type === 'publish' ? 'تم النشر في X' : 'تم الحفظ', 'success')
    } catch (error) { showToast(error instanceof Error ? error.message : 'تعذر تنفيذ الطلب', 'error') }
    finally { setBusy(null) }
  }

  const loadHistory = async () => {
    setHistoryBusy('list')
    try {
      const response = await fetch('/api/admin/x-radar?view=history')
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'تعذر تحميل سجل البحث')
      setHistory(data.scans ?? [])
      setHistoryItems([])
      setActiveTab('history')
    } catch (error) { showToast(error instanceof Error ? error.message : 'تعذر تحميل سجل البحث', 'error') }
    finally { setHistoryBusy(null) }
  }

  const loadHistoryItems = async (scanId: string) => {
    setHistoryBusy(scanId)
    try {
      const response = await fetch(`/api/admin/x-radar?scanId=${encodeURIComponent(scanId)}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'تعذر تحميل نتائج الفحص')
      setHistoryItems(data.items ?? [])
    } catch (error) { showToast(error instanceof Error ? error.message : 'تعذر تحميل نتائج الفحص', 'error') }
    finally { setHistoryBusy(null) }
  }

  const selectableIds = items
    .filter(item => item.status !== 'published' && Boolean(item.draft_text?.trim()) && item.recommendation !== 'ignore')
    .map(item => item.id)
  const selectedCount = selectableIds.filter(id => selectedIds.has(id)).length
  const toggleItem = (id: string) => setSelectedIds(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const toggleAll = () => setSelectedIds(() => {
    if (selectedCount === selectableIds.length) return new Set()
    return new Set(selectableIds)
  })

  if (loading) return <div className="p-6 flex justify-center"><LoadingSpinner /></div>

  return (
    <main className="p-4 md:p-6 max-w-5xl mx-auto space-y-5" dir="rtl">
      <header className="flex flex-wrap gap-3 items-start justify-between border-b border-border pb-5">
        <div><h1 className="text-2xl font-black text-dark">رادار أول سعودي في X</h1><p className="text-sm text-muted mt-1">يرصد خلال آخر 48 ساعة المنشورات والردود الموثقة، وأخبار مجلس الوزراء ذات الأثر الوطني الإيجابي.</p></div>
        <Button onClick={() => action(null, 'scan')} loading={busy === 'scan'}>بحث يدوي الآن</Button>
      </header>
      <nav className="flex gap-2" aria-label="تبويبات الرادار"><Button size="sm" variant={activeTab === 'current' ? 'primary' : 'outline'} onClick={() => setActiveTab('current')}>نتائج الفحص الحالية</Button><Button size="sm" variant={activeTab === 'history' ? 'primary' : 'outline'} onClick={loadHistory} loading={historyBusy === 'list'}>سجل البحث</Button></nav>
      <div className={activeTab === 'current' ? 'space-y-5' : 'hidden'}>
      <section className="border border-border bg-card p-4 rounded-lg flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-bold text-dark">النشر التلقائي</h2><p className="text-xs text-muted">يبقى مغلقا إلى أن تصدر موافقة X الخطية على بوت الردود بالذكاء الاصطناعي.</p></div>
        <label className="flex items-center gap-2 text-sm font-bold text-muted"><input type="checkbox" checked={false} disabled={!automationApproved} onChange={() => undefined} /> تفعيل النشر التلقائي</label>
      </section>
      <section className="border border-border bg-card p-4 rounded-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm font-bold text-dark"><input type="checkbox" checked={selectableIds.length > 0 && selectedCount === selectableIds.length} onChange={toggleAll} disabled={!selectableIds.length} /> تحديد كل المسودات القابلة للنشر ({selectedCount})</label><Button size="sm" variant="outline" onClick={() => action(null, 'generate_all')} loading={busy === 'generate_all'}>توليد المسودات للكل</Button></div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!selectedCount} onClick={() => action(null, 'approve_selected', { ids: [...selectedIds] })} loading={busy === 'approve_selected'}>اعتماد المحدد للنشر</Button><Button size="sm" disabled={!selectedCount} onClick={() => { if (window.confirm(`سيتم نشر ${selectedCount} رد أو اقتباس في X. هل تؤكد؟`)) action(null, 'publish_selected', { ids: [...selectedIds] }) }} loading={busy === 'publish_selected'}>نشر المحدد في X</Button></div>
      </section>
      <div className="space-y-3">
        {items.length === 0 && <div className="text-center py-14 text-muted border border-dashed border-border rounded-lg">لا توجد نتائج بعد. اربط X ثم اضغط «فحص الآن».</div>}
        {items.map(item => <article key={item.id} className="border border-border bg-card p-4 rounded-lg space-y-3">
          <div className="flex flex-wrap justify-between gap-2"><div className="flex items-center gap-2"><input type="checkbox" checked={selectedIds.has(item.id)} disabled={!selectableIds.includes(item.id)} onChange={() => toggleItem(item.id)} /><a href={item.post_url} target="_blank" rel="noreferrer" className="font-bold text-dark hover:text-green">@{item.author_username ?? item.author_name ?? 'حساب موثق'}</a><span className="text-xs text-muted mr-2">{item.source_type === 'verified_reply_to_first1' ? 'رد موثق على أول سعودي' : item.source_type === 'saudi_cabinet' ? 'خبر رسمي من واس مرتبط بإنجاز وطني' : 'منشور موثق مرتبط بالاهتمامات'}</span></div><span className={`text-xs font-bold ${item.status === 'published' ? 'text-green' : item.relevance_score >= 80 ? 'text-green' : 'text-dark'}`}>{item.status === 'published' ? 'تم النشر' : item.relevance_score >= 80 ? `صلة مباشرة ${item.relevance_score}%` : `فرصة ربط تحفيزية ${item.relevance_score}%`}</span></div>
          <p className="text-sm text-dark whitespace-pre-wrap leading-7">{item.post_text}</p>
          <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-muted">نوع التفاعل:</span><div className="inline-flex border border-border rounded-lg overflow-hidden"><button type="button" onClick={() => action(item.id, 'update', { draft: item.draft_text, recommendation: 'reply' })} className={`px-3 py-1.5 text-xs font-bold ${item.recommendation === 'reply' ? 'bg-green text-white' : 'text-dark'}`}>رد</button><button type="button" onClick={() => action(item.id, 'update', { draft: item.draft_text, recommendation: 'quote' })} className={`px-3 py-1.5 text-xs font-bold border-r border-border ${item.recommendation === 'quote' ? 'bg-green text-white' : 'text-dark'}`}>اقتباس</button></div><span className="text-xs text-muted">{item.recommendation === 'reply' ? 'سينشر النص كـرد على المنشور.' : item.recommendation === 'quote' ? 'سينشر النص كاقتباس للمنشور.' : 'اختر طريقة النشر قبل الاعتماد.'}</span></div>
          <textarea value={item.draft_text ?? ''} onChange={event => setItems(current => current.map(value => value.id === item.id ? { ...value, draft_text: event.target.value } : value))} placeholder="ولّد مسودة تفاعل أو اكتبها هنا" className="w-full min-h-20 border border-border rounded-lg p-3 text-sm" />
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => action(item.id, 'generate')} loading={busy === item.id}>توليد مسودة</Button><Button size="sm" variant="outline" disabled={!item.draft_text?.trim() || item.recommendation === 'ignore'} onClick={() => action(item.id, 'update', { draft: item.draft_text, status: 'approved', recommendation: item.recommendation })}>اعتماد للنشر</Button>{item.status === 'approved' && <Button size="sm" onClick={() => { if (window.confirm(`سيُنشر النص في X كـ${item.recommendation === 'quote' ? 'اقتباس' : 'رد'}. هل تؤكد؟`)) action(item.id, 'publish', { draft: item.draft_text, recommendation: item.recommendation }) }} loading={busy === item.id}>نشر في X</Button>}<Button size="sm" variant="outline" onClick={() => action(item.id, 'update', { status: 'ignored' })}>تجاهل</Button></div>
        </article>)}
      </div>
      </div>
      {activeTab === 'history' && <section className="space-y-3">
        {history.length === 0 && <div className="text-center py-14 text-muted border border-dashed border-border rounded-lg">لا يوجد سجل بحث بعد.</div>}
        {history.map(scan => <article key={scan.id} className="border border-border bg-card p-4 rounded-lg flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-dark">{scan.trigger === 'manual' ? 'بحث يدوي' : 'فحص مجدول'}</h2><p className="text-xs text-muted mt-1">{new Date(scan.triggered_at).toLocaleString('ar-SA')} · آخر 48 ساعة · {scan.found} نتيجة</p></div><Button size="sm" variant="outline" onClick={() => loadHistoryItems(scan.id)} loading={historyBusy === scan.id}>عرض النتائج</Button></article>)}
        {historyItems.length > 0 && <div className="space-y-3 pt-2">{historyItems.map(item => <article key={item.id} className="border border-border bg-card p-4 rounded-lg"><div className="flex justify-between gap-3"><a href={item.post_url} target="_blank" rel="noreferrer" className="font-bold text-dark hover:text-green">@{item.author_username ?? item.author_name ?? 'حساب موثق'}</a><span className="text-xs text-green font-bold">صلة مباشرة {item.relevance_score}%</span></div><p className="text-sm text-dark whitespace-pre-wrap leading-7 mt-3">{item.post_text}</p></article>)}</div>}
      </section>}
    </main>
  )
}

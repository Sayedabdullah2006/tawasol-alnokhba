'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useToast } from '@/components/ui/Toast'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import type { InventorStoreProduct } from '@/lib/inventor-store'
import type { InventorStoreStudioDefinition } from '@/lib/inventor-store-studios'
import { formatDate, formatNumber, generateRequestNumber } from '@/lib/utils'

type ChecklistItem = { label: string; done: boolean }
type DeliveryFile = { label: string; url: string; path?: string; format?: string }
type VersionRecord = {
  id: string
  version: number
  change_note?: string | null
  created_at: string
}
type DeliverableRecord = {
  id: string
  deliverable_key: string
  title: string
  kind: string
  status: string
  content: Record<string, string>
  checklist: ChecklistItem[]
  delivery_files: DeliveryFile[]
  internal_notes?: string | null
  version: number
  versions: VersionRecord[]
}
type RequestRecord = {
  id: string
  request_number: number
  title: string
  content: string
  content_images?: string[] | null
  supporting_documents?: Array<{ url: string; name?: string; mimeType?: string }> | null
  status: string
  client_name: string
  client_email: string
  client_phone?: string | null
  created_at: string
  preferred_date?: string | null
  final_total?: number | null
  admin_quoted_price?: number | null
}
type WorkspaceRecord = { id: string; status: string; internal_notes?: string | null }
type WorkspacePayload = {
  request: RequestRecord
  product: InventorStoreProduct
  studio: InventorStoreStudioDefinition
  workspace: WorkspaceRecord
  deliverables: DeliverableRecord[]
}

const DELIVERABLE_STATUS: Record<string, string> = {
  pending: 'لم يبدأ',
  drafting: 'قيد الإعداد',
  internal_review: 'مراجعة داخلية',
  ready: 'جاهز للتسليم',
  sent: 'أُرسل للعميل',
  changes_requested: 'تعديلات مطلوبة',
  approved: 'معتمد',
}

const WORKSPACE_STATUS: Record<string, string> = {
  not_started: 'لم يبدأ',
  in_progress: 'قيد التنفيذ',
  internal_review: 'مراجعة داخلية',
  ready_for_delivery: 'جاهز للتسليم',
  completed: 'مكتمل',
}

const KIND_LABEL: Record<string, string> = {
  report: 'تقرير', matrix: 'مصفوفة', research: 'بحث', plan: 'خطة', document: 'وثيقة',
  infographic: 'إنفوجرافيك', presentation: 'عرض', script: 'نص', video: 'فيديو', webpage: 'صفحة رقمية',
  media_kit: 'ملف إعلامي', partner_map: 'خريطة شركاء', content_pack: 'حزمة محتوى',
}

function statusClass(status: string) {
  if (status === 'approved' || status === 'ready') return 'bg-emerald-50 text-emerald-800 border-emerald-200'
  if (status === 'changes_requested') return 'bg-red-50 text-red-800 border-red-200'
  if (status === 'internal_review') return 'bg-amber-50 text-amber-800 border-amber-200'
  if (status === 'drafting') return 'bg-blue-50 text-blue-800 border-blue-200'
  return 'bg-white/65 text-muted border-border'
}

export default function InventorStoreWorkspace({ requestId }: { requestId: string }) {
  const { showToast } = useToast()
  const [payload, setPayload] = useState<WorkspacePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeKey, setActiveKey] = useState('')
  const [content, setContent] = useState<Record<string, string>>({})
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [deliveryFiles, setDeliveryFiles] = useState<DeliveryFile[]>([])
  const [internalNotes, setInternalNotes] = useState('')
  const [status, setStatus] = useState('pending')
  const [changeNote, setChangeNote] = useState('')
  const [aiInstruction, setAiInstruction] = useState('')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showBrief, setShowBrief] = useState(false)
  const [showVersions, setShowVersions] = useState(false)

  const activateDeliverable = (item: DeliverableRecord) => {
    setActiveKey(item.deliverable_key)
    setContent(item.content || {})
    setChecklist(item.checklist || [])
    setDeliveryFiles(item.delivery_files || [])
    setInternalNotes(item.internal_notes || '')
    setStatus(item.status || 'pending')
    setChangeNote('')
    setAiInstruction('')
    setShowVersions(false)
  }

  const loadWorkspace = async (preferredKey?: string) => {
    try {
      const response = await fetch(`/api/admin/inventor-store/workspace/${requestId}`, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذّر تحميل الاستديو')
      setPayload(data)
      const selectedKey = preferredKey || activeKey || data.deliverables[0]?.deliverable_key || ''
      const selected = data.deliverables.find((item: DeliverableRecord) => item.deliverable_key === selectedKey) || data.deliverables[0]
      if (selected) activateDeliverable(selected)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّر تحميل الاستديو', 'error')
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadWorkspace() }, [requestId]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeDeliverable = useMemo(
    () => payload?.deliverables.find(item => item.deliverable_key === activeKey) ?? null,
    [activeKey, payload],
  )
  const activeDefinition = useMemo(
    () => payload?.studio.deliverables.find(item => item.key === activeKey) ?? null,
    [activeKey, payload],
  )

  const saveDeliverable = async (createVersion = false) => {
    if (!activeDeliverable) return
    setSaving(true)
    try {
      const response = await fetch(`/api/admin/inventor-store/workspace/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_deliverable', deliverableId: activeDeliverable.id, content, checklist,
          deliveryFiles, internalNotes, status, createVersion, changeNote,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذّر حفظ المخرج')
      showToast(createVersion ? 'تم حفظ إصدار جديد' : 'تم حفظ المسودة')
      await loadWorkspace(activeKey)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّر حفظ المخرج', 'error')
    } finally {
      setSaving(false)
    }
  }

  const generateDraft = async () => {
    if (!activeDefinition) return
    setGenerating(true)
    try {
      const response = await fetch('/api/admin/inventor-store/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, deliverableKey: activeDefinition.key, instruction: aiInstruction }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذّر توليد المسودة')
      setContent(previous => ({ ...previous, ...data.content }))
      if (status === 'pending') setStatus('drafting')
      showToast('تم إعداد مسودة داخل المحرر، راجعها قبل الحفظ')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّر توليد المسودة', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const updateWorkspaceStatus = async (nextStatus: string) => {
    try {
      const response = await fetch(`/api/admin/inventor-store/workspace/${requestId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_workspace', status: nextStatus, internalNotes: payload?.workspace.internal_notes || '' }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذّر تحديث حالة الاستديو')
      setPayload(previous => previous ? { ...previous, workspace: data.workspace } : previous)
      showToast('تم تحديث حالة الاستديو')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّر تحديث حالة الاستديو', 'error')
    }
  }

  const uploadDeliveryFile = async (file: File | undefined) => {
    if (!file || !activeDefinition) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('requestId', requestId)
      form.append('deliverableKey', activeDefinition.key)
      const response = await fetch('/api/admin/inventor-store/upload', { method: 'POST', body: form })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذّر رفع الملف')
      setDeliveryFiles(previous => [...previous, data.file])
      showToast('تم رفع الملف وإضافته للمخرج؛ احفظ المسودة لتثبيته')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّر رفع الملف', 'error')
    } finally {
      setUploading(false)
    }
  }

  const restoreVersion = async (versionId: string) => {
    if (!activeDeliverable || !window.confirm('هل تريد استعادة هذا الإصدار داخل المحرر؟')) return
    try {
      const response = await fetch(`/api/admin/inventor-store/workspace/${requestId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore_version', deliverableId: activeDeliverable.id, versionId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذّرت استعادة الإصدار')
      showToast('تمت استعادة الإصدار')
      await loadWorkspace(activeKey)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّرت استعادة الإصدار', 'error')
    }
  }

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center"><LoadingSpinner size="lg" /></div>
  if (!payload) return <div className="p-8 text-center text-muted">تعذّر تجهيز مساحة العمل لهذا الطلب.</div>

  const completed = payload.deliverables.filter(item => ['ready', 'sent', 'approved'].includes(item.status)).length
  const completion = payload.deliverables.length ? Math.round((completed / payload.deliverables.length) * 100) : 0
  const images = Array.isArray(payload.request.content_images) ? payload.request.content_images : []
  const documents = Array.isArray(payload.request.supporting_documents) ? payload.request.supporting_documents : []

  return (
    <main className="min-h-screen overflow-x-hidden bg-cream/70 px-3 py-5 md:px-6" dir="rtl">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="border-b border-border pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <Link href="/admin/inventor-store-requests" className="mb-2 inline-block text-sm font-bold text-green hover:underline">العودة إلى طلبات المتجر</Link>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-bold text-dark">{payload.product.categoryLabel}</span>
                <span className="text-xs font-bold text-muted">{generateRequestNumber(payload.request.request_number)}</span>
              </div>
              <h1 className="mt-3 text-2xl font-black text-dark md:text-3xl">{payload.studio.title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">{payload.studio.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/admin/requests/${requestId}`} className="inline-flex min-h-11 items-center rounded-lg border border-dark/25 bg-white/65 px-4 text-sm font-bold text-dark hover:bg-white">العرض والدفع والإجراءات</Link>
              <select value={payload.workspace.status} onChange={event => void updateWorkspaceStatus(event.target.value)} className="min-h-11 rounded-lg bg-dark px-4 text-sm font-bold text-white outline-none">
                {Object.entries(WORKSPACE_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div><p className="text-xs text-muted">الخدمة</p><p className="mt-1 font-black text-dark">{payload.product.name}</p></div>
            <div><p className="text-xs text-muted">العميل</p><p className="mt-1 font-black text-dark">{payload.request.client_name}</p></div>
            <div><p className="text-xs text-muted">التقدم</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full bg-green" style={{ width: `${completion}%` }} /></div><p className="mt-1 text-xs font-bold text-green">{completed} من {payload.deliverables.length} مخرجات جاهزة</p></div>
          </div>
        </header>

        <section className="border-b border-border pb-5">
          <button type="button" onClick={() => setShowBrief(value => !value)} className="flex w-full items-center justify-between gap-3 py-2 text-right">
            <span><strong className="block text-lg text-dark">ملف الطلب والمصادر</strong><small className="text-muted">المعلومات الأصلية والصور والوثائق الداعمة</small></span>
            <span className="text-xl text-dark" aria-hidden>{showBrief ? '−' : '+'}</span>
          </button>
          {showBrief && <div className="mt-4 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="min-w-0 rounded-lg border border-border bg-white/55 p-4">
              <h2 className="font-black text-dark">{payload.request.title}</h2>
              <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-muted">{payload.request.content}</pre>
            </div>
            <div className="space-y-4">
              <div><h3 className="mb-2 text-sm font-black text-dark">الصور الشخصية والمرجعية ({images.length})</h3>{images.length ? <div className="grid grid-cols-3 gap-2">{images.map(url => <a key={url} href={url} target="_blank" rel="noreferrer" className="relative aspect-square overflow-hidden rounded-lg border border-border bg-white"><Image src={url} alt="صورة مرفقة" fill unoptimized className="object-contain" /></a>)}</div> : <p className="text-sm text-muted">لا توجد صور مرفقة.</p>}</div>
              <div><h3 className="mb-2 text-sm font-black text-dark">الوثائق الداعمة ({documents.length})</h3>{documents.length ? <div className="space-y-2">{documents.map(document => <a key={document.url} href={document.url} target="_blank" rel="noreferrer" className="block truncate rounded-lg border border-border bg-white/60 px-3 py-2 text-sm font-bold text-dark hover:border-green">{document.name || 'وثيقة داعمة'}</a>)}</div> : <p className="text-sm text-muted">لا توجد وثائق داعمة.</p>}</div>
            </div>
          </div>}
        </section>

        <div className="grid min-w-0 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="min-w-0 lg:sticky lg:top-5 lg:self-start">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black text-dark">مخرجات الخدمة</h2><span className="text-xs font-bold text-muted">{payload.studio.workflowLabel}</span></div>
            <div className="flex snap-x gap-2 overflow-x-auto pb-2 lg:block lg:space-y-2 lg:overflow-visible">
              {payload.deliverables.map(item => {
                const selected = item.deliverable_key === activeKey
                return <button key={item.id} type="button" onClick={() => activateDeliverable(item)} className={`min-w-[245px] snap-start rounded-lg border p-3 text-right transition lg:min-w-0 lg:w-full ${selected ? 'border-dark bg-dark text-white shadow-lg' : 'border-border bg-white/65 text-dark hover:border-gold'}`}>
                  <span className={`mb-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${selected ? 'border-white/25 text-white' : statusClass(item.status)}`}>{DELIVERABLE_STATUS[item.status] || item.status}</span>
                  <strong className="block text-sm">{item.title}</strong>
                  <span className={`mt-1 block text-xs ${selected ? 'text-white/70' : 'text-muted'}`}>{KIND_LABEL[item.kind] || item.kind} · الإصدار {item.version}</span>
                </button>
              })}
            </div>
          </aside>

          {activeDeliverable && activeDefinition && <section className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
              <div><span className="text-xs font-bold text-gold">{KIND_LABEL[activeDeliverable.kind] || activeDeliverable.kind}</span><h2 className="mt-1 text-xl font-black text-dark md:text-2xl">{activeDefinition.title}</h2><p className="mt-1 text-sm leading-6 text-muted">{activeDefinition.description}</p></div>
              <select value={status} onChange={event => setStatus(event.target.value)} className="min-h-11 rounded-lg border border-border bg-white/75 px-3 text-sm font-bold text-dark">
                {Object.entries(DELIVERABLE_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>

            <div className="mt-5 border-b border-border pb-5">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <textarea value={aiInstruction} onChange={event => setAiInstruction(event.target.value)} rows={2} placeholder="توجيه إضافي للمسودة (اختياري)، مثل: ركّز على الجانب التقني أو اجعل اللغة مناسبة للمستثمرين" className="w-full resize-y rounded-lg border border-border bg-white/65 px-4 py-3 text-sm text-dark outline-none focus:border-green" />
                <Button type="button" variant="secondary" loading={generating} onClick={generateDraft} className="self-stretch">إنشاء مسودة للمخرج</Button>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">تظهر المسودة في الحقول أدناه ولا تُحفظ أو تُرسل تلقائياً. المعلومات الناقصة تُعلّم بوضوح لمراجعتها.</p>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              {activeDefinition.fields.map(field => <label key={field.key} className={`block min-w-0 ${field.type === 'textarea' || field.type === 'list' ? 'md:col-span-2' : ''}`}>
                <span className="mb-2 block text-sm font-black text-dark">{field.label}{field.required ? ' *' : ''}</span>
                {field.type === 'textarea' || field.type === 'list' ? <textarea rows={field.type === 'list' ? 5 : 6} value={content[field.key] || ''} onChange={event => setContent(previous => ({ ...previous, [field.key]: event.target.value }))} placeholder={field.placeholder || (field.type === 'list' ? 'كل بند في سطر مستقل' : '')} className="w-full resize-y rounded-lg border border-border bg-white/65 px-4 py-3 text-sm leading-7 text-dark outline-none focus:border-green" /> : <input type={field.type === 'url' ? 'url' : 'text'} value={content[field.key] || ''} onChange={event => setContent(previous => ({ ...previous, [field.key]: event.target.value }))} placeholder={field.placeholder || ''} className="min-h-12 w-full rounded-lg border border-border bg-white/65 px-4 text-sm text-dark outline-none focus:border-green" />}
                {field.help && <small className="mt-1 block text-xs leading-5 text-muted">{field.help}</small>}
              </label>)}
            </div>

            <div className="mt-7 border-t border-border pt-5">
              <h3 className="text-lg font-black text-dark">فحص الجودة قبل التسليم</h3>
              <div className="mt-3 grid gap-2 md:grid-cols-2">{checklist.map((item, index) => <label key={`${item.label}-${index}`} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-white/45 p-3 text-sm leading-6 text-dark"><input type="checkbox" checked={item.done} onChange={event => setChecklist(previous => previous.map((row, rowIndex) => rowIndex === index ? { ...row, done: event.target.checked } : row))} className="mt-1 h-4 w-4 accent-green" /><span>{item.label}</span></label>)}</div>
            </div>

            <div className="mt-7 border-t border-border pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-lg font-black text-dark">ملفات التسليم</h3><p className="text-xs text-muted">ارفع النسخة النهائية أو أضف رابط عمل خارجي. الحد الأقصى 200 ميجابايت.</p></div><div className="flex gap-2"><label className={`inline-flex cursor-pointer items-center rounded-lg bg-dark px-3 py-2 text-sm font-bold text-white ${uploading ? 'pointer-events-none opacity-60' : ''}`}><input type="file" className="hidden" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.txt,.png,.jpg,.jpeg,.webp,.mp4,.webm,.mov" onChange={event => { void uploadDeliveryFile(event.target.files?.[0]); event.currentTarget.value = '' }} />{uploading ? 'جاري الرفع...' : 'رفع ملف'}</label><button type="button" onClick={() => setDeliveryFiles(previous => [...previous, { label: '', url: '', format: '' }])} className="rounded-lg border border-dark px-3 py-2 text-sm font-bold text-dark">إضافة رابط</button></div></div>
              <div className="mt-3 space-y-2">{deliveryFiles.map((file, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_110px_auto]"><input value={file.label} onChange={event => setDeliveryFiles(previous => previous.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row))} placeholder="اسم الملف" className="min-h-11 rounded-lg border border-border bg-white/65 px-3 text-sm" /><input value={file.url} onChange={event => setDeliveryFiles(previous => previous.map((row, rowIndex) => rowIndex === index ? { ...row, url: event.target.value } : row))} placeholder="https://" className="min-h-11 rounded-lg border border-border bg-white/65 px-3 text-sm" /><input value={file.format || ''} onChange={event => setDeliveryFiles(previous => previous.map((row, rowIndex) => rowIndex === index ? { ...row, format: event.target.value } : row))} placeholder="PDF" className="min-h-11 rounded-lg border border-border bg-white/65 px-3 text-sm" /><button type="button" title="حذف الملف" onClick={() => setDeliveryFiles(previous => previous.filter((_, rowIndex) => rowIndex !== index))} className="min-h-11 px-3 text-sm font-bold text-red-700">حذف</button></div>)}</div>
            </div>

            <div className="mt-7 grid gap-4 border-t border-border pt-5 md:grid-cols-2">
              <label><span className="mb-2 block text-sm font-black text-dark">ملاحظات داخلية</span><textarea rows={3} value={internalNotes} onChange={event => setInternalNotes(event.target.value)} className="w-full rounded-lg border border-border bg-white/65 px-4 py-3 text-sm" placeholder="لا تظهر للعميل" /></label>
              <label><span className="mb-2 block text-sm font-black text-dark">وصف الإصدار الجديد</span><textarea rows={3} value={changeNote} onChange={event => setChangeNote(event.target.value)} className="w-full rounded-lg border border-border bg-white/65 px-4 py-3 text-sm" placeholder="مثال: تحديث الأرقام وإعادة ترتيب التوصيات" /></label>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button type="button" loading={saving} onClick={() => saveDeliverable(false)}>حفظ المسودة</Button>
              <Button type="button" variant="outline" loading={saving} onClick={() => saveDeliverable(true)}>حفظ إصدار جديد</Button>
              <button type="button" onClick={() => setShowVersions(value => !value)} className="min-h-12 px-3 text-sm font-bold text-dark underline decoration-gold underline-offset-4">سجل الإصدارات ({activeDeliverable.versions.length})</button>
            </div>

            {showVersions && <div className="mt-4 border-t border-border pt-4"><h3 className="mb-3 font-black text-dark">الإصدارات المحفوظة</h3>{activeDeliverable.versions.length ? <div className="divide-y divide-border rounded-lg border border-border bg-white/45">{activeDeliverable.versions.map(version => <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><strong className="text-sm text-dark">الإصدار {version.version}</strong><p className="mt-1 text-xs text-muted">{version.change_note || 'نسخة محفوظة'} · {formatDate(version.created_at)}</p></div><button type="button" onClick={() => restoreVersion(version.id)} className="text-sm font-bold text-green hover:underline">استعادة</button></div>)}</div> : <p className="text-sm text-muted">لا توجد إصدارات سابقة بعد.</p>}</div>}
          </section>}
        </div>

        <footer className="flex flex-wrap justify-between gap-3 border-t border-border py-4 text-xs text-muted">
          <span>قيمة الخدمة: {formatNumber(Number(payload.request.final_total || payload.request.admin_quoted_price || payload.product.price))} ر.س</span>
          <span>أُنشئ الطلب في {formatDate(payload.request.created_at)}</span>
        </footer>
      </div>
    </main>
  )
}

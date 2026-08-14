'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import ContentImagesUploader from '@/components/request/ContentImagesUploader'
import SupportingDocumentsUploader from '@/components/request/SupportingDocumentsUploader'
import { useToast } from '@/components/ui/Toast'
import { formatStorePrice, type InventorStoreProduct } from '@/lib/inventor-store'
import { getInventorStoreOrderForm, validateInventorStoreAnswers, type InventorOrderField } from '@/lib/inventor-store-order-forms'
import type { SupportingDocument } from '@/lib/request-attachments'

const inputClass = 'w-full rounded-lg border border-border bg-white/75 px-4 py-3 text-sm text-dark outline-none transition focus:border-green/50 focus:ring-2 focus:ring-green/10'

function DynamicField({ field, value, onChange }: { field: InventorOrderField; value: string; onChange: (value: string) => void }) {
  const common = {
    id: `store-${field.key}`,
    value,
    required: field.required,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(event.target.value),
    className: inputClass,
  }

  return <label htmlFor={common.id} className={field.type === 'textarea' ? 'block sm:col-span-2' : 'block'}>
    <span className="mb-2 block text-sm font-black text-dark">{field.label}</span>
    {field.type === 'textarea' ? <textarea {...common} rows={5} minLength={field.minLength} maxLength={field.maxLength} placeholder={field.placeholder} />
      : field.type === 'select' ? <select {...common}><option value="">اختر</option>{field.options?.map(option => <option key={option} value={option}>{option}</option>)}</select>
        : <input {...common} type={field.type} minLength={field.minLength} maxLength={field.maxLength} placeholder={field.placeholder} />}
    <span className="mt-1.5 flex justify-between gap-3 text-[11px] leading-5 text-muted">
      <span>{field.help}</span>
      {field.maxLength && <span className="shrink-0">{value.length}/{field.maxLength}</span>}
    </span>
  </label>
}

export default function StoreOrderForm({ product }: { product: InventorStoreProduct }) {
  const router = useRouter()
  const { showToast } = useToast()
  const definition = useMemo(() => getInventorStoreOrderForm(product.slug), [product.slug])
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<{ id: string; requestNumber: string } | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [images, setImages] = useState<string[]>([])
  const [documents, setDocuments] = useState<SupportingDocument[]>([])

  if (!definition) return null

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const validationError = validateInventorStoreAnswers(definition, answers)
    if (validationError) { showToast(validationError, 'error'); return }
    if ((definition.images.minFiles || 0) > images.length) { showToast(`ارفع ${definition.images.minFiles} صورة على الأقل`, 'error'); return }

    setSubmitting(true)
    try {
      const response = await fetch('/api/inventor-store/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productSlug: product.slug, answers, images, supportingDocuments: documents }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.status === 401) {
        router.push(`/auth/login?next=${encodeURIComponent(`/inventor-store/order/${product.slug}`)}`)
        return
      }
      if (!response.ok) throw new Error(data.error || 'تعذّر إرسال الطلب')
      setSuccess({ id: data.id, requestNumber: data.requestNumber })
      showToast('تم إرسال طلب الخدمة للمراجعة')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّر إرسال الطلب', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) return <div className="mx-auto max-w-xl px-4 py-16 text-center">
    <div className="glass-panel rounded-lg p-7 md:p-10">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green/10 text-2xl font-black text-green">✓</span>
      <p className="mt-5 text-xs font-black text-gold">{success.requestNumber}</p>
      <h1 className="mt-2 text-2xl font-black text-dark">وصلنا طلبك</h1>
      <p className="mt-3 text-sm leading-7 text-muted">سيراجع الفريق التفاصيل والملفات، ثم يصلك العرض النهائي قبل الدفع وبدء التنفيذ.</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center"><Link href={`/dashboard/${success.id}`} className="rounded-lg bg-green px-6 py-3 text-sm font-black text-white">متابعة الطلب</Link><Link href="/inventor-store" className="rounded-lg border border-border bg-white/60 px-6 py-3 text-sm font-black text-dark">العودة للمتجر</Link></div>
    </div>
  </div>

  return <form onSubmit={submit} className="mx-auto grid max-w-6xl gap-5 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start md:py-12">
    <div className="space-y-4">
      <div><Link href={`/inventor-store/${product.slug}`} className="text-xs font-black text-green">← العودة إلى تفاصيل الخدمة</Link><h1 className="mt-4 text-3xl font-black text-dark">{definition.title}</h1><p className="mt-2 text-sm leading-7 text-muted">{definition.intro}</p></div>

      {definition.sections.map((section, sectionIndex) => <section key={section.title} className="glass-panel rounded-lg p-5 md:p-7">
        <div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-green/10 text-xs font-black text-green">{sectionIndex + 1}</span><div><h2 className="text-lg font-black text-dark">{section.title}</h2>{section.description && <p className="mt-1 text-xs leading-6 text-muted">{section.description}</p>}</div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">{section.fields.map(field => <DynamicField key={field.key} field={field} value={answers[field.key] || ''} onChange={value => setAnswers(current => ({ ...current, [field.key]: value }))} />)}</div>
      </section>)}

      <section className="glass-panel rounded-lg p-5 md:p-7">
        <div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-green/10 text-xs font-black text-green">{definition.sections.length + 1}</span><div><h2 className="text-lg font-black text-dark">المرفقات الخاصة بالخدمة</h2><p className="mt-1 text-xs leading-6 text-muted">الصور المستخدمة بصرياً منفصلة عن وثائق القراءة والتحقق.</p></div></div>
        <div className="mt-5 space-y-4">
          <div className="rounded-lg border border-green/25 bg-green/5 p-4"><p className="text-sm font-black text-dark">{definition.images.label}{definition.images.minFiles ? ' *' : ''}</p><p className="mb-4 mt-1 text-xs leading-5 text-muted">{definition.images.help}</p><ContentImagesUploader images={images} onChange={setImages} maxImages={definition.images.maxFiles} /></div>
          <div className="rounded-lg border border-border bg-cream/35 p-4"><p className="text-sm font-black text-dark">{definition.documents.label}</p><p className="mb-4 mt-1 text-xs leading-5 text-muted">{definition.documents.help}</p><SupportingDocumentsUploader documents={documents} onChange={setDocuments} maxFiles={definition.documents.maxFiles} /></div>
        </div>
      </section>
    </div>

    <aside className="glass-panel rounded-lg p-5 lg:sticky lg:top-24">
      <p className="text-xs font-black text-gold">الخدمة المختارة</p><h2 className="mt-2 text-xl font-black leading-8 text-dark">{product.name}</h2><p className="mt-2 text-xs leading-6 text-muted">{product.summary}</p>
      <div className="my-5 space-y-3 border-y border-border/80 py-5 text-sm"><div className="flex justify-between gap-3"><span className="text-muted">السعر المعلن</span><strong className="text-green">{formatStorePrice(product.price)} ر.س</strong></div><div className="flex justify-between gap-3"><span className="text-muted">التنفيذ</span><strong className="text-dark">{product.duration}</strong></div><div className="flex justify-between gap-3"><span className="text-muted">التعديلات</span><strong className="text-dark">{product.revisions === 1 ? 'جولة واحدة' : `${product.revisions} جولات`}</strong></div></div>
      <div className="mb-4 rounded-lg bg-green/5 p-3 text-xs leading-6 text-muted">هذا النموذج مخصص لهذه الخدمة، وستظهر إجاباتك مرتبة للفريق عند مراجعة الطلب.</div>
      {product.notice && <div className="mb-4 rounded-lg border border-amber-300/70 bg-amber-50/80 p-3 text-xs leading-6 text-amber-900"><strong className="block">تنبيه نطاق الخدمة</strong>{product.notice}</div>}
      <Button type="submit" loading={submitting} disabled={submitting} className="w-full" size="lg">إرسال الطلب للمراجعة</Button>
      <p className="mt-3 text-center text-[11px] leading-5 text-muted">لا يتم الخصم الآن. يصلك العرض لاعتماده قبل الانتقال إلى الدفع.</p>
    </aside>
  </form>
}

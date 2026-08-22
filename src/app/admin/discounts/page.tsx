'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

interface DiscountCode {
  id: string
  code: string
  occasion: string | null
  discount_pct: number
  expires_at: string
  max_uses: number | null
  used_count: number
  is_active: boolean
  created_at: string
}

const emptyForm = { code: '', occasion: '', discount_pct: '', expires_at: '', max_uses: '' }
const emptyRenewForm = { expires_at: '', max_uses: '' }

function toDateTimeLocal(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

export default function AdminDiscountsPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [codes, setCodes] = useState<DiscountCode[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [renewingFor, setRenewingFor] = useState<string | null>(null)
  const [renewForm, setRenewForm] = useState(emptyRenewForm)
  const [renewing, setRenewing] = useState(false)

  // حالة الإرسال بالبريد
  const [sendingFor, setSendingFor]     = useState<string | null>(null)   // id الكود الذي يُرسل
  const [sendMessage, setSendMessage]   = useState('')
  const [quotedCount, setQuotedCount]   = useState<number | null>(null)
  const [sendingEmail, setSendingEmail] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.push('/dashboard'); return }
      const [codesResponse, countResponse] = await Promise.all([
        fetch('/api/admin/discounts'),
        fetch('/api/admin/send-discount-email'),
      ])
      const [codesJson, countJson] = await Promise.all([
        codesResponse.json(),
        countResponse.json(),
      ])
      setCodes(codesJson.data ?? [])
      setQuotedCount(countJson.count ?? 0)
      setLoading(false)
    })
  }, [router])

  const fetchCodes = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/discounts')
    const json = await res.json()
    setCodes(json.data ?? [])
    setLoading(false)
  }

  const fetchQuotedCount = async () => {
    const res = await fetch('/api/admin/send-discount-email')
    const json = await res.json()
    setQuotedCount(json.count ?? 0)
  }

  const handleCreate = async () => {
    if (!form.code.trim()) { showToast('أدخل اسم الكود', 'error'); return }
    if (!form.discount_pct || Number(form.discount_pct) <= 0) { showToast('أدخل نسبة خصم صحيحة', 'error'); return }
    if (!form.expires_at) { showToast('أدخل تاريخ الانتهاء', 'error'); return }

    setSaving(true)
    const res = await fetch('/api/admin/discounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: form.code.trim().toUpperCase(),
        occasion: form.occasion.trim() || null,
        discount_pct: Number(form.discount_pct),
        expires_at: form.expires_at,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
      }),
    })
    const json = await res.json()
    if (res.ok) {
      showToast('تم إنشاء الكود بنجاح')
      setForm(emptyForm)
      setShowForm(false)
      fetchCodes()
    } else {
      showToast(json.error ?? 'فشل إنشاء الكود', 'error')
    }
    setSaving(false)
  }

  const handleToggle = async (id: string, is_active: boolean) => {
    const res = await fetch('/api/admin/discounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active }),
    })
    if (res.ok) {
      setCodes(prev => prev.map(c => c.id === id ? { ...c, is_active } : c))
    } else {
      showToast('فشل التحديث', 'error')
    }
  }

  const openRenewPanel = (discount: DiscountCode) => {
    const currentExpiry = new Date(discount.expires_at)
    const defaultExpiry = currentExpiry.getTime() > Date.now()
      ? currentExpiry
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const defaultMaxUses = discount.max_uses === null
      ? ''
      : String(Math.max(discount.max_uses, discount.used_count + 1))

    setRenewingFor(discount.id)
    setRenewForm({
      expires_at: toDateTimeLocal(defaultExpiry),
      max_uses: defaultMaxUses,
    })
  }

  const handleRenew = async (discount: DiscountCode) => {
    if (!renewForm.expires_at || new Date(renewForm.expires_at).getTime() <= Date.now()) {
      showToast('اختر تاريخ انتهاء جديداً في المستقبل', 'error')
      return
    }
    const maxUses = renewForm.max_uses ? Number(renewForm.max_uses) : null
    if (maxUses !== null && maxUses <= discount.used_count) {
      showToast(`يجب أن يكون الحد الجديد أكبر من ${discount.used_count}`, 'error')
      return
    }

    setRenewing(true)
    const res = await fetch('/api/admin/discounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: discount.id,
        is_active: true,
        expires_at: renewForm.expires_at,
        max_uses: maxUses,
      }),
    })
    const json = await res.json()
    if (res.ok) {
      setCodes(prev => prev.map(code => code.id === discount.id ? json.data : code))
      setRenewingFor(null)
      setRenewForm(emptyRenewForm)
      showToast('تم تمديد الكود وإعادة تفعيله')
    } else {
      showToast(json.error ?? 'فشل تمديد الكود', 'error')
    }
    setRenewing(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الكود؟')) return
    const res = await fetch('/api/admin/discounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      setCodes(prev => prev.filter(c => c.id !== id))
      if (sendingFor === id) setSendingFor(null)
      showToast('تم الحذف')
    } else {
      showToast('فشل الحذف', 'error')
    }
  }

  const openSendPanel = (id: string) => {
    setSendingFor(id)
    setSendMessage('')
  }

  const handleSendEmail = async () => {
    if (!sendMessage.trim()) { showToast('اكتب رسالة للعملاء', 'error'); return }
    if (!sendingFor) return
    if (!confirm(`سيتم إرسال الكود لـ ${quotedCount} عميل لديهم عروض منتظرة. متأكد؟`)) return

    setSendingEmail(true)
    const res = await fetch('/api/admin/send-discount-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codeId: sendingFor, adminMessage: sendMessage.trim() }),
    })
    const json = await res.json()
    if (res.ok) {
      showToast(`✅ تم الإرسال — ${json.sent} نجح · ${json.failed} فشل`)
      setSendingFor(null)
      setSendMessage('')
    } else {
      showToast(json.error ?? 'فشل الإرسال', 'error')
    }
    setSendingEmail(false)
  }

  if (loading) return <LoadingSpinner size="lg" />

  const now = new Date()
  const active = codes.filter(c => c.is_active && new Date(c.expires_at) > now && (c.max_uses === null || c.used_count < c.max_uses)).length

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-dark">أكواد الخصم</h1>
          <p className="text-sm text-muted mt-0.5">
            {active} سارية · {codes.length} إجمالي
            {quotedCount !== null && (
              <span className="ms-2 text-amber-600 font-medium">· {quotedCount} عميل بعروض منتظرة</span>
            )}
          </p>
        </div>
        <Button onClick={() => setShowForm(v => !v)}>
          {showForm ? 'إلغاء' : '+ كود جديد'}
        </Button>
      </div>

      {/* ── نموذج الإنشاء ── */}
      {showForm && (
        <div className="bg-card rounded-2xl border border-border p-5 mb-6">
          <h2 className="font-bold text-dark mb-4">إنشاء كود خصم جديد</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1">
                اسم الكود <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.replace(/[^A-Z0-9]/gi, '').toUpperCase() }))}
                placeholder="مثال: EID2026"
                className="w-full px-4 py-2.5 rounded-xl border border-border text-sm bg-white"
                maxLength={20}
              />
              <p className="text-xs text-muted mt-1">حروف إنجليزية كبيرة وأرقام فقط</p>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">المناسبة</label>
              <input
                type="text"
                value={form.occasion}
                onChange={e => setForm(f => ({ ...f, occasion: e.target.value }))}
                placeholder="مثال: عيد الفطر 2026"
                className="w-full px-4 py-2.5 rounded-xl border border-border text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">
                نسبة الخصم % <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={form.discount_pct}
                onChange={e => setForm(f => ({ ...f, discount_pct: e.target.value }))}
                placeholder="مثال: 15"
                min="1" max="100"
                className="w-full px-4 py-2.5 rounded-xl border border-border text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">
                تاريخ الانتهاء <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={form.expires_at}
                onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-border text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">الحد الأقصى للاستخدام</label>
              <input
                type="number"
                value={form.max_uses}
                onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
                placeholder="اتركه فارغاً لاستخدام بلا حد"
                min="1"
                className="w-full px-4 py-2.5 rounded-xl border border-border text-sm bg-white"
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => { setShowForm(false); setForm(emptyForm) }}>إلغاء</Button>
            <Button onClick={handleCreate} loading={saving}>إنشاء الكود</Button>
          </div>
        </div>
      )}

      {/* ── قائمة الأكواد ── */}
      {codes.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-6xl mb-4 opacity-20">🏷️</div>
          <p className="text-muted">لا توجد أكواد خصم — أنشئ أول كود</p>
        </div>
      ) : (
        <div className="space-y-3">
          {codes.map(dc => {
            const expired   = new Date(dc.expires_at) < now
            const exhausted = dc.max_uses !== null && dc.used_count >= dc.max_uses
            const isValid   = dc.is_active && !expired && !exhausted
            const isSending = sendingFor === dc.id
            const isRenewing = renewingFor === dc.id

            return (
              <div key={dc.id} className={`bg-card rounded-2xl border transition-opacity ${isValid ? 'border-border' : 'border-border opacity-60'}`}>
                {/* ── الكارت الرئيسية ── */}
                <div className="p-4 md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-black text-dark text-lg font-mono tracking-widest">{dc.code}</span>
                        <span className="bg-green/10 text-green text-xs font-bold px-2 py-0.5 rounded-full">
                          -{dc.discount_pct}%
                        </span>
                        {isValid ? (
                          <span className="bg-green/10 text-green text-xs px-2 py-0.5 rounded-full">✓ ساري</span>
                        ) : expired ? (
                          <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">منتهي</span>
                        ) : exhausted ? (
                          <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">نفدت الاستخدامات</span>
                        ) : (
                          <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">موقوف</span>
                        )}
                      </div>

                      {dc.occasion && <p className="text-sm text-muted">{dc.occasion}</p>}

                      <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted">
                        <span>
                          الاستخدام: <strong className="text-dark">{dc.used_count}</strong>
                          {dc.max_uses !== null && ` / ${dc.max_uses}`}
                        </span>
                        <span>
                          ينتهي: <strong className="text-dark">
                            {new Date(dc.expires_at).toLocaleString('ar-SA', {
                              year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                            })}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {isValid && (
                        <button
                          onClick={() => isSending ? setSendingFor(null) : openSendPanel(dc.id)}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                            isSending
                              ? 'border-blue-300 text-blue-700 bg-blue-50'
                              : 'border-blue-200 text-blue-600 hover:bg-blue-50'
                          }`}
                        >
                          {isSending ? '✕ إلغاء الإرسال' : '📧 إرسال لعملاء انتظار'}
                        </button>
                      )}
                      <button
                        onClick={() => isRenewing ? setRenewingFor(null) : openRenewPanel(dc)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                          isRenewing
                            ? 'border-blue-300 bg-blue-50 text-blue-700'
                            : 'border-blue-200 text-blue-700 hover:bg-blue-50'
                        }`}
                      >
                        {isRenewing ? 'إلغاء التمديد' : expired || exhausted ? 'إعادة تفعيل' : 'تمديد الصلاحية'}
                      </button>
                      <button
                        onClick={() => {
                          if (!dc.is_active && (expired || exhausted)) {
                            openRenewPanel(dc)
                            return
                          }
                          handleToggle(dc.id, !dc.is_active)
                        }}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                          dc.is_active
                            ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
                            : 'border-green/40 text-green hover:bg-green/5'
                        }`}
                      >
                        {dc.is_active ? 'إيقاف' : 'تفعيل'}
                      </button>
                      <button
                        onClick={() => handleDelete(dc.id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-all"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                </div>

                {isRenewing && (
                  <div className="border-t border-border bg-slate-50/70 p-4 md:p-5">
                    <div className="mb-4">
                      <p className="text-sm font-bold text-dark">تمديد أو إعادة تفعيل الكود</p>
                      <p className="mt-1 text-xs text-muted">سيبقى سجل الاستخدام السابق ({dc.used_count}) محفوظاً ولن يُصفّر.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-dark">تاريخ الانتهاء الجديد *</label>
                        <input
                          type="datetime-local"
                          value={renewForm.expires_at}
                          min={toDateTimeLocal(new Date())}
                          onChange={event => setRenewForm(current => ({ ...current, expires_at: event.target.value }))}
                          className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-dark">الحد الجديد للاستخدام</label>
                        <input
                          type="number"
                          value={renewForm.max_uses}
                          min={dc.used_count + 1}
                          onChange={event => setRenewForm(current => ({ ...current, max_uses: event.target.value }))}
                          placeholder="اتركه فارغاً لاستخدام بلا حد"
                          className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm"
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => setRenewingFor(null)}>إلغاء</Button>
                      <Button loading={renewing} onClick={() => handleRenew(dc)}>حفظ وإعادة التفعيل</Button>
                    </div>
                  </div>
                )}

                {/* ── لوحة الإرسال ── */}
                {isSending && (
                  <div className="border-t border-border bg-blue-50/50 p-4 md:p-5 rounded-b-2xl">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-blue-600 text-lg">📧</span>
                      <div>
                        <p className="text-sm font-bold text-dark">إرسال كود الخصم بالبريد الإلكتروني</p>
                        <p className="text-xs text-muted">
                          {quotedCount !== null
                            ? `سيُرسَل لـ ${quotedCount} عميل لديهم عروض بانتظار الموافقة`
                            : 'جارٍ جلب عدد العملاء...'}
                        </p>
                      </div>
                    </div>

                    {/* معاينة الكود في الرسالة */}
                    <div className="bg-white rounded-xl border border-blue-200 p-3 mb-3">
                      <p className="text-xs text-muted mb-2">معاينة بطاقة الكود في الإيميل:</p>
                      <div className="bg-[#0E2855] rounded-xl p-4 text-center">
                        <p className="text-[#C9A961] text-xs font-bold mb-2">كود الخصم الخاص بك</p>
                        <div className="bg-white rounded-lg px-4 py-2 inline-block mb-2 border-2 border-[#C9A961]">
                          <span className="font-black text-[#0E2855] text-xl font-mono tracking-widest">{dc.code}</span>
                        </div>
                        <p className="text-white font-black text-xl">{dc.discount_pct}% خصم</p>
                        {dc.occasion && (
                          <p className="text-[#C9A961] text-xs mt-1">بمناسبة {dc.occasion}</p>
                        )}
                      </div>
                    </div>

                    <div className="mb-3">
                      <label className="block text-xs font-medium text-dark mb-1">
                        رسالتك للعملاء <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={sendMessage}
                        onChange={e => setSendMessage(e.target.value)}
                        placeholder={`مثال: بمناسبة ${dc.occasion ?? 'العيد'}، نهديكم كود خصم خاص — يمكنكم تطبيقه على عرضكم الحالي قبل الاعتماد`}
                        className="w-full px-4 py-3 rounded-xl border border-blue-200 text-sm bg-white min-h-[90px] resize-y"
                        maxLength={500}
                      />
                      <div className="flex justify-between text-xs text-muted mt-1">
                        <span>ستظهر هذه الرسالة في مقدمة الإيميل</span>
                        <span>{sendMessage.length}/500</span>
                      </div>
                    </div>

                    <div className="flex gap-3 justify-end">
                      <Button variant="ghost" onClick={() => setSendingFor(null)}>إلغاء</Button>
                      <Button
                        onClick={handleSendEmail}
                        loading={sendingEmail}
                        disabled={!sendMessage.trim() || quotedCount === 0}
                      >
                        {quotedCount === 0
                          ? 'لا يوجد عملاء مؤهلون'
                          : `📨 إرسال لـ ${quotedCount ?? '...'} عميل`}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

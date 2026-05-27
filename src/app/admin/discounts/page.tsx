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

export default function AdminDiscountsPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [codes, setCodes] = useState<DiscountCode[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.push('/dashboard'); return }
      fetchCodes()
    })
  }, [router])

  const fetchCodes = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/discounts')
    const json = await res.json()
    setCodes(json.data ?? [])
    setLoading(false)
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

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الكود؟')) return
    const res = await fetch('/api/admin/discounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      setCodes(prev => prev.filter(c => c.id !== id))
      showToast('تم الحذف')
    } else {
      showToast('فشل الحذف', 'error')
    }
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
            const expired    = new Date(dc.expires_at) < now
            const exhausted  = dc.max_uses !== null && dc.used_count >= dc.max_uses
            const isValid    = dc.is_active && !expired && !exhausted

            return (
              <div
                key={dc.id}
                className={`bg-card rounded-2xl border p-4 md:p-5 transition-opacity ${isValid ? 'border-border' : 'border-border opacity-60'}`}
              >
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

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggle(dc.id, !dc.is_active)}
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
            )
          })}
        </div>
      )}
    </div>
  )
}

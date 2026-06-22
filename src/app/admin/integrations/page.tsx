'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

function IntegrationsInner() {
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()
  const params = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [accounts, setAccounts] = useState<unknown>(null)
  const [busy, setBusy] = useState<'accounts' | 'upload' | 'schedule' | null>(null)
  const [testImageUrl, setTestImageUrl] = useState('')
  const [uploadResult, setUploadResult] = useState<unknown>(null)
  const [schedAccountId, setSchedAccountId] = useState('')
  const [schedContent, setSchedContent] = useState('اختبار جدولة من تواصل النخبة — يُحذف لاحقاً.')
  const [schedDraft, setSchedDraft] = useState(true)
  const [schedResult, setSchedResult] = useState<unknown>(null)

  const checkAccounts = useCallback(async () => {
    setBusy('accounts')
    try {
      const res = await fetch('/api/postpulse/accounts')
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setConnected(true)
        setAccounts(data.accounts ?? null)
        showToast('الاتصال يعمل ✅', 'success')
      } else {
        setConnected(false)
        if (data.error && res.status !== 409) showToast(data.error, 'error')
      }
    } finally { setBusy(null) }
  }, [showToast])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.push('/dashboard'); return }
      // حالة الربط الأولية
      const res = await fetch('/api/postpulse/accounts')
      setConnected(res.ok)
      if (res.ok) { const d = await res.json().catch(() => ({})); setAccounts(d.accounts ?? null) }
      setLoading(false)
    }
    init()
  }, [supabase, router])

  useEffect(() => {
    if (params.get('connected') === '1') showToast('تم ربط Post-Pulse بنجاح ✅', 'success')
    const err = params.get('error')
    if (err) showToast(`تعذّر الربط: ${err}`, 'error')
  }, [params, showToast])

  const testUpload = async () => {
    if (!testImageUrl.trim()) { showToast('ألصق رابط صورة تصميم للاختبار', 'error'); return }
    setBusy('upload'); setUploadResult(null)
    try {
      const res = await fetch('/api/postpulse/test-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: testImageUrl.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setUploadResult(data.media); showToast('تم رفع الصورة بنجاح ✅', 'success') }
      else showToast(data.error ?? 'فشل الرفع', 'error')
    } finally { setBusy(null) }
  }

  const testSchedule = async () => {
    if (!schedAccountId.trim()) { showToast('أدخل معرّف الحساب (accountId)', 'error'); return }
    setBusy('schedule'); setSchedResult(null)
    try {
      const res = await fetch('/api/postpulse/test-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: Number(schedAccountId.trim()), content: schedContent, isDraft: schedDraft }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setSchedResult(data); showToast('تمت الجدولة (مستقبلية — لا تُنشر الآن) ✅', 'success') }
      else showToast(data.error ?? 'فشل الجدولة', 'error')
    } finally { setBusy(null) }
  }

  if (loading) return <div className="p-6 flex justify-center"><LoadingSpinner /></div>

  const card = 'bg-card rounded-2xl border border-border p-5 space-y-3'

  return (
    <div className="p-4 md:p-6 max-w-2xl space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-black text-dark">🔗 التكامل — النشر للقنوات (Post-Pulse)</h1>
        <p className="text-sm text-muted mt-1">اربط الحساب واختبر الاتصال ورفع الصور. لا يُنشر أي منشور في هذه الصفحة.</p>
      </div>

      {/* حالة الربط */}
      <div className={card}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-dark">حالة الربط</h2>
            <p className={`text-sm font-bold ${connected ? 'text-green' : 'text-amber-600'}`}>
              {connected ? '✅ مربوط' : '⚠️ غير مربوط'}
            </p>
          </div>
          <a href="/api/postpulse/authorize">
            <Button size="sm" variant={connected ? 'outline' : 'primary'}>
              {connected ? '🔄 إعادة الربط' : '🔗 ربط Post-Pulse'}
            </Button>
          </a>
        </div>
        <p className="text-[11px] text-muted">
          يتطلب ضبط متغيّرات البيئة: POSTPULSE_CLIENT_ID و POSTPULSE_CLIENT_SECRET و POSTPULSE_REDIRECT_URI.
        </p>
      </div>

      {/* اختبار الحسابات */}
      <div className={card}>
        <h2 className="font-bold text-dark">اختبار الاتصال — الحسابات</h2>
        <Button onClick={checkAccounts} loading={busy === 'accounts'} disabled={busy !== null} size="sm">
          عرض الحسابات المربوطة
        </Button>
        {accounts != null && (
          <pre dir="ltr" className="bg-cream rounded-xl p-3 text-xs whitespace-pre-wrap max-h-72 overflow-auto border border-border">
            {JSON.stringify(accounts, null, 2)}
          </pre>
        )}
      </div>

      {/* اختبار رفع صورة */}
      <div className={card}>
        <h2 className="font-bold text-dark">اختبار رفع صورة (بدون نشر)</h2>
        <p className="text-xs text-muted">ألصق رابط أي تصميم مولّد (من تخزيننا) لرفعه إلى Post-Pulse كاختبار.</p>
        <input
          value={testImageUrl}
          onChange={e => setTestImageUrl(e.target.value)}
          placeholder="https://…/ai-….png"
          dir="ltr"
          className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm"
        />
        <Button onClick={testUpload} loading={busy === 'upload'} disabled={busy !== null || !connected} size="sm">
          ⬆️ ارفع للاختبار
        </Button>
        {!connected && <p className="text-[11px] text-amber-600">اربط الحساب أولاً.</p>}
        {uploadResult != null && (
          <pre dir="ltr" className="bg-cream rounded-xl p-3 text-xs whitespace-pre-wrap max-h-60 overflow-auto border border-border">
            {JSON.stringify(uploadResult, null, 2)}
          </pre>
        )}
      </div>

      {/* اختبار جدولة (إكمال onboarding بلا نشر الآن) */}
      <div className={card}>
        <h2 className="font-bold text-dark">اختبار جدولة منشور (لإكمال الإعداد — لا يُنشر الآن)</h2>
        <p className="text-xs text-muted">
          خذ قيمة <b>id</b> (وليس accountId) من نتيجة «عرض الحسابات» أعلاه — مثال: 1751.
          الافتراضي: <b>مسودة</b> + تاريخ بعد سنة، فلا يُنشر شيء الآن. يمكنك حذف المنشور من لوحة Post‑Pulse بعد الإعداد.
        </p>
        <input
          value={schedAccountId}
          onChange={e => setSchedAccountId(e.target.value)}
          placeholder="id الحساب (رقم) — مثال: 1751"
          dir="ltr"
          className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm"
        />
        <textarea
          value={schedContent}
          onChange={e => setSchedContent(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[60px] resize-y"
        />
        <label className="flex items-center gap-2 text-sm text-dark">
          <input type="checkbox" checked={schedDraft} onChange={e => setSchedDraft(e.target.checked)} className="w-4 h-4 accent-green" />
          حفظ كمسودة (لا يُنشر إطلاقاً) — موصى به
        </label>
        <Button onClick={testSchedule} loading={busy === 'schedule'} disabled={busy !== null || !connected} size="sm">
          🗓️ {schedDraft ? 'حفظ مسودة اختبارية' : 'جدولة اختبارية (بعد سنة)'}
        </Button>
        {!connected && <p className="text-[11px] text-amber-600">اربط الحساب أولاً.</p>}
        {schedResult != null && (
          <pre dir="ltr" className="bg-cream rounded-xl p-3 text-xs whitespace-pre-wrap max-h-60 overflow-auto border border-border">
            {JSON.stringify(schedResult, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

export default function AdminIntegrationsPage() {
  return (
    <Suspense fallback={<div className="p-6 flex justify-center"><LoadingSpinner /></div>}>
      <IntegrationsInner />
    </Suspense>
  )
}

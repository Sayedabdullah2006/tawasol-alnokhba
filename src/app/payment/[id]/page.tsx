'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatNumber, formatNumberShort, generateRequestNumber } from '@/lib/utils'
import { CATEGORIES } from '@/lib/constants'
import { useToast } from '@/components/ui/Toast'
import PaymentForm from '@/components/payment/PaymentForm'
import ReceiptUploader from '@/components/request/ReceiptUploader'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const BANK_INFO = {
  bankName: 'بنك إس تي سي (stc pay)',
  accountName: 'شركة تواصل النخبة للدعاية والإعلان',
  iban: 'SA4678000000001258622215',
}

type Method = 'bank' | 'online' | 'tamara'

export default function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()

  const [request, setRequest] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [method, setMethod] = useState<Method>('online')
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [tamaraLoading, setTamaraLoading] = useState(false)
  const [discountCode, setDiscountCode] = useState('')
  const [applyingDiscount, setApplyingDiscount] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data } = await supabase
        .from('publish_requests')
        .select('*')
        .eq('id', id)
        .single()

      if (!data || data.user_id !== user.id) {
        router.push('/dashboard')
        return
      }

      if (data.status !== 'approved') {
        router.push(`/dashboard/${id}`)
        return
      }

      setRequest(data)
      setReceiptUrl(data.receipt_url ?? null)
      setLoading(false)
    }
    load()
  }, [id, router, supabase])

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(`تم نسخ ${label}`)
    } catch {
      showToast('تعذّر النسخ', 'error')
    }
  }

  const handleTamaraCheckout = async () => {
    setTamaraLoading(true)
    try {
      const res = await fetch('/api/payment/tamara/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id }),
      })
      const data = await res.json()
      if (res.ok && data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else {
        showToast(data.error ?? 'فشل الاتصال بتمارا، حاول مجدداً', 'error')
        setTamaraLoading(false)
      }
    } catch {
      showToast('فشل الاتصال بالخادم', 'error')
      setTamaraLoading(false)
    }
  }

  const handleConfirmTransfer = async () => {
    if (!receiptUrl) {
      showToast('يجب رفع صورة إيصال التحويل أولاً', 'error')
      return
    }
    setSubmitting(true)
    const res = await fetch('/api/confirm-bank-transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: id, receiptUrl }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      showToast('تم استلام التأكيد، الإدارة ستتحقق من التحويل')
      router.push(`/dashboard/${id}`)
    } else {
      showToast(data.error ?? 'فشل تأكيد التحويل', 'error')
      setSubmitting(false)
    }
  }

  const applyDiscount = async () => {
    if (!discountCode.trim()) { showToast('أدخل كود الخصم', 'error'); return }
    setApplyingDiscount(true)
    try {
      const res = await fetch('/api/apply-discount-to-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id, code: discountCode.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        showToast(`تم تطبيق خصم ${data.discountPct}%`)
        setRequest((prev: any) => ({
          ...prev,
          final_total: data.total,
          discount_pct: data.discountPct,
          discount_amount: data.discountAmount,
          discount_code: data.code,
        }))
      } else {
        showToast(data.error ?? 'فشل تطبيق الكود', 'error')
      }
    } catch {
      showToast('حدث خطأ في الاتصال', 'error')
    } finally {
      setApplyingDiscount(false)
    }
  }

  if (loading) return <LoadingSpinner size="lg" />
  if (!request) return null

  const cat = CATEGORIES.find(c => c.id === request.category)
  const isPaid = request.status === 'paid'
  const totalDue = Number(request.final_total ?? request.admin_quoted_price ?? 0)
  const offered = (request.admin_offered_extras ?? []) as { id: string; name: string; price: number }[]
  const selected = (request.user_selected_extras ?? []) as string[]
  const extrasDetail = offered.filter(e => selected.includes(e.id))

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href={`/dashboard/${id}`} className="text-sm text-green hover:underline mb-4 block">
        → العودة للطلب
      </Link>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="p-5 border-b border-border">
          <h1 className="text-2xl font-black text-dark mb-1">الدفع</h1>
          <p className="text-sm text-muted">طلب {generateRequestNumber(request.request_number)}</p>
        </div>

        <div className="p-5 space-y-5">
          {/* Order summary (read-only) */}
          <div className="bg-cream rounded-xl p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted">{cat?.icon} {cat?.nameAr}</span>
              <span className="font-medium">{formatNumber(request.admin_quoted_price ?? 0)} ر.س</span>
            </div>
            {extrasDetail.map(e => (
              <div key={e.id} className="flex justify-between text-xs">
                <span className="text-muted">+ {e.name}</span>
                <span>+{formatNumber(e.price)} ر.س</span>
              </div>
            ))}
            {request.discount_amount > 0 && (
              <div className="flex justify-between text-xs text-green font-semibold">
                <span>خصم{request.discount_code ? ` (${request.discount_code})` : ''} {request.discount_pct ? `${request.discount_pct}%` : ''}</span>
                <span>−{formatNumber(request.discount_amount)} ر.س</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 mt-2">
              <span className="font-bold">المطلوب دفعه</span>
              <span className="font-black text-2xl text-gold">{formatNumber(totalDue)} ر.س</span>
            </div>

            {/* كود الخصم — قبل الدفع */}
            {!isPaid && (
              <div className="pt-2 border-t border-border">
                <label className="text-xs text-muted block mb-1">لديك كود خصم؟</label>
                <div className="flex gap-2">
                  <input
                    value={discountCode}
                    onChange={e => setDiscountCode(e.target.value.toUpperCase())}
                    placeholder="أدخل الكود"
                    dir="ltr"
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-white text-sm text-left"
                  />
                  <Button onClick={applyDiscount} loading={applyingDiscount} disabled={applyingDiscount || !discountCode.trim()} variant="outline" size="sm">
                    تطبيق
                  </Button>
                </div>
              </div>
            )}
            {request.estimated_reach > 0 && (
              <div className="flex justify-between text-xs pt-2 border-t border-border">
                <span className="text-muted">الوصول المتوقع</span>
                <span className="font-bold text-green">{formatNumberShort(request.estimated_reach)} متابع</span>
              </div>
            )}
          </div>

          {isPaid ? (
            <div className="bg-green/5 border border-green/20 rounded-xl p-4 text-center">
              <div className="text-3xl mb-2">✅</div>
              <p className="font-bold text-green text-sm">تم استلام الدفع</p>
              <p className="text-xs text-muted mt-1">طلبك الآن قيد التجهيز للنشر</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {/* الأسرع أولاً: إلكتروني → تمارا → تحويل بنكي */}
                <button
                  type="button"
                  onClick={() => setMethod('online')}
                  className={`relative p-3 rounded-xl border-2 text-center transition-all cursor-pointer ${
                    method === 'online' ? 'border-green bg-green/5' : 'border-border bg-white hover:border-green/40'
                  }`}
                >
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-green text-white text-[9px] font-black px-2 py-0.5 rounded-full whitespace-nowrap">الأسرع</span>
                  <div className="text-2xl mb-1">💳</div>
                  <div className="font-bold text-xs text-dark">دفع إلكتروني</div>
                  <div className="text-[10px] text-muted">مدى / فيزا</div>
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('tamara')}
                  className={`p-3 rounded-xl border-2 text-center transition-all cursor-pointer ${
                    method === 'tamara' ? 'border-[#3D1152] bg-[#3D1152]/5' : 'border-border bg-white hover:border-[#3D1152]/40'
                  }`}
                >
                  <div
                    className="mx-auto mb-1 w-10 h-7 rounded-lg flex items-center justify-center text-white font-black text-xs"
                    style={{ background: 'linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%)' }}
                  >
                    تمارا
                  </div>
                  <div className="font-bold text-xs text-dark">تمارا</div>
                  <div className="text-[10px] text-muted">حتى 3 أقساط</div>
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('bank')}
                  className={`p-3 rounded-xl border-2 text-center transition-all cursor-pointer ${
                    method === 'bank' ? 'border-green bg-green/5' : 'border-border bg-white hover:border-green/40'
                  }`}
                >
                  <div className="text-2xl mb-1">🏦</div>
                  <div className="font-bold text-xs text-dark">تحويل بنكي</div>
                  <div className="text-[10px] text-muted">للحساب البنكي</div>
                </button>
              </div>

              {method === 'bank' && (
                <div className="bg-card rounded-xl border border-border p-4 space-y-4">
                  <div>
                    <h3 className="font-bold text-dark text-sm mb-1">تفاصيل الحساب البنكي</h3>
                    <p className="text-xs text-muted">حوّل المبلغ المستحق إلى الحساب التالي ثم ارفع صورة الإيصال</p>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="bg-cream rounded-lg p-3">
                      <div className="text-xs text-muted">اسم البنك</div>
                      <div className="font-medium">{BANK_INFO.bankName}</div>
                    </div>
                    <div className="bg-cream rounded-lg p-3">
                      <div className="text-xs text-muted">المستفيد</div>
                      <div className="font-medium">{BANK_INFO.accountName}</div>
                    </div>
                    <div className="flex items-center justify-between bg-cream rounded-lg p-3">
                      <div className="flex-1">
                        <div className="text-xs text-muted">رقم الآيبان</div>
                        <div className="font-mono text-sm" dir="ltr">{BANK_INFO.iban}</div>
                      </div>
                      <button onClick={() => copy(BANK_INFO.iban.replace(/\s/g, ''), 'الآيبان')}
                        className="text-green text-xs hover:underline cursor-pointer">نسخ</button>
                    </div>
                    <div className="flex items-center justify-between bg-gold/10 border border-gold/20 rounded-lg p-3">
                      <div className="flex-1">
                        <div className="text-xs text-muted">مساهمتك الرمزية</div>
                        <div className="font-bold text-gold text-lg">{formatNumber(totalDue)} ر.س</div>
                      </div>
                      <button onClick={() => copy(String(totalDue), 'المبلغ')}
                        className="text-green text-xs hover:underline cursor-pointer">نسخ</button>
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-sm text-dark block mb-2">إيصال التحويل</label>
                    <ReceiptUploader receiptUrl={receiptUrl} onUploaded={setReceiptUrl} />
                  </div>

                  <Button onClick={handleConfirmTransfer} loading={submitting} className="w-full"
                    disabled={!receiptUrl}>
                    تأكيد التحويل وإشعار الإدارة
                  </Button>
                </div>
              )}

              {method === 'online' && (
                <PaymentForm
                  amount={totalDue}
                  description={`دفع طلب ${generateRequestNumber(request.request_number)} - ${cat?.nameAr}`}
                  metadata={{
                    request_id: request.id,
                    request_number: request.request_number,
                    page_source: 'payment',
                    category: cat?.nameAr,
                  }}
                />
              )}

              {method === 'tamara' && (
                <div className="bg-card rounded-xl border border-[#3D1152]/20 p-5 space-y-4">
                  <div className="text-center">
                    <div
                      className="inline-flex items-center justify-center px-5 py-2 rounded-2xl text-white font-black text-lg mb-3"
                      style={{ background: 'linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%)' }}
                    >
                      تمارا
                    </div>
                    <p className="font-bold text-dark text-sm">ادفع على 3 أقساط بدون فوائد</p>
                    <p className="text-xs text-muted mt-1">
                      قسّم المبلغ على 3 دفعات شهرية · 100% متوافق مع الشريعة الإسلامية
                    </p>
                  </div>

                  <div className="bg-[#3D1152]/5 border border-[#3D1152]/15 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-bold text-dark">توزيع الأقساط</span>
                      <span className="text-xs text-muted">بدون رسوم إضافية</span>
                    </div>
                    {[1, 2, 3].map(n => (
                      <div key={n} className="flex justify-between items-center py-2 border-b border-[#3D1152]/10 last:border-0">
                        <span className="text-xs text-muted">القسط {n === 1 ? 'الأول (الآن)' : n === 2 ? 'الثاني' : 'الثالث'}</span>
                        <span className="font-bold text-sm text-dark">
                          {formatNumber(Math.ceil(totalDue / 3))} ر.س
                        </span>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={handleTamaraCheckout}
                    loading={tamaraLoading}
                    className="w-full !bg-[#3D1152] hover:!bg-[#2d0c3e]"
                  >
                    {tamaraLoading ? 'جارٍ التحويل لتمارا...' : `ادفع ${formatNumber(totalDue)} ر.س عبر تمارا`}
                  </Button>

                  <p className="text-[10px] text-muted text-center">
                    ستُحوَّل لصفحة تمارا الآمنة لإتمام الدفع
                  </p>
                </div>
              )}
            </>
          )}

          <Button variant="outline" onClick={() => router.push(`/dashboard/${id}`)} className="w-full">
            العودة لتفاصيل الطلب
          </Button>
        </div>
      </div>
    </div>
  )
}

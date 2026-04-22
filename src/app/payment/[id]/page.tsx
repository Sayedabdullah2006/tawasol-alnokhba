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

type Method = 'bank' | 'online'

export default function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()

  const [request, setRequest] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [method, setMethod] = useState<Method>('bank')
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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

      if (data.status !== 'approved' && data.status !== 'paid') {
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
            <div className="flex justify-between border-t border-border pt-2 mt-2">
              <span className="font-bold">الإجمالي المستحق</span>
              <span className="font-black text-2xl text-gold">{formatNumber(totalDue)} ر.س</span>
            </div>
            {request.estimated_reach > 0 && (
              <div className="flex justify-between text-xs pt-2 border-t border-border">
                <span className="text-muted">الوصول المتوقع</span>
                <span className="font-bold text-green">{formatNumberShort(request.estimated_reach)} متابع</span>
              </div>
            )}
            <p className="text-xs text-muted text-center pt-2">
              لتعديل الخدمات الإضافية، عُد لصفحة الطلب
            </p>
          </div>

          {isPaid ? (
            <div className="bg-green/5 border border-green/20 rounded-xl p-4 text-center">
              <div className="text-3xl mb-2">✅</div>
              <p className="font-bold text-green text-sm">تم استلام الدفع</p>
              <p className="text-xs text-muted mt-1">طلبك الآن قيد التجهيز للنشر</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMethod('bank')}
                  className={`p-4 rounded-xl border-2 text-center transition-all cursor-pointer ${
                    method === 'bank' ? 'border-green bg-green/5' : 'border-border bg-white hover:border-green/40'
                  }`}
                >
                  <div className="text-2xl mb-1">🏦</div>
                  <div className="font-bold text-sm text-dark">تحويل بنكي</div>
                  <div className="text-xs text-muted">للحساب البنكي للشركة</div>
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('online')}
                  className={`p-4 rounded-xl border-2 text-center transition-all cursor-pointer ${
                    method === 'online' ? 'border-green bg-green/5' : 'border-border bg-white hover:border-green/40'
                  }`}
                >
                  <div className="text-2xl mb-1">💳</div>
                  <div className="font-bold text-sm text-dark">دفع إلكتروني</div>
                  <div className="text-xs text-muted">مدى / فيزا / Apple Pay</div>
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
                        <div className="text-xs text-muted">المبلغ المستحق</div>
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

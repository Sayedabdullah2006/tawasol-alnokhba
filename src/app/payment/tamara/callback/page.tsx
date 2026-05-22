'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'

type PageState = 'loading' | 'success' | 'processing' | 'failed' | 'cancelled'

export default function TamaraCallbackPage() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const [state, setState] = useState<PageState>('loading')
  const [requestId,  setRequestId]  = useState<string | null>(null)

  useEffect(() => {
    const status = searchParams.get('status')
    const reqId  = searchParams.get('requestId')
    setRequestId(reqId)

    if (status === 'cancelled') {
      setState('cancelled')
      return
    }

    if (status === 'failed') {
      setState('failed')
      return
    }

    if (status === 'approved' && reqId) {
      // Poll DB up to 8 seconds — the webhook may have already fired
      let attempts = 0
      const interval = setInterval(async () => {
        attempts++
        try {
          const res  = await fetch(`/api/payment/tamara/status?requestId=${reqId}`)
          const data = await res.json()

          if (data.status === 'in_progress') {
            clearInterval(interval)
            setState('success')
          } else if (attempts >= 4) {
            clearInterval(interval)
            // Webhook not yet processed — show processing state
            setState('processing')
          }
        } catch {
          if (attempts >= 4) {
            clearInterval(interval)
            setState('processing')
          }
        }
      }, 2000)
      return () => clearInterval(interval)
    }

    setState('processing')
  }, [searchParams])

  if (state === 'loading') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-card rounded-2xl border border-border p-10 text-center">
          <LoadingSpinner size="lg" />
          <p className="text-muted mt-4 text-sm">جارٍ التحقق من حالة الدفع...</p>
        </div>
      </div>
    )
  }

  if (state === 'success') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="bg-green/5 border-b border-green/20 p-8 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-2xl font-black text-green mb-2">تم الدفع بنجاح!</h1>
            <p className="text-sm text-muted">تم استلام دفعتك عبر تمارا وتأكيدها</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
              <div className="text-2xl mb-2">🚀</div>
              <p className="font-bold text-blue-700 text-sm mb-1">ماذا بعد؟</p>
              <p className="text-xs text-blue-600">
                سيتم البدء في تجهيز طلبك فوراً. ستتلقى تحديثات عبر البريد الإلكتروني.
              </p>
            </div>
            <Button onClick={() => router.push('/dashboard')} className="w-full">
              عرض طلباتي
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'processing') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="bg-yellow-50 border-b border-yellow-200 p-8 text-center">
            <div className="text-6xl mb-4">⏳</div>
            <h1 className="text-2xl font-black text-yellow-700 mb-2">الدفع قيد المعالجة</h1>
            <p className="text-sm text-yellow-600">
              تمارا تعالج دفعتك — ستتلقى إيميل تأكيد خلال دقائق
            </p>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
              <div className="text-2xl mb-2">📧</div>
              <p className="text-xs text-blue-600">
                بمجرد تأكيد الدفع من تمارا سيتم تحديث حالة طلبك تلقائياً وستصلك رسالة على بريدك الإلكتروني.
              </p>
            </div>
            <Button onClick={() => router.push('/dashboard')} className="w-full">
              متابعة حالة الطلب
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'cancelled') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 p-8 text-center">
            <div className="text-6xl mb-4">↩️</div>
            <h1 className="text-2xl font-black text-gray-700 mb-2">تم إلغاء الدفع</h1>
            <p className="text-sm text-gray-500">لم يتم إجراء أي خصم من حسابك</p>
          </div>
          <div className="p-6 space-y-3">
            {requestId && (
              <Button onClick={() => router.push(`/payment/${requestId}`)} className="w-full">
                العودة لإتمام الدفع
              </Button>
            )}
            <Button variant="outline" onClick={() => router.push('/dashboard')} className="w-full">
              العودة للطلبات
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Failed
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="bg-red-50 border-b border-red-200 p-8 text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-black text-red-700 mb-2">فشل الدفع عبر تمارا</h1>
          <p className="text-sm text-red-600">لم يتم الخصم من حسابك</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
            <p className="font-bold text-yellow-700 text-sm mb-2">💡 ماذا تفعل؟</p>
            <ul className="text-xs text-yellow-600 space-y-1 text-right">
              <li>• تأكد من تسجيل دخولك في تطبيق تمارا</li>
              <li>• تأكد من وجود حد ائتمان كافٍ في تمارا</li>
              <li>• جرب طريقة دفع أخرى (ميسر أو تحويل بنكي)</li>
            </ul>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {requestId && (
              <Button onClick={() => router.push(`/payment/${requestId}`)} className="w-full">
                إعادة المحاولة
              </Button>
            )}
            <Button variant="outline" onClick={() => router.push('/dashboard')} className="w-full">
              العودة للطلبات
            </Button>
          </div>
          <p className="text-xs text-muted text-center">
            تحتاج مساعدة؟{' '}
            <Link href="/contact" className="text-green hover:underline">تواصل معنا</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

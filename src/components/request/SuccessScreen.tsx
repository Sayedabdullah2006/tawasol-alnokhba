'use client'

import Link from 'next/link'
import Button from '@/components/ui/Button'
import { formatNumber } from '@/lib/utils'

interface Props {
  requestNumber: string
  quotedTotal?: number
}

export default function SuccessScreen({ requestNumber, quotedTotal }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4">
      <div className="text-center max-w-md w-full">
        <div className="text-7xl mb-6 price-pop">✅</div>
        <h1 className="text-2xl font-black text-dark mb-2">تم إرسال طلبك بنجاح!</h1>
        <p className="text-lg font-bold text-green mb-1">رقم طلبك: {requestNumber}</p>

        {quotedTotal && quotedTotal > 0 ? (
          <div className="bg-green/5 border border-green/20 rounded-2xl p-4 my-5 text-center">
            <p className="text-sm text-muted mb-1">عرض السعر الإجمالي</p>
            <p className="text-3xl font-black text-green">{formatNumber(quotedTotal)} ر.س</p>
            <p className="text-xs text-muted mt-1">📧 تم إرسال العرض لبريدك الإلكتروني</p>
          </div>
        ) : (
          <p className="text-muted text-sm my-5">
            📧 تم إرسال تأكيد الطلب لبريدك الإلكتروني
          </p>
        )}

        <p className="text-sm text-muted mb-6">
          يمكنك متابعة حالة طلبك والموافقة على العرض من لوحة التحكم
        </p>

        <Link href="/dashboard">
          <Button size="lg" className="w-full">متابعة طلبي في لوحة التحكم</Button>
        </Link>
      </div>
    </div>
  )
}

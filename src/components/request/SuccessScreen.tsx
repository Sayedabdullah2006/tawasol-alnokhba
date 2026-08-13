'use client'

import Link from 'next/link'
import Button from '@/components/ui/Button'
import { formatNumber } from '@/lib/utils'
import { membershipBenefitLabel, type MembershipBenefitType } from '@/lib/memberships'

interface Props {
  requestNumber: string
  quotedTotal?: number
  membershipBalance?: number | null
  benefitBalances?: { type: MembershipBenefitType; remaining: number }[]
}

export default function SuccessScreen({ requestNumber, quotedTotal, membershipBalance, benefitBalances = [] }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4">
      <div className="text-center max-w-md w-full">
        <div className="text-7xl mb-6 price-pop">✅</div>
        <h1 className="text-2xl font-black text-dark mb-2">تم إرسال طلبك بنجاح!</h1>
        <p className="text-lg font-bold text-green mb-1">رقم طلبك: {requestNumber}</p>

        {membershipBalance != null && (
          <div className="my-5 rounded-2xl border border-green/20 bg-green/5 p-4 text-right">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-dark">الرصيد المتاح بعد الحجز</span>
              <strong className="text-2xl text-green">{membershipBalance}</strong>
            </div>
            {benefitBalances.length > 0 && <div className="mt-3 space-y-1.5 border-t border-green/15 pt-3">{benefitBalances.map(item => <div key={item.type} className="flex justify-between gap-3 text-xs"><span className="text-muted">{membershipBenefitLabel(item.type)}</span><strong className="text-dark">متبقي {item.remaining}</strong></div>)}</div>}
            <p className="mt-3 border-t border-green/15 pt-3 text-xs leading-5 text-muted">الطلب تحت مراجعة الإدارة. حُجز الرصيد مؤقتاً، ويُستهلك عند قبول الطلب وبدء التنفيذ، أو يعود تلقائياً إذا رُفض الطلب.</p>
          </div>
        )}

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

        <p className="text-sm text-muted mb-6">يمكنك متابعة حالة طلبك من لوحة التحكم</p>

        <Link href="/dashboard">
          <Button size="lg" className="w-full">متابعة طلبي في لوحة التحكم</Button>
        </Link>
      </div>
    </div>
  )
}

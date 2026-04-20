'use client'

import Link from 'next/link'
import Button from '@/components/ui/Button'

interface Props {
  requestNumber: string
}

export default function SuccessScreen({ requestNumber }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4">
      <div className="text-center max-w-md">
        <div className="text-7xl mb-6 price-pop">✅</div>
        <h1 className="text-2xl font-black text-dark mb-3">تم استلام طلبك بنجاح!</h1>
        <p className="text-lg font-bold text-green mb-2">رقم طلبك: {requestNumber}</p>
        <p className="text-muted text-sm mb-8">سيتواصل معك فريق تواصل النخبة خلال 24–48 ساعة</p>
        <Link href="/dashboard">
          <Button size="lg">متابعة طلبي في لوحة التحكم</Button>
        </Link>
      </div>
    </div>
  )
}

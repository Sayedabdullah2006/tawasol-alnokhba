import { Suspense } from 'react'
import RequestWizard from '@/components/request/RequestWizard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export const metadata = {
  title: 'تقديم طلب نشر | تواصل النخبة',
}

export default function RequestPage() {
  return (
    <Suspense fallback={<LoadingSpinner size="lg" />}>
      <RequestWizard />
    </Suspense>
  )
}

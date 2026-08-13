import { Suspense } from 'react'
import RequestWizard from '@/components/request/RequestWizard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export const metadata = {
  title: 'طلب من رصيد العضوية | تواصل النخبة',
}

export default function MembershipRequestPage() {
  return (
    <Suspense fallback={<LoadingSpinner size="lg" />}>
      <RequestWizard />
    </Suspense>
  )
}

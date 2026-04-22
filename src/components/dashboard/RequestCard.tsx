import Link from 'next/link'
import { CATEGORIES } from '@/lib/constants'
import { formatNumber, formatDate, generateRequestNumber } from '@/lib/utils'
import StatusBadge from './StatusBadge'

interface Props {
  request: {
    id: string
    request_number: number
    category: string
    status: string
    created_at: string
    admin_quoted_price?: number | null
    final_total?: number | null
    receipt_url?: string | null
  }
}

export default function RequestCard({ request: r }: Props) {
  const cat = CATEGORIES.find(c => c.id === r.category)
  const priceToShow = r.final_total ?? r.admin_quoted_price
  const showPrice = r.status !== 'pending' && priceToShow != null
  const effectiveStatus = (r.status === 'approved' && r.receipt_url) ? 'payment_review' : r.status

  return (
    <Link href={`/dashboard/${r.id}`}>
      <div className="bg-card rounded-2xl border border-border p-4 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-dark">{generateRequestNumber(r.request_number)}</span>
          <StatusBadge status={effectiveStatus} userRole="client" />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">{cat?.icon ?? '📋'}</span>
          <span className="font-medium text-dark">{cat?.nameAr ?? r.category}</span>
        </div>
        <div className="flex justify-between text-sm text-muted">
          <span>{showPrice ? `${formatNumber(priceToShow!)} ر.س` : ''}</span>
          <span>{formatDate(r.created_at)}</span>
        </div>
      </div>
    </Link>
  )
}

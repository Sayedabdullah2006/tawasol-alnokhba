import Link from 'next/link'
import { CATEGORIES } from '@/lib/constants'
import { formatNumber, formatDate, generateRequestNumber } from '@/lib/utils'
import StatusBadge from './StatusBadge'

interface Props {
  request: {
    id: string
    request_number: number
    category: string
    title?: string
    content?: string
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

  // قطع المحتوى لعرض جزء منه فقط
  const truncateContent = (text: string, maxLength: number = 80) => {
    if (!text) return ''
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
  }

  return (
    <Link href={`/dashboard/${r.id}`}>
      <div className="bg-card rounded-2xl border border-border p-4 hover:shadow-md transition-shadow cursor-pointer">
        {/* رأس البطاقة - رقم الطلب والحالة */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-dark">{generateRequestNumber(r.request_number)}</span>
          <StatusBadge status={effectiveStatus} userRole="client" />
        </div>

        {/* عنوان الخبر */}
        {r.title && (
          <div className="mb-2">
            <h3 className="font-bold text-dark text-base leading-tight line-clamp-2 mb-1">
              {r.title}
            </h3>
          </div>
        )}

        {/* جزء من المحتوى */}
        {r.content && (
          <div className="mb-3">
            <p className="text-sm text-muted leading-relaxed">
              {truncateContent(r.content)}
            </p>
          </div>
        )}

        {/* التصنيف */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{cat?.icon ?? '📋'}</span>
          <span className="text-sm font-medium text-muted">{cat?.nameAr ?? r.category}</span>
        </div>

        {/* السعر والتاريخ */}
        <div className="flex justify-between text-sm text-muted border-t border-border pt-2">
          <span>{showPrice ? `${formatNumber(priceToShow!)} ر.س` : ''}</span>
          <span>{formatDate(r.created_at)}</span>
        </div>
      </div>
    </Link>
  )
}

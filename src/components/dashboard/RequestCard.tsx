import Link from 'next/link'
import { CATEGORIES, PACKAGES } from '@/lib/constants'
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
    admin_notes?: string | null
    auto_quote_tier?: string | null
    selected_package?: string | null
  }
}

export default function RequestCard({ request: r }: Props) {
  const cat = CATEGORIES.find(c => c.id === r.category)
  const priceToShow = r.final_total ?? r.admin_quoted_price
  const showPrice = r.status !== 'pending' && priceToShow != null
  const effectiveStatus = (r.status === 'approved' && r.receipt_url) ? 'payment_review' : r.status
  const selectedPackage = PACKAGES.find(pkg => pkg.id === (r.auto_quote_tier ?? r.selected_package))

  // قطع المحتوى لعرض جزء منه فقط
  const truncateContent = (text: string, maxLength: number = 80) => {
    if (!text) return ''
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
  }

  return (
    <article className="glass-panel rounded-lg p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg sm:p-5" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-bold text-dark">{generateRequestNumber(r.request_number)}</span>
          <StatusBadge status={effectiveStatus} userRole="client" />
        </div>

        <Link href={`/dashboard/${r.id}`} className="mt-2 block text-base font-black leading-6 text-dark hover:text-green">
          {r.title || 'طلب بدون عنوان'}
        </Link>

        {r.content && <p className="mt-1 text-sm leading-6 text-muted">{truncateContent(r.content, 150)}</p>}

        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{cat?.icon ?? '📋'} {cat?.nameAr ?? r.category}</span>
          {selectedPackage && <span className="rounded-full border border-green/20 bg-green/10 px-2.5 py-1 text-green">{selectedPackage.name}</span>}
        </div>

        {r.admin_notes?.trim() && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="mb-1 text-xs font-black text-red-700">ملاحظة من الإدارة</p>
            <p className="text-sm leading-relaxed text-red-700 whitespace-pre-line break-words">{r.admin_notes.trim()}</p>
          </div>
        )}

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-3">
          <div><p className="text-[10px] font-bold text-muted">إجمالي الطلب</p><p className="mt-0.5 text-base font-black text-dark">{showPrice ? `${formatNumber(priceToShow!)} ر.س` : '—'}</p></div>
          <div className="text-left"><p className="text-[11px] text-muted">{formatDate(r.created_at)}</p><Link href={`/dashboard/${r.id}`} className="mt-1 inline-block text-xs font-bold text-green hover:underline">عرض تفاصيل الطلب</Link></div>
        </div>
    </article>
  )
}

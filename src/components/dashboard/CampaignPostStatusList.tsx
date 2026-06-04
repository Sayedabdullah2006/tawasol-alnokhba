'use client'

import { getReviewItems, getPostStatuses } from '@/lib/review-items'

interface Props {
  request: any
}

/**
 * عرض حالة نشر كل خبر في الحملة للعميل (للقراءة فقط) — بنفس اتساق لوحة الأدمن.
 */
export default function CampaignPostStatusList({ request }: Props) {
  const isCampaign = request?.request_type === 'campaign' && Array.isArray(request.campaign_posts) && request.campaign_posts.length > 0
  if (!isCampaign) return null

  const items = getReviewItems(request)
  const statuses = getPostStatuses(request)
  const completedCount = items.filter(it => statuses[it.index] === 'completed').length

  return (
    <div className="mt-4 bg-card rounded-2xl border border-border p-5" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-dark flex items-center gap-2">🚀 حالة أخبار حملتك</h3>
        <span className="text-xs bg-green/10 text-green-700 font-bold px-2 py-0.5 rounded-full">
          مكتمل {completedCount}/{items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map(item => {
          const done = statuses[item.index] === 'completed'
          return (
            <div key={item.index} className="flex items-center gap-2 rounded-xl border border-border bg-cream/40 p-3">
              <span className="w-6 h-6 rounded-full bg-green/10 text-green text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                {item.index + 1}
              </span>
              <span className="flex-1 min-w-0 text-xs font-bold text-dark truncate">{item.title}</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                done ? 'text-green-700 bg-green-100' : 'text-orange-700 bg-orange-100'
              }`}>
                {done ? '✅ منشور / مكتمل' : '⏳ قيد التنفيذ'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

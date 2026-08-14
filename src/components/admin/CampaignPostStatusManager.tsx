'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import { getReviewItems, getPostStatuses } from '@/lib/review-items'
import type { PublishRequest } from '@/types/publish-request'

interface Props {
  request: PublishRequest
}

/**
 * إدارة حالة نشر كل خبر في الحملة على حدة (قيد التنفيذ / مكتمل).
 * عند التحويل إلى مكتمل يصل العميل إيميل. حالة الطلب ككل يُكملها الأدمن يدوياً.
 */
export default function CampaignPostStatusManager({ request }: Props) {
  const { showToast } = useToast()
  const [busy, setBusy] = useState<number | null>(null)

  const isCampaign = request?.request_type === 'campaign' && Array.isArray(request.campaign_posts) && request.campaign_posts.length > 0
  if (!isCampaign) return null

  const items = getReviewItems(request)
  const statuses = getPostStatuses(request)

  const setStatus = async (index: number, status: 'in_progress' | 'completed') => {
    setBusy(index)
    try {
      const res = await fetch('/api/admin/update-post-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id, postIndex: index, status }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        showToast(status === 'completed' ? 'تم وسم الخبر كمكتمل وإشعار العميل' : 'تم إرجاع الخبر لقيد التنفيذ')
        window.location.reload()
      } else {
        showToast(data.error ?? 'فشل تحديث الحالة', 'error')
      }
    } catch {
      showToast('حدث خطأ في الاتصال', 'error')
    } finally {
      setBusy(null)
    }
  }

  const completedCount = items.filter(it => statuses[it.index] === 'completed').length

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-dark flex items-center gap-2">🚀 حالة نشر أخبار الحملة</h3>
        <span className="text-xs bg-green/10 text-green-700 font-bold px-2 py-0.5 rounded-full">
          مكتمل {completedCount}/{items.length}
        </span>
      </div>

      <div className="space-y-2">
        {items.map(item => {
          const st = statuses[item.index] ?? 'in_progress'
          const done = st === 'completed'
          return (
            <div key={item.index} className="flex items-center gap-2 rounded-xl border border-border bg-cream/40 p-3">
              <span className="w-6 h-6 rounded-full bg-green/10 text-green text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                {item.index + 1}
              </span>
              <span className="flex-1 min-w-0 text-xs font-bold text-dark truncate">{item.title}</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                done ? 'text-green-700 bg-green-100' : 'text-orange-700 bg-orange-100'
              }`}>
                {done ? '✅ مكتمل' : '⏳ قيد التنفيذ'}
              </span>
              {done ? (
                <Button
                  onClick={() => setStatus(item.index, 'in_progress')}
                  loading={busy === item.index}
                  disabled={busy !== null}
                  variant="ghost"
                  size="sm"
                >
                  إرجاع
                </Button>
              ) : (
                <Button
                  onClick={() => setStatus(item.index, 'completed')}
                  loading={busy === item.index}
                  disabled={busy !== null}
                  variant="outline"
                  size="sm"
                >
                  ✅ مكتمل
                </Button>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-muted">عند وسم خبر كمكتمل يصل العميل إيميل. أكمل الطلب كاملاً يدوياً من «تحديث الحالة» بعد إنهاء كل الأخبار.</p>
    </div>
  )
}

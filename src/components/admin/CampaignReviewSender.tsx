'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

export default function CampaignReviewSender({ request, onSent }: { request: any; onSent: () => void }) {
  const { showToast } = useToast()
  const [sending, setSending] = useState(false)
  const posts = Array.isArray(request?.campaign_posts) ? request.campaign_posts : []
  const [dates, setDates] = useState<Record<number, string>>(() => Object.fromEntries(
    posts.map((post: any, index: number) => [index, typeof post?.preferred_date === 'string' ? post.preferred_date : ''])
  ))
  if (request?.request_type !== 'campaign' || posts.length === 0) return null

  const send = async () => {
    if (!confirm(`سيصل للعميل بريد واحد يضم ${posts.length} منشوراً للمراجعة. هل تريد الإرسال الآن؟`)) return
    setSending(true)
    try {
      const res = await fetch('/api/send-campaign-content-for-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: request.id, proposedDates: dates }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { showToast(data.error ?? 'تعذّر إرسال الحملة للمراجعة', 'error'); return }
      showToast(`تم إرسال ${data.postsCount} منشورات للعميل في رسالة واحدة`)
      onSent()
    } catch {
      showToast('حدث خطأ في الاتصال', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-green/5 border border-green/25 rounded-2xl p-5 space-y-3" dir="rtl">
      <div>
        <h4 className="font-bold text-dark">📬 إرسال الحملة كاملة للمراجعة</h4>
        <p className="text-sm text-muted mt-1">يرسل بريد واحد للعميل يفتح منه جميع المنشورات، يختار التصميم المعتمد لكل منشور، ويضيف الملاحظات أو يعدل موعد النشر المقترح.</p>
      </div>
      <div className="space-y-2 rounded-xl bg-white/70 border border-green/15 p-3">
        <p className="text-xs font-bold text-dark">تاريخ النشر المتوقع لكل منشور</p>
        {posts.map((post: any, index: number) => (
          <label key={index} className="flex flex-wrap items-center gap-2 text-xs text-dark">
            <span className="min-w-0 flex-1 truncate">{index + 1}. {post?.title || `منشور ${index + 1}`}</span>
            <input
              type="date"
              value={dates[index] ?? ''}
              onChange={event => setDates(previous => ({ ...previous, [index]: event.target.value }))}
              className="w-[145px] rounded-lg border border-border bg-white px-2 py-1.5 text-xs"
            />
          </label>
        ))}
        <p className="text-[11px] text-muted">اختياري. يستطيع العميل تغيير الموعد عند اعتماد كل منشور.</p>
      </div>
      <Button onClick={send} loading={sending} disabled={sending} className="w-full">
        📬 إرسال {posts.length} منشورات للمراجعة في بريد واحد
      </Button>
    </div>
  )
}

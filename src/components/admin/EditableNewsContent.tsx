'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'

interface Props {
  requestId: string
  initialTitle: string
  initialContent: string
  postIndex?: number   // عند تمريره: تعديل منشور حملة محدّد
}

/**
 * تعديل الأدمن لعنوان/نص الخبر مباشرةً من تفاصيل الطلب (مفرد أو منشور حملة).
 */
export default function EditableNewsContent({ requestId, initialTitle, initialContent, postIndex }: Props) {
  const { showToast } = useToast()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(initialTitle ?? '')
  const [content, setContent] = useState(initialContent ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!content.trim()) { showToast('نص المحتوى مطلوب', 'error'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/update-request-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          title: title.trim(),
          content: content.trim(),
          postIndex: typeof postIndex === 'number' ? postIndex : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        showToast('تم حفظ التعديل')
        window.location.reload()
      } else {
        showToast(data.error ?? 'فشل الحفظ', 'error')
      }
    } catch {
      showToast('حدث خطأ في الاتصال', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-muted text-sm">عنوان الخبر</span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[11px] text-green font-bold hover:underline"
            >
              ✏️ تعديل
            </button>
          </div>
          <p className="font-semibold text-dark">{title || '—'}</p>
        </div>
        <div>
          <span className="text-muted block mb-1.5 text-sm">نص المحتوى</span>
          <div className="bg-cream rounded-xl p-4 text-dark text-sm whitespace-pre-line border border-border/50">
            {content}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 bg-cream/40 rounded-xl p-3 border border-green/30">
      <div>
        <label className="text-muted text-sm block mb-1">عنوان الخبر</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm font-semibold"
        />
      </div>
      <div>
        <label className="text-muted text-sm block mb-1">نص المحتوى</label>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm min-h-[140px] resize-y whitespace-pre-line"
        />
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setTitle(initialTitle ?? ''); setContent(initialContent ?? '') }} className="flex-1">
          إلغاء
        </Button>
        <Button size="sm" onClick={save} loading={saving} disabled={saving || !content.trim()} className="flex-1">
          💾 حفظ التعديل
        </Button>
      </div>
    </div>
  )
}

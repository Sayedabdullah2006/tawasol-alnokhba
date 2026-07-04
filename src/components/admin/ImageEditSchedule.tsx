'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import ImageLightbox from '@/components/ui/ImageLightbox'
import ScheduleSuggestions from '@/components/admin/ScheduleSuggestions'

/**
 * رفع صورة مباشرة + تعديلها بالذكاء الاصطناعي (تعديل دقيق image-to-image) + كتابة
 * نص المنشور + جدولة النشر على القنوات — بلا المرور بخط تحليل الخبر الكامل
 * (لا تحليل ولا اتجاهات؛ فقط الصورة كما رفعها الأدمن مع تعديل اختياري).
 */
export default function ImageEditSchedule() {
  const { showToast } = useToast()
  const supabase = createClient()

  const [uploading, setUploading] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  const [postText, setPostText] = useState('')
  const [schedWhen, setSchedWhen] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [scheduled, setScheduled] = useState(false)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      showToast('صيغة غير مدعومة (PNG/JPG/WEBP)', 'error'); return
    }
    if (file.size > 10 * 1024 * 1024) { showToast('الحجم يتجاوز 10 ميجابايت', 'error'); return }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `manual-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('content-images').upload(path, file)
      if (error) throw error
      const { data } = supabase.storage.from('content-images').getPublicUrl(path)
      setImageUrl(data.publicUrl)
      setScheduled(false)
      showToast('تم رفع الصورة', 'success')
    } catch {
      showToast('فشل رفع الصورة', 'error')
    } finally {
      setUploading(false)
    }
  }

  const applyEdit = async () => {
    if (!imageUrl) return
    if (!editNote.trim()) { showToast('اكتب التعديل المطلوب', 'error'); return }
    setEditing(true)
    try {
      const res = await fetch('/api/admin/ai-studio/edit-design', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, note: editNote }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { showToast(d.error ?? 'فشل التعديل', 'error'); return }
      setImageUrl(d.imageUrl)
      setEditNote('')
      showToast('تم تطبيق التعديل ✅', 'success')
    } catch {
      showToast('حدث خطأ أثناء التعديل', 'error')
    } finally {
      setEditing(false)
    }
  }

  const submitSchedule = async () => {
    if (!imageUrl && !postText.trim()) { showToast('ارفع صورة أو اكتب نصاً أولاً', 'error'); return }
    if (!schedWhen) { showToast('حدّد تاريخ ووقت الجدولة', 'error'); return }
    setScheduling(true)
    try {
      const res = await fetch('/api/postpulse/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: postText, imageUrl: imageUrl || undefined, scheduledLocal: schedWhen }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { showToast(d.error ?? 'فشل الجدولة', 'error'); return }
      const n = Array.isArray(d.accountIds) ? d.accountIds.length : 0
      setScheduled(true)
      showToast(`تمت الجدولة في ${n} قناة بتوقيت السعودية 🗓️`, 'success')
    } catch {
      showToast('حدث خطأ أثناء الجدولة', 'error')
    } finally {
      setScheduling(false)
    }
  }

  const card = 'bg-card rounded-2xl border border-border p-5 space-y-3'

  return (
    <div className="space-y-4" dir="rtl">
      <div className={card}>
        <h3 className="font-bold text-dark">✂️ رفع صورة وتعديلها مباشرة</h3>
        <p className="text-xs text-muted">ارفع أي صورة (تصميم جاهز أو صورة خام) وعدّلها بالذكاء الاصطناعي (حذف/إضافة نص أو عنصر) — بلا المرور بخطوات التحليل والاتجاهات الكاملة.</p>

        {imageUrl ? (
          <div className="space-y-3">
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="الصورة" onClick={() => setLightbox(imageUrl)} className="max-w-xs rounded-xl border border-border cursor-zoom-in" title="اضغط للتكبير" />
            </div>
            <div className="flex gap-2 justify-center">
              <label className="inline-flex items-center gap-1.5 text-xs font-bold text-dark border border-dashed border-border rounded-lg px-3 py-2 cursor-pointer hover:border-green hover:text-green transition-colors">
                <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={handleUpload} disabled={uploading} className="hidden" />
                {uploading ? 'جارٍ الرفع…' : '🔁 استبدال الصورة'}
              </label>
              <button onClick={() => { setImageUrl(''); setEditNote(''); setScheduled(false) }} className="text-xs text-red-600 hover:underline">إزالة</button>
            </div>
            <div>
              <label className="block text-xs font-bold text-dark mb-1">التعديل المطلوب على الصورة (اختياري):</label>
              <textarea value={editNote} onChange={e => setEditNote(e.target.value)}
                placeholder="مثال: احذف كلمة «كذا»، أضِف «كذا»، احذف هذا العنصر..."
                className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[70px] resize-y" />
              <Button onClick={applyEdit} loading={editing} disabled={editing || !editNote.trim()} size="sm" className="mt-2">
                ✂️ طبّق التعديل على هذه الصورة
              </Button>
            </div>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center gap-2 px-4 py-8 rounded-xl border-2 border-dashed border-border text-sm text-muted hover:border-green hover:text-green cursor-pointer transition-colors">
            <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={handleUpload} disabled={uploading} className="hidden" />
            <span className="text-3xl">⬆️</span>
            {uploading ? 'جارٍ الرفع...' : 'ارفع صورة (PNG/JPG/WEBP، حتى 10 ميجابايت)'}
          </label>
        )}
      </div>

      {imageUrl && (
        <div className={card}>
          <h4 className="font-bold text-dark">🗓️ جدولة نشر مباشرة</h4>
          <div>
            <label className="block text-xs font-bold text-dark mb-1">نص المنشور:</label>
            <textarea value={postText} onChange={e => setPostText(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm min-h-[100px] resize-y" placeholder="اكتب نص المنشور..." />
          </div>
          <div>
            <label className="block text-xs font-bold text-dark mb-1">الموعد (توقيت السعودية):</label>
            <input type="datetime-local" value={schedWhen} onChange={e => setSchedWhen(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm mb-2" />
            <ScheduleSuggestions value={schedWhen} onPick={setSchedWhen} />
          </div>
          <Button onClick={submitSchedule} loading={scheduling} disabled={scheduling || !schedWhen} className="w-full">
            {scheduled ? '✅ تمت الجدولة — عدِّل الموعد للجدولة مرة أخرى' : '🗓️ جدولة النشر على كل القنوات'}
          </Button>
        </div>
      )}

      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}

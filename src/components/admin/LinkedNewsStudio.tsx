'use client'

import { useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { runStoryPipeline, type LinkStory, type StoryResponse } from '@/lib/studio-story-pipeline'
import { createClient } from '@/lib/supabase'

export default function LinkedNewsStudio({ onOpen, onBusy, disabled = false }: { onOpen: (story: LinkStory) => void; onBusy: (busy: boolean) => void; disabled?: boolean }) {
  const { showToast } = useToast()
  const [url, setUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [stories, setStories] = useState<LinkStory[]>([])
  const [uploadingStory, setUploadingStory] = useState<string | null>(null)
  const stop = useRef(false)
  const busy = importing || running || disabled || uploadingStory !== null

  const importLink = async () => {
    setImporting(true); onBusy(true)
    try {
      const response = await fetch('/api/admin/ai-studio/import-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'تعذّر استيراد الرابط')
      if (!Array.isArray(data.stories) || !data.stories.length) throw new Error('لم تُستخرج أخبار من الصفحة')
      setStories(data.stories.map((story: { title: string; content: string; images: string[]; sourceUrl: string }) => ({ ...story, id: crypto.randomUUID(), selected: true, selectedImages: [], designs: [], status: 'جاهز' })))
      showToast(`تم استخراج ${data.stories.length} خبر؛ راجع النصوص واختر صور كل خبر`, 'success')
    } catch (error) { showToast(error instanceof Error ? error.message : 'تعذّر استيراد الرابط', 'error') }
    finally { setImporting(false); onBusy(false) }
  }
  const patch = (id: string, value: Partial<LinkStory>, reset = false) => setStories(previous => previous.map(story => story.id === id ? { ...story, ...(reset ? { analysis: undefined, tweets: undefined, concepts: undefined, designs: [], error: undefined, status: 'جاهز' } : {}), ...value } : story))
  const uploadImage = async (story: LinkStory, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { showToast('ارفع صورة PNG أو JPEG أو WebP', 'error'); return }
    if (file.size > 10 * 1024 * 1024) { showToast('الحجم يتجاوز 10MB', 'error'); return }
    setUploadingStory(story.id); onBusy(true)
    try {
      const client = createClient()
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `studio-link-${story.id}-${crypto.randomUUID()}.${extension}`
      const { error } = await client.storage.from('content-images').upload(path, file, { contentType: file.type })
      if (error) throw error
      const { data } = client.storage.from('content-images').getPublicUrl(path)
      patch(story.id, { images: [...story.images, data.publicUrl], selectedImages: [...story.selectedImages, data.publicUrl] }, true)
      showToast('تم رفع الصورة واختيارها لهذا الخبر', 'success')
    } catch { showToast('تعذّر رفع الصورة؛ حاول مجدداً', 'error') }
    finally { setUploadingStory(null); onBusy(false) }
  }
  const copyTweets = async (text: string) => {
    try { await navigator.clipboard.writeText(text); showToast('تم نسخ التغريدات', 'success') }
    catch { showToast('تعذّر النسخ التلقائي؛ يمكنك تحديد النص ونسخه', 'error') }
  }
  const run = async (target: 'tweets' | 'designs' = 'designs') => {
    stop.current = false; setStopping(false); setRunning(true); onBusy(true)
    try {
      for (const story of stories.filter(s => s.selected)) {
        if (stop.current) break
        await runStoryPipeline(story, async payload => {
          const response = await fetch('/api/admin/ai-studio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'تعذّر التوليد')
          return data as StoryResponse
        }, updated => patch(story.id, updated), () => stop.current, target)
      }
    } finally {
      setStories(previous => previous.map(story => story.status?.startsWith('جارٍ') ? { ...story, status: 'متوقف؛ يمكن الاستكمال' } : story))
      setRunning(false); setStopping(false); onBusy(false)
    }
  }
  return <section className="bg-white rounded-2xl border border-border p-4 space-y-3">
    <h3 className="font-bold text-dark">🔗 أخبار من رابط</h3>
    <p className="text-xs text-muted">استورد صفحة الخبر. المقال الذي يجمع قصصاً مستقلة يُفصل إلى أخبار، ولكل خبر تحليله وتغريداته المقترحة واتجاهاته الثلاثة وتصاميمه. النتائج تبقى هنا خلال الجلسة.</p>
    <div className="flex flex-wrap gap-2">
      <input type="url" dir="ltr" aria-label="رابط صفحة الأخبار" value={url} onChange={e => setUrl(e.target.value)} disabled={busy} placeholder="https://..." className="flex-1 min-w-48 border border-border rounded-xl px-3 py-2 text-sm" />
      <Button onClick={importLink} loading={importing} disabled={busy || !url.trim()} size="sm">استيراد وفصل الأخبار</Button>
    </div>
    {stories.length > 0 && <>
      <p className="text-xs text-muted">{stories.length} خبر مستخرج — {stories.filter(s => s.selected).length} محدد. اختر صور كل خبر أو ارفع صورته قبل التوليد. بدون صورة يُصمّم بالنص والأيقونات والزخارف فقط، دون صورة مخترعة. تعديل النص أو الصور يبدأ توليداً جديداً لهذا الخبر.</p>
      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => run('tweets')} variant="outline" disabled={busy || !stories.some(s => s.selected && s.content.trim())} size="sm">توليد التغريدات فقط</Button>
        <Button onClick={() => run('designs')} disabled={busy || !stories.some(s => s.selected && s.content.trim())} size="sm">توليد / استكمال التغريدات والتصاميم</Button>
        {running && <Button variant="outline" size="sm" disabled={stopping} onClick={() => { stop.current = true; setStopping(true) }}>{stopping ? 'بانتظار انتهاء الخطوة الجارية...' : 'إيقاف بعد الخطوة الجارية'}</Button>}
      </div>
      {stories.map((story, index) => <article key={story.id} className="border border-border rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-sm font-bold flex items-center gap-2"><input type="checkbox" checked={story.selected} disabled={busy} onChange={e => patch(story.id, { selected: e.target.checked })} />خبر {index + 1}</label>
          <span className="text-xs text-green">{story.status} · {story.designs.length} / ٣ تصاميم</span>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onOpen(story)}>فتح في المحرر</Button>
          <a href={story.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-green underline">المصدر</a>
        </div>
        <input aria-label={`عنوان خبر ${index + 1}`} value={story.title} disabled={busy} onChange={e => patch(story.id, { title: e.target.value }, true)} className="w-full border border-border rounded-lg p-2 text-sm font-bold" />
        <textarea aria-label={`تفاصيل خبر ${index + 1}`} value={story.content} disabled={busy} onChange={e => patch(story.id, { content: e.target.value }, true)} className="w-full border border-border rounded-lg p-2 text-sm min-h-24" />
        <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border text-sm ${busy ? 'text-muted opacity-50' : 'text-green cursor-pointer hover:border-green'}`}>
          <input aria-label={`رفع صورة لخبر ${index + 1}`} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => uploadImage(story, event)} className="hidden" />
          {uploadingStory === story.id ? 'جارٍ رفع صورة الخبر...' : '⬆️ رفع صورة لهذا الخبر'}
        </label>
        <p className="text-xs text-muted">{story.selectedImages.length ? `${story.selectedImages.length} صورة محددة لهذا الخبر` : 'لا توجد صورة محددة؛ سيكون التصميم بالنص والعناصر البصرية فقط.'}</p>
        {story.images.length > 0 && <div className="flex gap-2 flex-wrap">{story.images.map(image => <button type="button" key={image} disabled={busy} aria-label="اختيار صورة لهذا الخبر" aria-pressed={story.selectedImages.includes(image)} onClick={() => patch(story.id, { selectedImages: story.selectedImages.includes(image) ? story.selectedImages.filter(i => i !== image) : [...story.selectedImages, image] }, true)} className={`w-20 h-20 overflow-hidden rounded-lg border-2 ${story.selectedImages.includes(image) ? 'border-green ring-2 ring-green/30' : 'border-border'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={`صورة خبر ${index + 1}`} className="w-full h-full object-cover" />
        </button>)}</div>}
        {story.tweets && <div className="bg-cream rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-bold text-green">التغريدات المقترحة لهذا الخبر</h4><Button variant="outline" size="sm" onClick={() => copyTweets(story.tweets!)}>نسخ التغريدات</Button></div>
          <textarea aria-label={`التغريدات المقترحة لخبر ${index + 1}`} readOnly value={story.tweets} className="w-full min-h-48 rounded-lg p-2 text-sm leading-relaxed bg-white border border-border" />
        </div>}
        {story.error && <p role="alert" className="text-xs text-red-600">{story.error} — يمكنك استكمال هذا الخبر؛ تُحفظ الخطوات المكتملة.</p>}
        {story.concepts && <p className="text-xs text-muted">الاتجاهات: {story.concepts.map(c => c.title).join(' · ')}</p>}
        {story.designs.length > 0 && <div className="grid grid-cols-3 gap-2">{story.designs.map(design => <a key={design.conceptIndex} href={design.imageUrl} target="_blank" rel="noopener noreferrer" className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={design.imageUrl} alt={design.title} className="w-full rounded-lg aspect-[4/5] object-cover" /><p className="text-xs text-muted">{design.title}</p>
        </a>)}</div>}
      </article>)}
    </>}
  </section>
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase'
import { formatInsoDate, type InsoCoverageItem, type InsoPhase } from '@/lib/inso-2026'

const PHASES: Array<{ id: InsoPhase; label: string; color: string }> = [
  { id: 'before', label: 'قبل الفعالية', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'during', label: 'أثناء الفعالية', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  { id: 'after', label: 'بعد الفعالية', color: 'bg-violet-50 text-violet-700 border-violet-200' },
]

const STATUS: Record<InsoCoverageItem['publication_status'], { label: string; className: string }> = {
  draft: { label: 'مسودة', className: 'bg-gray-100 text-gray-600' },
  ready: { label: 'جاهز', className: 'bg-amber-50 text-amber-700' },
  scheduled: { label: 'مجدول', className: 'bg-blue-50 text-blue-700' },
  published: { label: 'منشور', className: 'bg-green-50 text-green-700' },
}

const ACTIVE_DAY_STORAGE_KEY = 'inso-2026-active-day'
const MANUAL_SCHEDULE_HOURS = Array.from({ length: 14 }, (_, index) => index + 9)

type ScheduledCalendarItem = { when: string; status: string }

const isActiveScheduleStatus = (status: string) => !['failed', 'cancelled', 'canceled', 'draft', 'media_import_failed'].includes(status.toLowerCase())

export default function InsoCoveragePage() {
  const { showToast } = useToast()
  const supabase = createClient()
  const [items, setItems] = useState<InsoCoverageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeDate, setActiveDate] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [designNote, setDesignNote] = useState('')
  const [designExactText, setDesignExactText] = useState('')
  const [scheduleItem, setScheduleItem] = useState<InsoCoverageItem | null>(null)
  const [scheduleWhen, setScheduleWhen] = useState('')
  const [scheduleText, setScheduleText] = useState('')
  const [scheduleImageUrl, setScheduleImageUrl] = useState('')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduledCalendarItems, setScheduledCalendarItems] = useState<ScheduledCalendarItem[]>([])
  const [scheduleAvailabilityLoading, setScheduleAvailabilityLoading] = useState(false)
  const [scheduleOpenedAt, setScheduleOpenedAt] = useState(0)
  const [cancelScheduleItem, setCancelScheduleItem] = useState<InsoCoverageItem | null>(null)
  const [publishItem, setPublishItem] = useState<InsoCoverageItem | null>(null)
  const [publishText, setPublishText] = useState('')
  const [deleteItem, setDeleteItem] = useState<InsoCoverageItem | null>(null)
  const [designPreview, setDesignPreview] = useState<{ title: string; imageUrl: string } | null>(null)
  const [savedTexts, setSavedTexts] = useState<Record<string, string>>({})
  const [designItem, setDesignItem] = useState<InsoCoverageItem | null>(null)
  const [designSources, setDesignSources] = useState<string[]>([])
  const [designHasVideo, setDesignHasVideo] = useState(false)
  const [designVideoOrientation, setDesignVideoOrientation] = useState<'landscape' | 'portrait'>('landscape')
  const [designUploading, setDesignUploading] = useState(false)
  const [designOptionsGenerating, setDesignOptionsGenerating] = useState(false)
  const [generatingDesignItemId, setGeneratingDesignItemId] = useState<string | null>(null)
  const [designRevealTarget, setDesignRevealTarget] = useState<string | null>(null)
  const [editOption, setEditOption] = useState<{ item: InsoCoverageItem; optionId: string } | null>(null)
  const [editNote, setEditNote] = useState('')
  const [editExactText, setEditExactText] = useState('')
  const [editSources, setEditSources] = useState<string[]>([])
  const [editUploading, setEditUploading] = useState(false)
  const [addingSaved, setAddingSaved] = useState(false)
  const [savedTitle, setSavedTitle] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [videoDialogOpen, setVideoDialogOpen] = useState(false)
  const [videoText, setVideoText] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoName, setVideoName] = useState('')
  const [videoScheduleWhen, setVideoScheduleWhen] = useState('')
  const [videoUploading, setVideoUploading] = useState(false)
  const [videoPublishing, setVideoPublishing] = useState<'publish' | 'schedule' | null>(null)
  const [generatingPending, setGeneratingPending] = useState(false)
  const [exportingReport, setExportingReport] = useState(false)
  const skipNextTextSave = useRef<string | null>(null)
  const dayTabsRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/inso')
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذّر تحميل الخطة')
      const incoming = data.items ?? []
      setItems(incoming)
      setSavedTexts(Object.fromEntries(incoming.map((item: InsoCoverageItem) => [item.id, item.post_text ?? ''])))
      const availableDays = new Set(incoming.map((item: InsoCoverageItem) => item.coverage_date))
      const savedDay = window.localStorage.getItem(ACTIVE_DAY_STORAGE_KEY)
      const todayParts = new Intl.DateTimeFormat('en', {
        timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date())
      const todayPart = (type: Intl.DateTimeFormatPartTypes) => todayParts.find(part => part.type === type)?.value
      const todayInRiyadh = `${todayPart('year')}-${todayPart('month')}-${todayPart('day')}`
      setActiveDate(current => {
        if (availableDays.has(todayInRiyadh)) return todayInRiyadh
        if (current && availableDays.has(current)) return current
        if (savedDay && availableDays.has(savedDay)) return savedDay
        return incoming[0]?.coverage_date || ''
      })
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّر تحميل الخطة', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, setSavedTexts])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const days = useMemo(() => [...new Set(items.map(item => item.coverage_date))], [items])
  const activeItems = items.filter(item => item.coverage_date === activeDate)
  const phaseForDate = activeItems[0]?.phase ?? 'during'
  const savedDayItems = activeItems.filter(item => savedTexts[item.id]?.trim())
  const availableManualTimes = useMemo(() => {
    if (!scheduleDate) return []
    const booked = scheduledCalendarItems
      .filter(item => isActiveScheduleStatus(item.status))
      .map(item => new Date(item.when).getTime())
      .filter(Number.isFinite)
    return MANUAL_SCHEDULE_HOURS.map(hour => {
      const local = `${scheduleDate}T${String(hour).padStart(2, '0')}:00`
      const timestamp = new Date(`${local}:00+03:00`).getTime()
      const isFuture = timestamp >= scheduleOpenedAt + 60 * 1000
      const isFree = booked.every(time => Math.abs(time - timestamp) >= 60 * 60 * 1000)
      return { local, hour, available: isFuture && isFree }
    }).filter(slot => slot.available)
  }, [scheduleDate, scheduledCalendarItems, scheduleOpenedAt])

  useEffect(() => {
    if (!activeDate) return
    const activeTab = dayTabsRef.current?.querySelector<HTMLButtonElement>(`[data-coverage-date="${activeDate}"]`)
    activeTab?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [activeDate, days.length])

  useEffect(() => {
    if (!designRevealTarget) return
    document.getElementById(`inso-item-${designRevealTarget}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setDesignRevealTarget(null)
  }, [designRevealTarget])

  const replace = (item: InsoCoverageItem) => {
    setItems(current => current.map(entry => entry.id === item.id ? item : entry))
  }

  const selectDay = (date: string) => {
    setActiveDate(date)
    window.localStorage.setItem(ACTIVE_DAY_STORAGE_KEY, date)
    setDesignNote('')
  }

  const skipTextSaveForAction = (itemId: string) => {
    skipNextTextSave.current = itemId
    window.setTimeout(() => {
      if (skipNextTextSave.current === itemId) skipNextTextSave.current = null
    }, 0)
  }

  const callAction = async (action: string, payload: Record<string, unknown>, label: string) => {
    setBusy(`${action}:${String(payload.id ?? '')}`)
    try {
      const response = await fetch('/api/admin/inso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'تعذّر تنفيذ الإجراء')
      if (data.deletedId) {
        setItems(current => current.filter(item => item.id !== data.deletedId))
        setSavedTexts(current => {
          const next = { ...current }
          delete next[data.deletedId]
          return next
        })
      }
      if (data.item) {
        if (action === 'add-saved') {
          setItems(current => [...current, data.item])
          setSavedTexts(current => ({ ...current, [data.item.id]: data.item.post_text ?? '' }))
        } else {
          replace(data.item)
          if (action === 'save' || action === 'generate-copy' || action === 'rewrite-saved') setSavedTexts(current => ({ ...current, [data.item.id]: data.item.post_text ?? '' }))
        }
      }
      showToast(label, 'success')
      return data
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّر تنفيذ الإجراء', 'error')
      return null
    } finally {
      setBusy(null)
    }
  }

  const openPublishDialog = (item: InsoCoverageItem) => {
    if (!item.post_text || !item.design_options?.some(option => option.selected)) {
      showToast('ولّد النص والتصميم ثم اختر التصميم المعتمد أولاً', 'error')
      return
    }
    setPublishItem(item)
    setPublishText(item.post_text)
  }

  const openScheduleDialog = (item: InsoCoverageItem, imageUrl: string) => {
    const postText = (savedTexts[item.id] ?? item.post_text ?? '').trim()
    if (!postText || !imageUrl) {
      showToast('احفظ نص المنشور واختر التصميم المعتمد أولاً', 'error')
      return
    }
    setScheduleItem(item)
    setScheduleText(postText)
    setScheduleImageUrl(imageUrl)
    setScheduleWhen('')
    setScheduleDate(item.coverage_date)
    setScheduleOpenedAt(Date.now())
    setScheduleAvailabilityLoading(true)
    void fetch('/api/admin/schedule')
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => setScheduledCalendarItems(Array.isArray(data.items) ? data.items : []))
      .catch(() => showToast('تعذّر جلب المواعيد المجدولة، راجع الوقت قبل التأكيد', 'error'))
      .finally(() => setScheduleAvailabilityLoading(false))
  }

  const shareToWhatsApp = async (item: InsoCoverageItem, imageUrl: string) => {
    const postText = (savedTexts[item.id] ?? item.post_text ?? '').trim()
    if (!postText || !imageUrl) {
      showToast('احفظ نص المنشور أولاً', 'error')
      return
    }
    try {
      const response = await fetch(imageUrl)
      if (!response.ok) throw new Error('Image unavailable')
      const image = await response.blob()
      const file = new File([image], `${item.title || 'inso-design'}.png`, { type: image.type || 'image/png' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          // Some mobile WhatsApp clients ignore the Web Share "text" caption when a file is attached.
          // Copy it first and provide it in both fields so it is either included or ready to paste.
          await navigator.clipboard?.writeText(postText)
          await navigator.share({ title: postText, text: postText, files: [file] })
          showToast('تمت مشاركة الصورة، والنص نُسخ أيضاً: ألصقه في وصف الصورة داخل واتساب إن لم يظهر تلقائياً.', 'success')
          return
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return
        }
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(postText)}`, '_blank', 'noopener,noreferrer')
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard unavailable')
      await navigator.clipboard.write([new ClipboardItem({ [image.type || 'image/png']: image })])
      showToast('تم فتح واتساب ونسخ التصميم. ألصقه في المحادثة ثم أرسل.', 'success')
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(postText)}`, '_blank', 'noopener,noreferrer')
      showToast('تم فتح واتساب بالنص. حمّل التصميم أو انسخ الرابط لإرفاق الصورة يدوياً.', 'success')
    }
  }

  const publishNow = async () => {
    if (!publishItem || !publishText.trim() || !publishItem.design_url) return
    const item = publishItem
    const postText = publishText.trim()
    setBusy(`publish:${item.id}`)
    try {
      const saveResponse = await fetch('/api/admin/inso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', id: item.id, postText }),
      })
      const saved = await saveResponse.json().catch(() => ({}))
      if (!saveResponse.ok) throw new Error(saved.error || 'تعذّر حفظ التعديل')
      if (saved.item) {
        replace(saved.item)
        setSavedTexts(current => ({ ...current, [saved.item.id]: saved.item.post_text ?? '' }))
      }
      const response = await fetch('/api/postpulse/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: postText, imageUrl: item.design_url }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'فشل النشر')
      await callAction('mark-published', { id: item.id }, 'تم النشر عبر القنوات المتصلة')
      setPublishItem(null)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'فشل النشر', 'error')
    } finally {
      setBusy(null)
    }
  }

  const schedule = async () => {
    if (!scheduleItem || !scheduleWhen) { showToast('حدّد تاريخ ووقت الجدولة', 'error'); return }
    const postText = scheduleText.trim()
    if (!postText || !scheduleImageUrl) { showToast('راجع النص والتصميم قبل الجدولة', 'error'); return }
    setBusy(`schedule:${scheduleItem.id}`)
    try {
      if (postText !== (scheduleItem.post_text ?? '').trim()) {
        const saveResponse = await fetch('/api/admin/inso', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', id: scheduleItem.id, postText }),
        })
        const saved = await saveResponse.json().catch(() => ({}))
        if (!saveResponse.ok) throw new Error(saved.error || 'تعذّر حفظ تعديل النص')
        if (saved.item) {
          replace(saved.item)
          setSavedTexts(current => ({ ...current, [saved.item.id]: saved.item.post_text ?? '' }))
        }
      }
      const response = await fetch('/api/postpulse/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: postText, imageUrl: scheduleImageUrl, scheduledLocal: scheduleWhen }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'فشلت الجدولة')
      const scheduledOption = scheduleItem.design_options?.find(option => option.imageUrl === scheduleImageUrl)
      await callAction('mark-scheduled', { id: scheduleItem.id, scheduledFor: data.scheduledTime, optionId: scheduledOption?.id }, 'تمت الجدولة عبر القنوات المتصلة')
      setScheduleItem(null); setScheduleWhen(''); setScheduleText(''); setScheduleImageUrl('')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'فشلت الجدولة', 'error')
    } finally {
      setBusy(null)
    }
  }

  const cancelSchedule = async () => {
    if (!cancelScheduleItem) return
    const cancelled = await callAction('cancel-scheduled', { id: cancelScheduleItem.id }, 'تم إلغاء الجدولة من PostPulse')
    if (cancelled?.item) setCancelScheduleItem(null)
  }

  const uploadDesignSources = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    if (files.some(file => !['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type))) { showToast('ارفق صورا بصيغة PNG أو JPG أو WEBP', 'error'); return }
    const remaining = Math.max(0, 5 - designSources.length)
    if (!remaining) { showToast('يمكن إرفاق 5 صور مرجعية كحد أقصى', 'error'); return }
    const acceptedFiles = files.slice(0, remaining)
    setDesignUploading(true)
    try {
      const uploaded = await Promise.all(acceptedFiles.map(async file => {
        const extension = file.name.split('.').pop() || 'png'
        const path = `inso-source-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
        const { error } = await supabase.storage.from('content-images').upload(path, file)
        if (error) throw error
        return supabase.storage.from('content-images').getPublicUrl(path).data.publicUrl
      }))
      setDesignSources(current => [...current, ...uploaded])
      if (files.length > acceptedFiles.length) showToast('تم إرفاق أول 5 صور فقط', 'success')
    } catch { showToast('تعذّر رفع إحدى الصور المرجعية', 'error') } finally { setDesignUploading(false) }
  }

  const uploadEditSources = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    if (files.some(file => !['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type))) { showToast('أرفق صورا بصيغة PNG أو JPG أو WEBP', 'error'); return }
    const remaining = Math.max(0, 5 - editSources.length)
    if (!remaining) { showToast('يمكن إرفاق 5 صور بديلة كحد أقصى', 'error'); return }
    const acceptedFiles = files.slice(0, remaining)
    setEditUploading(true)
    try {
      const uploaded = await Promise.all(acceptedFiles.map(async file => {
        const extension = file.name.split('.').pop() || 'png'
        const path = `inso-edit-source-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
        const { error } = await supabase.storage.from('content-images').upload(path, file)
        if (error) throw error
        return supabase.storage.from('content-images').getPublicUrl(path).data.publicUrl
      }))
      setEditSources(current => [...current, ...uploaded])
      if (files.length > acceptedFiles.length) showToast('تم إرفاق أول 5 صور فقط', 'success')
    } catch { showToast('تعذّر رفع إحدى الصور البديلة', 'error') } finally { setEditUploading(false) }
  }

  const openDesigner = (item: InsoCoverageItem) => {
    setDesignItem(item)
    setDesignSources([])
    setDesignNote('')
    setDesignExactText('')
    setDesignHasVideo(false)
    setDesignVideoOrientation('landscape')
  }

  const generateDesignOptions = async () => {
    if (!designItem) return
    setDesignOptionsGenerating(true)
    setGeneratingDesignItemId(designItem.id)
    try {
      for (let optionIndex = 0; optionIndex < 3; optionIndex += 1) {
        const result = await callAction('generate-design-option', {
          id: designItem.id,
          postText: designItem.post_text,
          designNote,
          exactText: designExactText,
          sourceImages: designSources,
          hasVideo: designHasVideo,
          videoOrientation: designVideoOrientation,
          optionIndex,
          resetDesignOptions: optionIndex === 0,
        }, `ظهر الخيار ${optionIndex + 1} من 3`)
        if (result?.item) {
          setDesignItem(null)
          setDesignRevealTarget(designItem.id)
        }
      }
    } finally {
      setDesignOptionsGenerating(false)
      setGeneratingDesignItemId(null)
    }
  }

  const addSavedPost = async () => {
    if (!savedTitle.trim() || !savedContent.trim()) { showToast('اكتب عنوان المنشور ونصه أولا', 'error'); return }
    const result = await callAction('add-saved', {
      coverageDate: activeDate, phase: phaseForDate, title: savedTitle, postText: savedContent,
    }, 'تم حفظ المنشور داخل محتوى اليوم')
    if (result?.item) {
      setSavedTitle(''); setSavedContent(''); setAddingSaved(false)
      openDesigner(result.item)
    }
  }

  const generatePendingPosts = async () => {
    const pendingItems = activeItems.filter(item => !item.post_text?.trim())
    if (!pendingItems.length) { showToast('تم توليد جميع منشورات هذا اليوم', 'success'); return }
    setGeneratingPending(true)
    try {
      for (const item of pendingItems) {
        await callAction('generate-copy', { id: item.id }, 'تم توليد المنشور وحفظه ضمن محتوى اليوم')
      }
    } finally {
      setGeneratingPending(false)
    }
  }

  const rewriteSavedPost = async () => {
    if (!savedContent.trim()) { showToast('اكتب النص الذي تريد إعادة صياغته أولاً', 'error'); return }
    const result = await callAction('rewrite-saved', { title: savedTitle, postText: savedContent }, 'تمت إعادة صياغة المنشور')
    if (result?.postText) setSavedContent(result.postText)
  }

  const rewriteSavedContent = async (item: InsoCoverageItem) => {
    await callAction('rewrite-saved', { id: item.id, title: item.title, postText: item.post_text }, 'تمت إعادة صياغة المنشور وحفظه')
  }

  const deleteSavedContent = async () => {
    if (!deleteItem) return
    const removed = await callAction('delete-saved', { id: deleteItem.id }, 'تم حذف المحتوى المحفوظ')
    if (removed) setDeleteItem(null)
  }

  const openVideoDialog = () => {
    setVideoText('')
    setVideoUrl('')
    setVideoName('')
    setVideoScheduleWhen('')
    setVideoDialogOpen(true)
  }

  const uploadVideo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const allowed = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type) || /\.(mp4|webm|mov)$/i.test(file.name)
    if (!allowed) { showToast('ارفق مقطع MP4 أو MOV أو WEBM', 'error'); return }
    if (file.size > 100 * 1024 * 1024) { showToast('الحد الأقصى لحجم الفيديو 100 ميجابايت', 'error'); return }
    setVideoUploading(true)
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'mp4'
      const path = `inso-video-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
      const { error } = await supabase.storage.from('content-images').upload(path, file, { contentType: file.type || 'video/mp4' })
      if (error) throw error
      const { data } = supabase.storage.from('content-images').getPublicUrl(path)
      setVideoUrl(data.publicUrl)
      setVideoName(file.name)
      showToast('تم رفع الفيديو وجاهز للمراجعة', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّر رفع الفيديو', 'error')
    } finally {
      setVideoUploading(false)
    }
  }

  const submitVideo = async (mode: 'publish' | 'schedule') => {
    if (!videoText.trim() || !videoUrl) { showToast('أدخل النص وارفع مقطع الفيديو أولاً', 'error'); return }
    if (mode === 'schedule' && !videoScheduleWhen) { showToast('حدّد تاريخ ووقت الجدولة', 'error'); return }
    setVideoPublishing(mode)
    try {
      const response = await fetch(mode === 'publish' ? '/api/postpulse/publish' : '/api/postpulse/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: videoText.trim(), imageUrl: videoUrl, mediaType: 'video',
          ...(mode === 'schedule' ? { scheduledLocal: videoScheduleWhen } : {}),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || (mode === 'publish' ? 'فشل نشر الفيديو' : 'فشلت جدولة الفيديو'))
      showToast(mode === 'publish' ? 'تم نشر الفيديو عبر القنوات المتصلة' : 'تمت جدولة الفيديو عبر القنوات المتصلة', 'success')
      setVideoDialogOpen(false)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّر تنفيذ العملية', 'error')
    } finally {
      setVideoPublishing(null)
    }
  }

  const exportCampaignReport = async () => {
    setExportingReport(true)
    try {
      const response = await fetch('/api/admin/inso/report')
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'تعذر إنشاء التقرير')
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = 'inso-2026-campaign-report.pdf'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      showToast('تم تجهيز تقرير الحملة بصيغة PDF', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر إنشاء التقرير', 'error')
    } finally {
      setExportingReport(false)
    }
  }

  if (loading) return <LoadingSpinner size="lg" />

  return (
    <div className="inso-coverage-page mx-auto min-h-[100dvh] w-full min-w-0 max-w-7xl space-y-6 overflow-x-hidden p-4 md:p-6" dir="rtl">
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-bold text-teal-700">غرفة عمليات التغطية</p>
            <h1 className="text-2xl font-black text-dark md:text-3xl">أولمبياد العلوم النووية الدولي 2026</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted">منشورات وتصاميم وجدولة مباشرة، مرتبة حسب أيام الفعالية في جدة.</p>
          </div>
          <Button size="sm" variant="outline" onClick={exportCampaignReport} loading={exportingReport}>تصدير تقرير الحملة PDF</Button>
        </div>
      </header>

      <section id="timeline" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="font-black text-dark">خطة النشر حسب اليوم</h2><p className="text-xs text-muted">كل تبويب يجمع منشورات اليوم وتوليد النص والتصميم والنشر والجدولة.</p></div>
          <button onClick={() => { setLoading(true); load() }} className="h-9 w-9 rounded-lg border border-border text-dark hover:bg-cream" title="تحديث الخطة" aria-label="تحديث الخطة">↻</button>
        </div>
        <div ref={dayTabsRef} className="flex w-full min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-2" role="tablist" aria-label="أيام خطة النشر">
          {days.map(date => {
            const dayItems = items.filter(item => item.coverage_date === date)
            const phase = PHASES.find(entry => entry.id === dayItems[0]?.phase)
            const active = date === activeDate
            return <button key={date} id={`day-tab-${date}`} data-coverage-date={date} role="tab" aria-selected={active} aria-controls={`day-panel-${date}`} onClick={() => selectDay(date)} className={`min-w-36 shrink-0 rounded-lg border p-3 text-right transition ${active ? 'border-teal-600 bg-teal-700 text-white shadow-sm' : 'border-border bg-card text-dark hover:bg-cream'}`}>
              <span className="block text-xs font-bold opacity-80">{phase?.label}</span>
              <span className="mt-1 block text-sm font-black">{formatInsoDate(date)}</span>
              <span className="mt-1 block text-xs opacity-80">{dayItems.length} محطات</span>
            </button>
          })}
        </div>
      </section>

      <section id={`day-panel-${activeDate}`} role="tabpanel" aria-labelledby={`day-tab-${activeDate}`} className="w-full min-w-0 max-w-full space-y-5 [contain:inline-size]">
        <section className="space-y-3 border-t border-border pt-5" aria-label="المحتوى المحفوظ لليوم">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="font-black text-dark">المحتوى المحفوظ لليوم</h3><p className="text-xs text-muted">تظهر هنا النصوص التي تم حفظها من منشورات هذا التبويب.</p></div>
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">{savedDayItems.length} نصوص محفوظة</span>{activeItems.some(item => !item.post_text?.trim()) && <Button size="sm" variant="outline" onClick={generatePendingPosts} loading={generatingPending}>✨ توليد المنشورات المتبقية</Button>}<Button size="sm" variant="outline" onClick={() => setAddingSaved(current => !current)}>＋ إضافة منشور محفوظ</Button><Button size="sm" variant="outline" onClick={openVideoDialog}>نشر فيديو</Button></div>
          </div>
          {addingSaved && <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50 p-4">
            <input value={savedTitle} onChange={event => setSavedTitle(event.target.value)} placeholder="عنوان المنشور" className="w-full rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm" />
            <textarea value={savedContent} onChange={event => setSavedContent(event.target.value)} placeholder="اكتب النص الجاهز للنشر..." className="min-h-32 w-full resize-y rounded-lg border border-teal-200 bg-white p-3 text-sm leading-6" />
            <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={rewriteSavedPost} loading={busy === 'rewrite-saved:'} disabled={!savedContent.trim()}>إعادة الصياغة</Button><Button size="sm" onClick={addSavedPost} loading={busy?.startsWith('add-saved:')}>حفظ وبدء التصميم</Button><Button size="sm" variant="ghost" onClick={() => setAddingSaved(false)}>إلغاء</Button></div>
          </div>}
          {videoDialogOpen && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 md:items-center md:p-4" role="dialog" aria-modal="true" aria-label="نشر فيديو">
            <div className="max-h-[calc(100svh-0.75rem)] w-screen max-w-none space-y-4 overflow-y-auto rounded-t-lg bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl md:max-h-[calc(100dvh-2rem)] md:w-full md:max-w-xl md:rounded-lg md:p-5">
              <div><h3 className="font-black text-dark">نشر فيديو</h3><p className="mt-1 text-xs leading-5 text-muted">اكتب النص وارفع المقطع، ثم انشره الآن أو حدّد موعدًا للنشر بتوقيت السعودية.</p></div>
              <textarea value={videoText} onChange={event => setVideoText(event.target.value)} placeholder="نص المنشور المصاحب للفيديو..." className="min-h-36 w-full resize-y rounded-lg border border-border bg-white p-3 text-sm leading-6 text-dark" />
              <div className="space-y-2"><p className="text-sm font-bold text-dark">مقطع الفيديو</p><label className="flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-border bg-white px-3 text-sm font-bold text-dark hover:bg-cream"><input type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" onChange={uploadVideo} disabled={videoUploading} className="sr-only" />{videoUploading ? 'جارٍ رفع الفيديو...' : videoName || 'اختيار فيديو (MP4 / MOV / WEBM)'}</label><p className="text-[11px] text-muted">حتى 100 ميجابايت.</p></div>
              {videoUrl && <video src={videoUrl} controls playsInline className="max-h-64 w-full rounded-lg border border-border bg-black" />}
              <div className="space-y-2"><label className="block text-sm font-bold text-dark">موعد الجدولة (اختياري)</label><input type="datetime-local" value={videoScheduleWhen} onChange={event => setVideoScheduleWhen(event.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-dark" /><p className="text-[11px] text-muted">عند الجدولة يحافظ النظام على فارق ساعة على الأقل عن أي منشور آخر.</p></div>
              <div className="flex flex-wrap gap-2"><Button className="flex-1" onClick={() => submitVideo('publish')} loading={videoPublishing === 'publish'} disabled={videoUploading || !!videoPublishing || !videoText.trim() || !videoUrl}>نشر الآن</Button><Button className="flex-1" variant="outline" onClick={() => submitVideo('schedule')} loading={videoPublishing === 'schedule'} disabled={videoUploading || !!videoPublishing || !videoText.trim() || !videoUrl || !videoScheduleWhen}>جدولة الفيديو</Button><Button variant="ghost" onClick={() => setVideoDialogOpen(false)} disabled={!!videoPublishing}>إلغاء</Button></div>
            </div>
          </div>}
          {savedDayItems.length ? <div className="space-y-3">
            {savedDayItems.map(item => {
              const status = STATUS[item.publication_status]
              const hasApprovedDesign = Boolean(item.design_options?.some(option => option.selected))
              const isGeneratingDesign = generatingDesignItemId === item.id
              return <article id={`inso-item-${item.id}`} key={item.id} className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-teal-200 bg-teal-50/30 p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h4 className="font-black text-dark">{item.title}</h4><p className="mt-1 text-xs text-muted">محفوظ ضمن محتوى {activeDate ? formatInsoDate(activeDate) : 'اليوم'}</p>{isGeneratingDesign && <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800"><LoadingSpinner size="sm" /> جارٍ توليد التصاميم تباعًا</div>}</div>{item.publication_status === 'scheduled' ? <button type="button" onClick={() => setCancelScheduleItem(item)} className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold transition hover:ring-2 hover:ring-blue-200 ${status.className}`} title="إلغاء الجدولة">{status.label}</button> : <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${status.className}`}>{status.label}</span>}</div>
                <textarea value={item.post_text ?? ''} onChange={event => replace({ ...item, post_text: event.target.value })} onBlur={() => { if (skipNextTextSave.current === item.id) { skipNextTextSave.current = null; return }; if (item.post_text?.trim()) void callAction('save', { id: item.id, postText: item.post_text }, 'تم حفظ النص ضمن محتوى اليوم') }} className="mt-3 min-h-40 w-full resize-y rounded-lg border border-border bg-white p-3 text-base leading-7 text-dark sm:min-h-32 sm:text-sm sm:leading-6" />
                <div className="mt-3 flex w-full min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto overscroll-x-contain pb-1 touch-pan-x sm:flex-wrap sm:overflow-visible"><Button size="sm" className="shrink-0" variant="outline" onPointerDown={() => skipTextSaveForAction(item.id)} onClick={() => openDesigner(item)} disabled={isGeneratingDesign}>🎨 توليد 3 تصاميم</Button><Button size="sm" className="shrink-0" variant="outline" onPointerDown={() => skipTextSaveForAction(item.id)} onClick={() => rewriteSavedContent(item)} loading={busy === `rewrite-saved:${item.id}`}>إعادة الصياغة</Button>{hasApprovedDesign && <Button size="sm" className="shrink-0" variant="ghost" onPointerDown={() => skipTextSaveForAction(item.id)} onClick={() => openPublishDialog(item)} loading={busy === `publish:${item.id}`}>نشر الآن</Button>}<Button size="sm" className="shrink-0 text-red-600 hover:text-red-700" variant="ghost" onClick={() => setDeleteItem(item)}>حذف المحتوى</Button></div>
                {item.design_options?.length ? <div className="mt-4 flex w-full min-w-0 max-w-full snap-x snap-proximity gap-3 overflow-x-auto overscroll-x-contain pb-2 touch-pan-x lg:grid lg:grid-cols-3 lg:overflow-visible">{item.design_options.map(option => { const isScheduledOption = item.publication_status === 'scheduled' && (Boolean(option.scheduledFor) || option.imageUrl === item.design_url); return <div key={option.id} className={`w-[62vw] max-w-56 shrink-0 snap-start overflow-hidden rounded-lg border lg:w-auto lg:max-w-none ${option.selected ? 'border-teal-500 bg-teal-50/40' : 'border-border bg-white'}`}>
                  <button type="button" onClick={() => setDesignPreview({ title: `${item.title} - ${option.title}`, imageUrl: option.imageUrl })} className="relative block w-full" title="تكبير التصميم" aria-label={`تكبير ${option.title}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={option.imageUrl} alt={`${item.title} - ${option.title}`} className="aspect-[4/5] w-full object-cover" />
                    <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-1 text-[11px] font-bold text-white">تكبير ⤢</span>
                  </button>
                  <div className="space-y-2 p-2"><p className="text-xs font-bold text-dark">{option.title}</p><p className="hidden text-[11px] text-muted lg:block">{option.direction}</p><div className="grid grid-cols-2 gap-1"><Button size="sm" className="w-full px-1" onClick={() => callAction('select-design-option', { id: item.id, optionId: option.id }, option.selected ? 'تم إلغاء اعتماد التصميم' : 'تم اعتماد التصميم')} variant={option.selected ? 'secondary' : 'outline'}>{option.selected ? 'معتمد' : 'اعتماد'}</Button><Button size="sm" className="w-full px-1" variant="ghost" onClick={() => { setEditOption({ item, optionId: option.id }); setEditNote(''); setEditExactText(''); setEditSources([]) }}>تعديل</Button><Button size="sm" className="w-full px-1" variant="outline" title="إرسال عبر واتساب" aria-label="إرسال عبر واتساب" onClick={() => void shareToWhatsApp(item, option.imageUrl)}><span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full bg-[#25D366] text-[10px] font-black text-white">W</span><span className="sr-only">واتساب</span></Button>{isScheduledOption ? <Button size="sm" className="w-full" variant="secondary" title="إلغاء الجدولة" onClick={() => setCancelScheduleItem(item)}>مجدول</Button> : option.selected ? <Button size="sm" className="w-full" variant="outline" title="جدولة التصميم المعتمد" onClick={() => openScheduleDialog(item, option.imageUrl)}>جدولة</Button> : <Button size="sm" className="w-full" variant="ghost" disabled title="اعتمد التصميم لإتاحة الجدولة">جدولة</Button>}</div></div>
                </div> })}</div> : null}
              </article>
            })}
          </div> : <div className="rounded-lg border border-dashed border-border bg-cream p-4 text-sm text-muted">تظهر هنا المنشورات فور توليدها أو عند حفظ تعديل يدوي على النص.</div>}
        </section>
      </section>

      {designItem && <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 md:items-center md:p-4" role="dialog" aria-modal="true" aria-label="توليد خيارات التصميم">
        <div className="max-h-[calc(100svh-0.75rem)] w-screen max-w-none overflow-y-auto rounded-t-lg bg-white shadow-xl md:max-h-[calc(100dvh-2rem)] md:w-full md:max-w-lg md:rounded-lg">
          <div className="space-y-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-5"><div><h3 className="font-black text-dark">3 خيارات تصميم: {designItem.title}</h3><p className="mt-1 text-xs text-muted">أرفق حتى 5 صور مرجعية عند الحاجة أو اختر أن المنشور مقطع فيديو.</p></div>
            <textarea value={designNote} onChange={e => setDesignNote(e.target.value)} placeholder="توجيه إضافي للتصميم (اختياري)" className="min-h-28 w-full resize-y rounded-lg border border-border bg-white p-3 text-sm" />
            <input value={designExactText} onChange={e => setDesignExactText(e.target.value)} placeholder="عبارة تظهر حرفيا بخط صغير (اختياري)" className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            <div className="grid gap-3 sm:grid-cols-2"><div><p className="mb-2 text-sm font-bold text-dark">صور مرجعية ({designSources.length}/5)</p><label className="flex h-11 cursor-pointer items-center justify-center rounded-lg border border-border bg-white px-3 text-sm font-bold text-dark hover:bg-cream"><input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={uploadDesignSources} className="sr-only" />{designUploading ? 'جارٍ رفع الصور...' : 'اختيار صور'}</label></div><label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-bold text-dark"><input type="checkbox" checked={designHasVideo} onChange={e => setDesignHasVideo(e.target.checked)} /> المنشور مقطع فيديو</label></div>
            {designHasVideo && <div className="grid grid-cols-2 gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2" role="group" aria-label="اتجاه مقطع الفيديو"><button type="button" onClick={() => setDesignVideoOrientation('portrait')} className={`rounded-lg border px-3 py-2 text-sm font-bold ${designVideoOrientation === 'portrait' ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-200 bg-white text-dark'}`}>عمودي 9:16</button><button type="button" onClick={() => setDesignVideoOrientation('landscape')} className={`rounded-lg border px-3 py-2 text-sm font-bold ${designVideoOrientation === 'landscape' ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-200 bg-white text-dark'}`}>أفقي 16:9</button></div>}
            {designSources.length > 0 && <div className="flex gap-2 overflow-x-auto pb-1" aria-label="الصور المرجعية المرفقة">{designSources.map((source, index) => <div key={source} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border"><img src={source} alt={`الصورة المرجعية ${index + 1}`} className="h-full w-full object-cover" /><button type="button" onClick={() => setDesignSources(current => current.filter(entry => entry !== source))} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-xs text-white" aria-label={`حذف الصورة المرجعية ${index + 1}`}>×</button></div>)}</div>}
            <p className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs leading-6 text-teal-900">تُدمج الصور بشكل إبداعي في التصميم مع الحفاظ الكامل على ملامح الوجه والهوية والهيئة والملبس كما هي، دون تعديل أو إعادة تشكيل.</p>
          </div>
          <div className="sticky bottom-0 flex gap-2 border-t border-border bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-5"><Button className="flex-1" onClick={generateDesignOptions} loading={designOptionsGenerating} disabled={designOptionsGenerating || designUploading || !designItem.post_text}>توليد الخيارات الثلاثة</Button><Button variant="outline" onClick={() => setDesignItem(null)}>إلغاء</Button></div>
        </div>
      </div>}

      {designPreview && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 md:p-6" role="dialog" aria-modal="true" aria-label="تكبير التصميم">
        <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-3 shadow-xl"><div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-black text-dark">{designPreview.title}</p><button type="button" onClick={() => setDesignPreview(null)} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-lg text-dark hover:bg-cream" aria-label="إغلاق">×</button></div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={designPreview.imageUrl} alt={designPreview.title} className="mx-auto max-h-[78dvh] w-auto max-w-full object-contain" />
        </div>
      </div>}

      {editOption && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center md:p-4" role="dialog" aria-modal="true" aria-label="تعديل خيار التصميم">
        <div className="max-h-[calc(100svh-0.75rem)] w-screen max-w-none space-y-4 overflow-y-auto rounded-t-lg bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl md:max-h-[calc(100dvh-2rem)] md:w-full md:max-w-md md:rounded-lg md:p-5"><div><h3 className="font-black text-dark">تعديل خيار التصميم</h3><p className="mt-1 text-xs text-muted">اكتب التعديل أو أرفق صورا بديلة لتصبح جزءا من التصميم. ستبقى التعديلات السابقة محفوظة.</p></div>
          <textarea value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="اكتب التعديل المطلوب" className="min-h-28 w-full resize-y rounded-lg border border-border bg-white p-3 text-sm" />
          <input value={editExactText} onChange={e => setEditExactText(e.target.value)} placeholder="عبارة تظهر حرفيا بخط صغير (اختياري)" className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm" />
          <div><p className="mb-2 text-sm font-bold text-dark">صور بديلة ({editSources.length}/5)</p><label className="flex h-11 cursor-pointer items-center justify-center rounded-lg border border-border bg-white px-3 text-sm font-bold text-dark hover:bg-cream"><input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={uploadEditSources} className="sr-only" />{editUploading ? 'جارٍ رفع الصور...' : 'إرفاق صور بديلة'}</label></div>
          {editSources.length > 0 && <div className="flex gap-2 overflow-x-auto pb-1" aria-label="الصور البديلة المرفقة">{editSources.map((source, index) => <div key={source} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border"><img src={source} alt={`الصورة البديلة ${index + 1}`} className="h-full w-full object-cover" /><button type="button" onClick={() => setEditSources(current => current.filter(entry => entry !== source))} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-xs text-white" aria-label={`حذف الصورة البديلة ${index + 1}`}>×</button></div>)}</div>}
          <p className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs leading-6 text-teal-900">تُستخدم الصور المرفقة لاستبدال الصورة داخل التصميم أو دمجها، مع الحفاظ الكامل على ملامح الأشخاص وملبسهم وهيئتهم.</p>
          <div className="flex gap-2"><Button className="flex-1" onClick={async () => { const result = await callAction('edit-design-option', { id: editOption.item.id, optionId: editOption.optionId, designNote: editNote, exactText: editExactText, sourceImages: editSources }, 'تم تعديل خيار التصميم'); if (result?.item) setEditOption(null) }} loading={busy === `edit-design-option:${editOption.item.id}`} disabled={editUploading || (!editNote.trim() && !editExactText.trim() && !editSources.length)}>حفظ التعديل</Button><Button variant="outline" onClick={() => setEditOption(null)}>إلغاء</Button></div>
        </div>
      </div>}

      {publishItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="مراجعة المنشور قبل النشر">
        <div className="w-full max-w-2xl space-y-4 rounded-lg bg-white p-5 shadow-xl"><div><h3 className="font-black text-dark">مراجعة قبل النشر</h3><p className="mt-1 text-xs text-muted">عدّل التغريدة إن لزم، ثم أكّد النشر باستخدام التصميم المعتمد.</p></div>
          <textarea value={publishText} onChange={event => setPublishText(event.target.value)} className="min-h-48 w-full resize-y rounded-lg border border-border bg-white p-3 text-sm leading-6 text-dark" />
          {publishItem.design_url && <div className="overflow-hidden rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={publishItem.design_url} alt={`التصميم المعتمد لمنشور ${publishItem.title}`} className="max-h-64 w-full object-contain bg-cream" />
          </div>}
          <div className="flex gap-2"><Button className="flex-1" onClick={publishNow} loading={busy === `publish:${publishItem.id}`} disabled={!publishText.trim()}>تأكيد النشر</Button><Button variant="outline" onClick={() => setPublishItem(null)}>إلغاء</Button></div>
        </div>
      </div>}

      {deleteItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="تأكيد حذف المحتوى">
        <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl"><div><h3 className="font-black text-dark">حذف المحتوى المحفوظ</h3><p className="mt-1 text-sm text-muted">سيُحذف نص «{deleteItem.title}» وتصاميمه المحفوظة. لا يمكن التراجع عن ذلك.</p></div>
          <div className="flex gap-2"><Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={deleteSavedContent} loading={busy === `delete-saved:${deleteItem.id}`}>تأكيد الحذف</Button><Button variant="outline" onClick={() => setDeleteItem(null)}>إلغاء</Button></div>
        </div>
      </div>}

      {cancelScheduleItem && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 md:items-center md:p-4" role="dialog" aria-modal="true" aria-label="تأكيد إلغاء الجدولة">
        <div className="w-full max-w-md space-y-4 rounded-t-lg bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl md:rounded-lg"><div><h3 className="font-black text-dark">إلغاء الجدولة؟</h3><p className="mt-1 text-sm leading-6 text-muted">هل ترغب في إلغاء جدولة «{cancelScheduleItem.title}»؟ لن يُنشر المحتوى في الموعد المحدد، وسيبقى النص والتصميم محفوظين في الغرفة.</p></div>
          <div className="flex gap-2"><Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={cancelSchedule} loading={busy === `cancel-scheduled:${cancelScheduleItem.id}`}>نعم، إلغاء الجدولة</Button><Button className="flex-1" variant="outline" onClick={() => setCancelScheduleItem(null)}>الاحتفاظ بالجدولة</Button></div>
        </div>
      </div>}

      {scheduleItem && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center md:p-4" role="dialog" aria-modal="true" aria-label="مراجعة وجدولة المنشور">
        <div className="max-h-[calc(100svh-0.75rem)] w-screen max-w-none space-y-4 overflow-y-auto rounded-t-lg bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl md:max-h-[calc(100dvh-2rem)] md:w-full md:max-w-lg md:rounded-lg md:p-5"><div><h3 className="font-black text-dark">مراجعة وجدولة «{scheduleItem.title}»</h3><p className="mt-1 text-xs text-muted">راجع النص والتصميم المعتمد ثم اختر الموعد بتوقيت السعودية.</p></div>
          {scheduleImageUrl && <div className="overflow-hidden rounded-lg border border-border bg-cream"><img src={scheduleImageUrl} alt={`التصميم المعتمد لمنشور ${scheduleItem.title}`} className="max-h-52 w-full object-contain" /></div>}
          <textarea value={scheduleText} onChange={event => setScheduleText(event.target.value)} className="min-h-36 w-full resize-y rounded-lg border border-border bg-white p-3 text-sm leading-6 text-dark" aria-label="نص المنشور قبل الجدولة" />
          <div className="space-y-2"><label className="block text-xs font-bold text-dark">اليوم</label><input type="date" value={scheduleDate} onChange={e => { setScheduleDate(e.target.value); setScheduleWhen('') }} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" /></div>
          <div className="space-y-2"><div className="flex items-center justify-between gap-2"><label className="block text-xs font-bold text-dark">الأوقات المتاحة</label><span className="text-[11px] text-muted">فاصل ساعة على الأقل</span></div>{scheduleAvailabilityLoading ? <div className="flex items-center gap-2 rounded-lg bg-cream p-3 text-sm text-muted"><LoadingSpinner size="sm" /> جارٍ فحص التقويم...</div> : availableManualTimes.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{availableManualTimes.map(slot => <button key={slot.local} type="button" onClick={() => setScheduleWhen(slot.local)} className={`rounded-lg border px-2 py-2 text-sm font-bold transition ${scheduleWhen === slot.local ? 'border-teal-600 bg-teal-600 text-white' : 'border-border bg-white text-dark hover:border-teal-400'}`}>{String(slot.hour).padStart(2, '0')}:00</button>)}</div> : <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">لا توجد أوقات متاحة لهذا اليوم بفاصل ساعة كاملة. اختر يوماً آخر.</p>}</div>
          <div className="flex gap-2"><Button className="flex-1" onClick={schedule} loading={busy === `schedule:${scheduleItem.id}`} disabled={!scheduleText.trim() || !scheduleWhen}>تأكيد الجدولة</Button><Button className="flex-1" variant="outline" onClick={() => { setScheduleItem(null); setScheduleText(''); setScheduleImageUrl('') }}>إلغاء</Button></div>
        </div>
      </div>}
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useToast } from '@/components/ui/Toast'
import type { MemberMagazineItem } from '@/lib/member-magazine'

type Magazine = {
  displayName: string
  bio: string
  shareToken: string
  isPublic: boolean
  planName: string
  planId: string
}

export default function MemberMagazine() {
  const router = useRouter()
  const { showToast } = useToast()
  const [magazine, setMagazine] = useState<Magazine | null>(null)
  const [items, setItems] = useState<MemberMagazineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [selected, setSelected] = useState<MemberMagazineItem | null>(null)

  const load = async () => {
    const response = await fetch('/api/memberships/magazine', { cache: 'no-store' })
    if (response.status === 401) { router.replace('/auth/login?next=/dashboard/membership/magazine'); return }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { showToast(data.error ?? 'تعذّر تحميل المجلة', 'error'); setLoading(false); return }
    setMagazine(data.magazine)
    setItems(data.items ?? [])
    setDisplayName(data.magazine.displayName)
    setBio(data.magazine.bio ?? '')
    setIsPublic(data.magazine.isPublic)
    setLoading(false)
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const shareUrl = useMemo(() => magazine && typeof window !== 'undefined'
    ? `${window.location.origin}/m/${magazine.shareToken}`
    : '', [magazine])

  const persistSettings = async (publicValue: boolean) => {
    setSaving(true)
    const response = await fetch('/api/memberships/magazine', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, bio, isPublic: publicValue }),
    })
    const data = await response.json().catch(() => ({}))
    setSaving(false)
    if (!response.ok) { showToast(data.error ?? 'تعذّر الحفظ', 'error'); return false }
    setIsPublic(publicValue)
    setMagazine(current => current ? { ...current, displayName, bio, isPublic: publicValue } : current)
    return true
  }

  const save = async () => {
    if (!await persistSettings(isPublic)) return
    showToast('تم حفظ إعدادات المجلة')
  }

  const togglePublic = async () => {
    const nextValue = !isPublic
    if (!await persistSettings(nextValue)) return
    showToast(nextValue ? 'تم تفعيل رابط المجلة العام' : 'تم إيقاف رابط المجلة العام')
  }

  const copyLink = async () => {
    if (!shareUrl || !isPublic) return
    await navigator.clipboard.writeText(shareUrl)
    showToast('تم نسخ رابط المجلة')
  }

  const share = async () => {
    if (!shareUrl || !isPublic) return
    try {
      if (navigator.share) await navigator.share({ title: `مجلة ${displayName}`, text: bio, url: shareUrl })
      else await copyLink()
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) showToast('تعذّرت مشاركة الرابط', 'error')
    }
  }

  const renewLink = async () => {
    if (!confirm('سيصبح الرابط السابق غير صالح فوراً. هل تريد إنشاء رابط جديد؟')) return
    const response = await fetch('/api/memberships/magazine', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'renew-link' }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { showToast(data.error ?? 'تعذّر إنشاء الرابط', 'error'); return }
    setMagazine(current => current ? { ...current, shareToken: data.shareToken, isPublic: true } : current)
    setIsPublic(true)
    showToast('تم إنشاء رابط مشاركة جديد')
  }

  if (loading) return <LoadingSpinner size="lg" />
  if (!magazine) return <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-8 text-center text-muted">تعذّر تجهيز مجلة العضوية.</div>

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5" dir="rtl">
      <section className="overflow-hidden rounded-lg border border-white/15 bg-dark text-white shadow-xl">
        <div className="grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-end">
          <div><p className="text-xs font-bold text-gold">{magazine.planName}</p><h1 className="mt-1 text-3xl font-black">مجلتي</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">مساحتك الخاصة لعرض التصاميم التي اعتمدتها. لا تظهر هنا الخيارات غير المختارة أو جولات التصميم السابقة.</p></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" onClick={share} disabled={!isPublic}>مشاركة المجلة</Button><Button size="sm" variant="outline" onClick={copyLink} disabled={!isPublic} className="!border-white/25 !text-white">نسخ الرابط</Button></div>
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-border bg-card p-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <label className="block text-sm font-bold text-dark">اسم المجلة<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={120} className="mt-2 min-h-12 w-full rounded-lg border border-border bg-white px-4 text-sm outline-none focus:border-green" /></label>
          <label className="block text-sm font-bold text-dark">نبذة الملف التعريفي<textarea value={bio} onChange={event => setBio(event.target.value)} maxLength={500} rows={3} className="mt-2 w-full resize-y rounded-lg border border-border bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-green" placeholder="نبذة قصيرة تظهر لزوار المجلة" /></label>
          <Button onClick={save} loading={saving}>حفظ التعديلات</Button>
        </div>
        <aside className="rounded-lg border border-border bg-white p-4">
          <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-black text-dark">الرابط العام</p><p className="mt-1 text-xs leading-5 text-muted">يعمل دون تسجيل دخول ويمكن إيقافه في أي وقت.</p></div><button type="button" onClick={() => void togglePublic()} disabled={saving} className={`relative h-7 w-12 rounded-full transition disabled:opacity-50 ${isPublic ? 'bg-green' : 'bg-slate-300'}`} aria-label="تفعيل الرابط العام" aria-pressed={isPublic}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${isPublic ? 'right-1' : 'right-6'}`} /></button></div>
          <p className={`mt-4 break-all rounded-md p-3 text-[11px] ${isPublic ? 'bg-green/5 text-green' : 'bg-slate-100 text-muted'}`} dir="ltr">{isPublic ? shareUrl : 'الرابط العام متوقف'}</p>
          <button type="button" onClick={renewLink} className="mt-3 text-xs font-bold text-red-600 hover:underline">إنشاء رابط جديد وإلغاء السابق</button>
        </aside>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="text-xl font-black text-dark">التصاميم المعتمدة</h2><p className="text-sm text-muted">تضاف تلقائياً بمجرد اعتمادك للتصميم داخل الطلب.</p></div><span className="rounded-full bg-green/10 px-3 py-1 text-xs font-bold text-green">{items.length} تصميم</span></div>
        {items.length === 0 ? <div className="rounded-lg border border-dashed border-border bg-white/55 px-5 py-14 text-center"><p className="font-black text-dark">المجلة جاهزة لاستقبال أول تصميم</p><p className="mt-2 text-sm text-muted">بعد اعتماد تصميم في أحد طلبات العضوية سيظهر هنا تلقائياً.</p></div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{items.map(item => <button key={item.id} onClick={() => setSelected(item)} className="group overflow-hidden rounded-lg border border-border bg-white text-right shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="aspect-[4/5] overflow-hidden bg-slate-100"><img src={item.cover} alt={item.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" /></div><div className="p-3"><p className="line-clamp-2 text-sm font-black text-dark">{item.title}</p><p className="mt-1 text-[11px] text-muted">{item.category}</p></div></button>)}</div>}
      </section>

      {selected && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4" onClick={() => setSelected(null)}><div className="max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-lg bg-[#181818] text-white" onClick={event => event.stopPropagation()}><div className="grid md:grid-cols-[minmax(0,1fr)_340px]"><img src={selected.cover} alt={selected.title} className="max-h-[85dvh] h-full w-full bg-black object-contain" /><div className="p-5"><button onClick={() => setSelected(null)} className="mb-6 grid h-9 w-9 place-items-center rounded-full bg-white/10" aria-label="إغلاق">×</button><span className="rounded-full bg-green px-2.5 py-1 text-[11px] font-bold">{selected.category}</span><h3 className="mt-4 text-2xl font-black">{selected.title}</h3>{selected.content && <p className="mt-4 whitespace-pre-line text-sm leading-7 text-white/70">{selected.content}</p>}</div></div></div></div>}
    </div>
  )
}

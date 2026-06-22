'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

// ─── الأنواع (مطابقة لمخرجات /api/showcase) ───
interface ShowcaseItem {
  id: string
  source: 'daily' | 'client'
  name: string
  title: string
  category: string
  tags: string[]
  bio: string
  story: string
  cover: string
  gallery: string[]
  tweets: string | null
  createdAt: string
}
interface CategoryMeta { name: string; count: number; cover: string }
interface ShowcaseData { items: ShowcaseItem[]; categories: CategoryMeta[]; featured: ShowcaseItem | null; total: number }

// ─── ثوابت الثيم السينمائي (Netflix vibe + هوية سعودية) ───
const BG = '#141414'
const GOLD = '#D4AF37'
const GREEN = '#006C35'

const slug = (s: string) => 'cat-' + s.replace(/\s+/g, '-')

export default function ShowcasePage() {
  const [data, setData] = useState<ShowcaseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [selected, setSelected] = useState<ShowcaseItem | null>(null)
  const rowRefs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    fetch('/api/showcase')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: ShowcaseData) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  // عناصر كل قسم (مشتقّة ديناميكياً)
  const grouped = useMemo(() => {
    const map = new Map<string, ShowcaseItem[]>()
    for (const it of data?.items ?? []) {
      if (!map.has(it.category)) map.set(it.category, [])
      map.get(it.category)!.push(it)
    }
    return map
  }, [data])

  const pickCategory = (name: string) => {
    setShowSplash(false)
    // بعد إخفاء السبلاش، انتقل لصف القسم المختار
    setTimeout(() => {
      const el = rowRefs.current[slug(name)]
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  // قفل تمرير الصفحة عند فتح المودال
  useEffect(() => {
    document.body.style.overflow = selected ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [selected])

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-[var(--g)] animate-spin" style={{ ['--g' as string]: GOLD }} />
          <p className="text-white/70">جارٍ تحميل المجلة…</p>
        </div>
      </div>
    )
  }

  if (error || !data || data.total === 0) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center px-6 text-center" style={{ background: BG }}>
        <div className="text-white/70">
          <p className="text-2xl font-black text-white mb-2">مجلة المبدعين والأوائل</p>
          <p>لا يوجد محتوى منشور بعد. ستظهر هنا التصاميم المعتمدة والأخبار المولّدة تلقائياً.</p>
        </div>
      </div>
    )
  }

  const featured = data.featured

  return (
    <div dir="rtl" className="min-h-screen text-white" style={{ background: BG }}>
      {/* إخفاء أشرطة التمرير الأفقية للصفوف */}
      <style>{`.nf-row::-webkit-scrollbar{display:none}.nf-row{-ms-overflow-style:none;scrollbar-width:none}`}</style>

      {/* ── شاشة «اختر مجال إلهامك» ── */}
      {showSplash && (
        <SplashScreen categories={data.categories} onPick={pickCategory} onSkip={() => setShowSplash(false)} />
      )}

      {/* ── شريط العنوان ── */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#141414]/80 border-b border-white/5">
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black tracking-tight" style={{ color: GOLD }}>★ المبدعون والأوائل</span>
            <span className="hidden sm:inline text-white/50 text-sm">| مجلة الإنجازات السعودية</span>
          </div>
          <button onClick={() => setShowSplash(true)} className="text-sm text-white/70 hover:text-white transition-colors">
            اختر مجال إلهامك
          </button>
        </div>
      </header>

      {/* ── البانر الرئيسي (Hero) ── */}
      {featured && <Hero item={featured} onOpen={() => setSelected(featured)} />}

      {/* ── الصفوف الديناميكية حسب الفئة ── */}
      <main className="max-w-[1400px] mx-auto px-4 md:px-8 pb-20 -mt-10 md:-mt-20 relative z-10 space-y-9">
        {[...grouped.entries()].map(([category, list]) => (
          <section key={category} ref={el => { rowRefs.current[slug(category)] = el }} className="scroll-mt-20">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg md:text-2xl font-black">{category}</h2>
              <span className="text-xs text-white/40">{list.length} عمل</span>
            </div>
            <div className="nf-row flex gap-3 md:gap-4 overflow-x-auto pb-2 snap-x">
              {list.map(item => (
                <Card key={item.id} item={item} onOpen={() => setSelected(item)} />
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* ── المودال الغامر (المجلة) ── */}
      {selected && <MagazineModal item={selected} onClose={() => setSelected(null)} />}

      <footer className="text-center text-white/30 text-xs pb-8">
        مجلة المبدعين والأوائل — يُولَّد المحتوى تلقائياً من استوديو الذكاء الاصطناعي وخطة النشر اليومية.
      </footer>
    </div>
  )
}

// ─── شاشة اختيار المجال ───
function SplashScreen({ categories, onPick, onSkip }: { categories: CategoryMeta[]; onPick: (n: string) => void; onSkip: () => void }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'rgba(10,10,10,0.97)' }}>
      <div className="min-h-full flex flex-col items-center justify-center px-5 py-12">
        <p className="text-sm mb-2" style={{ color: GOLD }}>WHO&apos;S INSPIRED?</p>
        <h1 className="text-3xl md:text-5xl font-black text-white mb-2 text-center">اختر مجال إلهامك</h1>
        <p className="text-white/60 mb-8 text-center">استكشف أبرز المبدعين والأوائل في كل مجال</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 max-w-5xl w-full">
          {categories.map(cat => (
            <button
              key={cat.name}
              onClick={() => onPick(cat.name)}
              className="group relative aspect-video rounded-xl overflow-hidden border border-white/10 hover:border-[var(--g)] transition-all hover:scale-[1.03]"
              style={{ ['--g' as string]: GOLD }}
            >
              {cat.cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cat.cover} alt={cat.name} className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-70 transition-opacity" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3 text-right">
                <div className="font-bold text-white text-sm md:text-base leading-tight">{cat.name}</div>
                <div className="text-[11px] text-white/60">{cat.count} عمل</div>
              </div>
            </button>
          ))}
        </div>
        <button onClick={onSkip} className="mt-9 px-7 py-2.5 rounded-full font-bold text-black transition-transform hover:scale-105" style={{ background: GOLD }}>
          تصفّح كل المجالات ←
        </button>
      </div>
    </div>
  )
}

// ─── البانر الرئيسي ───
function Hero({ item, onOpen }: { item: ShowcaseItem; onOpen: () => void }) {
  return (
    <section className="relative h-[72vh] min-h-[460px] w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.cover} alt={item.name} className="absolute inset-0 w-full h-full object-cover object-top" />
      <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${BG} 8%, rgba(20,20,20,0.5) 45%, rgba(20,20,20,0.2) 100%)` }} />
      <div className="absolute inset-0" style={{ background: `linear-gradient(to left, transparent 40%, ${BG}cc 100%)` }} />
      <div className="relative z-10 max-w-[1400px] mx-auto h-full px-4 md:px-8 flex flex-col justify-end pb-24 md:pb-28">
        <span className="inline-flex w-fit items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-4" style={{ background: GREEN, color: '#fff' }}>
          {item.source === 'daily' ? '★ قصة اليوم' : '★ إبداع معتمد'} · {item.category}
        </span>
        <h1 className="text-3xl md:text-6xl font-black max-w-3xl leading-tight drop-shadow-lg">{item.name}</h1>
        {item.bio && <p className="mt-4 text-white/80 max-w-xl text-sm md:text-base line-clamp-3">{item.bio}</p>}
        <div className="flex gap-3 mt-6">
          <button onClick={onOpen} className="px-6 md:px-8 py-3 rounded-lg font-black text-black flex items-center gap-2 transition-transform hover:scale-105" style={{ background: GOLD }}>
            ▶ تصفّح الأعمال
          </button>
          <button onClick={onOpen} className="px-6 md:px-8 py-3 rounded-lg font-bold bg-white/15 hover:bg-white/25 backdrop-blur-sm transition-colors flex items-center gap-2">
            ⓘ اقرأ القصة
          </button>
        </div>
      </div>
    </section>
  )
}

// ─── بطاقة المحتوى ───
function Card({ item, onOpen }: { item: ShowcaseItem; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="nf-card group relative shrink-0 snap-start w-[150px] md:w-[200px] rounded-lg overflow-hidden bg-white/5 transition-transform duration-200 hover:scale-105 hover:z-20"
    >
      <div className="aspect-[4/5] w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.cover} alt={item.name} loading="lazy" className="w-full h-full object-cover" />
      </div>
      {/* تراكب البيانات عند المرور */}
      <div className="absolute inset-0 flex flex-col justify-end p-3 text-right opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0.1) 70%)' }}>
        <div className="font-bold text-sm leading-tight line-clamp-2">{item.name}</div>
        <div className="mt-1.5 flex flex-wrap gap-1 justify-end">
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: GREEN }}>{item.category}</span>
          {item.tags.slice(1, 3).map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-white/15">{t}</span>
          ))}
        </div>
      </div>
    </button>
  )
}

// ─── المودال الغامر (المجلة) ───
function MagazineModal({ item, onClose }: { item: ShowcaseItem; onClose: () => void }) {
  const [zoom, setZoom] = useState<string | null>(null)
  const storyParas = item.story.split(/\n+/).map(s => s.trim()).filter(Boolean)
  const tweetBlocks = (item.tweets ?? '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean)

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-0 md:p-6" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <div
        className="relative w-full max-w-4xl rounded-none md:rounded-2xl overflow-hidden my-0 md:my-6 shadow-2xl"
        style={{ background: '#181818' }}
        onClick={e => e.stopPropagation()}
      >
        {/* رأس بصري */}
        <div className="relative h-[42vh] min-h-[260px] w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.cover} alt={item.name} className="absolute inset-0 w-full h-full object-cover object-top" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #181818 6%, rgba(24,24,24,0.3) 60%, transparent 100%)' }} />
          <button onClick={onClose} aria-label="إغلاق" className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 flex items-center justify-center text-xl transition-colors">✕</button>
          <div className="absolute inset-x-0 bottom-0 p-5 md:p-7">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-3" style={{ background: GREEN }}>{item.category}</span>
            <h2 className="text-2xl md:text-4xl font-black drop-shadow">{item.name}</h2>
          </div>
        </div>

        <div className="p-5 md:p-7 space-y-7">
          {/* القصة */}
          {storyParas.length > 0 && (
            <div>
              <h3 className="text-sm font-bold mb-2" style={{ color: GOLD }}>القصة</h3>
              <div className="space-y-2 text-white/85 leading-loose text-[15px]">
                {storyParas.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </div>
          )}

          {/* معرض الأعمال */}
          {item.gallery.length > 0 && (
            <div>
              <h3 className="text-sm font-bold mb-3" style={{ color: GOLD }}>معرض الأعمال ({item.gallery.length})</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {item.gallery.map((img, i) => (
                  <button key={i} onClick={() => setZoom(img)} className="aspect-[4/5] rounded-lg overflow-hidden border border-white/10 hover:border-[var(--g)] transition-colors" style={{ ['--g' as string]: GOLD }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt={`عمل ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* التغريدات المرافقة */}
          {tweetBlocks.length > 0 && (
            <div>
              <h3 className="text-sm font-bold mb-3" style={{ color: GOLD }}>الصياغة الإعلامية</h3>
              <div className="space-y-3">
                {tweetBlocks.map((t, i) => (
                  <p key={i} className="bg-white/5 rounded-xl p-4 text-white/85 leading-loose whitespace-pre-line text-[14px]">{t}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* تكبير صورة من المعرض */}
      {zoom && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.92)' }} onClick={e => { e.stopPropagation(); setZoom(null) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="معاينة" className="max-w-full max-h-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  )
}

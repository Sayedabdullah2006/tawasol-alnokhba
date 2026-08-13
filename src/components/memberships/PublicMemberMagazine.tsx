'use client'

import { useEffect, useMemo, useState } from 'react'
import type { MemberMagazineItem } from '@/lib/member-magazine'

const BG = '#141414'
const GOLD = '#C9A961'
const NAVY = '#14366E'

export default function PublicMemberMagazine({
  displayName,
  bio,
  planName,
  items,
}: {
  displayName: string
  bio: string
  planName: string
  items: MemberMagazineItem[]
}) {
  const [selected, setSelected] = useState<MemberMagazineItem | null>(null)
  const [zoom, setZoom] = useState(false)
  const grouped = useMemo(() => {
    const map = new Map<string, MemberMagazineItem[]>()
    for (const item of items) map.set(item.category, [...(map.get(item.category) ?? []), item])
    return [...map.entries()]
  }, [items])

  useEffect(() => {
    document.body.style.overflow = selected ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [selected])

  const featured = items[0]
  return (
    <div dir="rtl" className="min-h-screen text-white" style={{ background: BG }}>
      <style>{`.member-mag-row::-webkit-scrollbar{display:none}.member-mag-row{-ms-overflow-style:none;scrollbar-width:none}`}</style>
      <header className="sticky top-[84px] z-30 border-b border-white/5 bg-[#141414]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 md:px-8">
          <div className="min-w-0"><p className="truncate text-lg font-black" style={{ color: GOLD }}>{displayName}</p><p className="text-[11px] text-white/45">مجلة التصاميم المعتمدة</p></div>
          <span className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/60">{planName}</span>
        </div>
      </header>

      {featured ? (
        <section className="relative h-[68vh] min-h-[470px] w-full">
          <img src={featured.cover} alt={featured.title} className="absolute inset-0 h-full w-full object-cover object-top" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${BG} 5%, rgba(20,20,20,.45) 58%, rgba(20,20,20,.18))` }} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to left, transparent 38%, ${BG}dd 100%)` }} />
          <div className="relative z-10 mx-auto flex h-full max-w-[1400px] flex-col justify-end px-4 pb-24 md:px-8 md:pb-28">
            <span className="mb-3 w-fit rounded-full px-3 py-1 text-xs font-bold" style={{ background: NAVY }}>ملف {displayName}</span>
            <h1 className="max-w-3xl text-3xl font-black leading-tight drop-shadow-lg md:text-6xl">{featured.title}</h1>
            {bio && <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75 md:text-base">{bio}</p>}
            <button onClick={() => setSelected(featured)} className="mt-6 w-fit rounded-lg px-7 py-3 font-black text-[#141414] transition hover:scale-[1.02]" style={{ background: GOLD }}>تصفّح التصميم</button>
          </div>
        </section>
      ) : (
        <section className="mx-auto flex min-h-[65vh] max-w-2xl flex-col items-center justify-center px-5 text-center"><div className="text-5xl">▣</div><h1 className="mt-5 text-3xl font-black">مجلة {displayName}</h1><p className="mt-3 text-sm leading-7 text-white/55">لم تُضف تصاميم معتمدة إلى المجلة بعد.</p></section>
      )}

      {items.length > 0 && <main className="relative z-10 mx-auto -mt-12 max-w-[1400px] space-y-9 px-4 pb-20 md:-mt-20 md:px-8">{grouped.map(([category, list]) => (
        <section key={category}>
          <div className="mb-3 flex items-baseline justify-between"><h2 className="text-lg font-black md:text-2xl">{category}</h2><span className="text-xs text-white/40">{list.length} تصميم</span></div>
          <div className="member-mag-row flex snap-x gap-3 overflow-x-auto pb-3 md:gap-4">{list.map(item => (
            <button key={item.id} onClick={() => setSelected(item)} className="group relative w-[155px] shrink-0 snap-start overflow-hidden rounded-lg bg-white/5 text-right transition hover:z-20 hover:scale-[1.04] md:w-[210px]">
              <div className="aspect-[4/5] overflow-hidden"><img src={item.cover} alt={item.title} loading="lazy" className="h-full w-full object-cover" /></div>
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/5 to-transparent p-3 opacity-0 transition group-hover:opacity-100"><p className="line-clamp-2 text-sm font-bold">{item.title}</p><span className="mt-2 w-fit rounded px-2 py-1 text-[10px]" style={{ background: NAVY }}>{item.category}</span></div>
            </button>
          ))}</div>
        </section>
      ))}</main>}

      <footer className="border-t border-white/5 px-4 py-8 text-center text-xs text-white/30">مجلة شخصية مقدمة ضمن عضويات تواصل النخبة</footer>

      {selected && <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/90 p-0 md:p-6" onClick={() => { setSelected(null); setZoom(false) }}><div className="my-0 w-full max-w-5xl overflow-hidden bg-[#181818] shadow-2xl md:my-5 md:rounded-lg" onClick={event => event.stopPropagation()}><div className="grid md:grid-cols-[minmax(0,1fr)_360px]"><button onClick={() => setZoom(true)} className="relative min-h-[50vh] bg-black"><img src={selected.cover} alt={selected.title} className="h-full max-h-[88dvh] w-full object-contain" /><span className="absolute bottom-3 left-3 rounded-full bg-black/65 px-3 py-1 text-[11px]">تكبير</span></button><div className="p-5 md:p-7"><button onClick={() => setSelected(null)} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-lg" aria-label="إغلاق">×</button><span className="mt-7 inline-block rounded-full px-3 py-1 text-xs font-bold" style={{ background: NAVY }}>{selected.category}</span><h2 className="mt-4 text-2xl font-black md:text-3xl">{selected.title}</h2>{selected.content && <p className="mt-5 whitespace-pre-line text-sm leading-8 text-white/70">{selected.content}</p>}</div></div></div></div>}
      {zoom && selected && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/95 p-3" onClick={() => setZoom(false)}><img src={selected.cover} alt={selected.title} className="max-h-full max-w-full object-contain" /></div>}
    </div>
  )
}

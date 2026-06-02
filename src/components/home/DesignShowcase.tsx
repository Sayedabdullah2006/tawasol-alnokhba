'use client'

import { useEffect, useRef, useState } from 'react'

// معرض التصاميم المعتمدة — شريط أفقي يتحرّك تلقائياً بشكل مستمر (loop لا نهائي)
// ويمكن للعميل تمريره يدوياً (سحب/لمس أو أزرار للأمام والخلف).
// يجلب الصور من مسار عام يعيد روابط صور التصاميم المعتمدة فقط، ويحدّثها دورياً.
export default function DesignShowcase() {
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const scrollerRef = useRef<HTMLDivElement>(null)

  // جلب الصور + تحديث تلقائي دوري (يظهر أي تصميم جديد يعتمده العملاء)
  useEffect(() => {
    let active = true
    const load = () => {
      fetch('/api/showcase-designs', { cache: 'no-store' })
        .then(r => r.json())
        .then(d => { if (active && Array.isArray(d.images)) setImages(d.images) })
        .catch(() => {/* تجاهل أخطاء الشبكة */})
        .finally(() => { if (active) setLoading(false) })
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  // الحركة التلقائية المستمرة + إعادة الكرّة (loop) عند بلوغ منتصف المحتوى المضاعف
  useEffect(() => {
    if (images.length === 0) return
    const el = scrollerRef.current
    if (!el) return

    let raf = 0
    let paused = false
    const SPEED = 0.5 // بكسل لكل إطار

    const tick = () => {
      if (!paused && el) {
        el.scrollLeft += SPEED
        // المحتوى مضاعف (مجموعتان) — عند تجاوز النصف نرجع للبداية بسلاسة غير مرئية
        const half = el.scrollWidth / 2
        if (el.scrollLeft >= half) el.scrollLeft -= half
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    // إيقاف مؤقت عند تفاعل المستخدم (لمس/فأرة) ثم استئناف
    const pause = () => { paused = true }
    const resume = () => { paused = false }
    el.addEventListener('pointerdown', pause)
    el.addEventListener('pointerup', resume)
    el.addEventListener('pointerleave', resume)
    el.addEventListener('touchstart', pause, { passive: true })
    el.addEventListener('touchend', resume)

    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('pointerdown', pause)
      el.removeEventListener('pointerup', resume)
      el.removeEventListener('pointerleave', resume)
      el.removeEventListener('touchstart', pause)
      el.removeEventListener('touchend', resume)
    }
  }, [images])

  // تمرير يدوي بالأزرار (للأمام/الخلف)
  const nudge = (dir: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * 240, behavior: 'smooth' })
  }

  // أثناء التحميل أو عند عدم وجود تصاميم: نعرض شعار المنصة (سلوك احتياطي آمن)
  if (loading || images.length === 0) {
    return (
      <div className="flex justify-center">
        <div className="relative">
          <div className="absolute inset-0 bg-gold/20 rounded-full blur-3xl scale-90" />
          <div className="relative bg-cream/95 rounded-3xl p-8 shadow-2xl flex items-center justify-center w-64 h-64 md:w-80 md:h-80">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="تواصل النخبة" className="w-full h-auto object-contain" />
          </div>
        </div>
      </div>
    )
  }

  // نضاعف القائمة لتأمين loop مستمر بلا فراغ
  const loop = [...images, ...images]

  return (
    <div className="w-full">
      <div className="relative">
        {/* تدرّج إخفاء على الحافتين */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 sm:w-14 z-10 bg-gradient-to-l from-[#0A1F45] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 sm:w-14 z-10 bg-gradient-to-r from-[#1B3D85] to-transparent" />

        {/* زر السابق */}
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label="السابق"
          className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 items-center justify-center rounded-full bg-cream/90 text-dark shadow-lg hover:bg-cream transition-colors"
        >
          ‹
        </button>
        {/* زر التالي */}
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label="التالي"
          className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 items-center justify-center rounded-full bg-cream/90 text-dark shadow-lg hover:bg-cream transition-colors"
        >
          ›
        </button>

        {/* الشريط القابل للتمرير يدوياً + الحركة التلقائية */}
        <div
          ref={scrollerRef}
          dir="ltr"
          className="design-scroller flex overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {loop.map((src, i) => (
            <div
              key={i}
              className="shrink-0 mr-4 w-40 sm:w-48 md:w-56 aspect-[4/5] rounded-2xl overflow-hidden bg-cream/10 border border-cream/15 shadow-xl select-none"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt="تصميم معتمد"
                loading="lazy"
                draggable={false}
                className="w-full h-full object-cover pointer-events-none"
              />
            </div>
          ))}
        </div>
      </div>
      <p className="text-center text-cream/60 text-xs mt-4">نماذج من تصاميم اعتمدها عملاؤنا — اسحب لمشاهدة المزيد</p>
    </div>
  )
}

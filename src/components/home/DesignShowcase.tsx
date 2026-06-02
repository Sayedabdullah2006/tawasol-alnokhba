'use client'

import { useEffect, useState } from 'react'

// معرض التصاميم المعتمدة — شريط أفقي متحرّك مستمر (marquee) داخل الهيرو.
// يجلب الصور من مسار عام يعيد روابط صور التصاميم المعتمدة فقط.
export default function DesignShowcase() {
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetch('/api/showcase-designs')
      .then(r => r.json())
      .then(d => {
        if (active && Array.isArray(d.images)) setImages(d.images)
      })
      .catch(() => {/* تجاهل أخطاء الشبكة */})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

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

  // نضاعف القائمة لحركة لا نهائية سلسة
  const loop = [...images, ...images]

  return (
    <div className="w-full">
      <div className="design-marquee relative overflow-hidden">
        {/* تدرّج إخفاء على الحافتين لإحساس أنيق */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 z-10 bg-gradient-to-l from-[#0A1F45] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-12 z-10 bg-gradient-to-r from-[#1B3D85] to-transparent" />

        <div className="design-marquee-track flex gap-4 w-max">
          {loop.map((src, i) => (
            <div
              key={i}
              className="shrink-0 w-40 sm:w-48 md:w-56 aspect-[4/5] rounded-2xl overflow-hidden bg-cream/10 border border-cream/15 shadow-xl"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt="تصميم معتمد"
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      </div>
      <p className="text-center text-cream/60 text-xs mt-4">نماذج من تصاميم اعتمدها عملاؤنا</p>
    </div>
  )
}

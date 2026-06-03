'use client'

import { useEffect } from 'react'

interface Props {
  src: string | null
  onClose: () => void
  alt?: string
}

/**
 * عارض صور منبثق (Lightbox): يكبّر الصورة فوق الشاشة كاملة.
 * الاستخدام: احتفظ بحالة src في الأب، ومرّر onClose لإغلاقه.
 * يُغلق بالنقر على الخلفية أو زر الإغلاق أو مفتاح Esc.
 */
export default function ImageLightbox({ src, onClose, alt }: Props) {
  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [src, onClose])

  if (!src) return null

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4"
      dir="rtl"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="إغلاق"
        className="absolute top-4 left-4 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white text-2xl flex items-center justify-center"
      >
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? 'صورة مكبّرة'}
        onClick={e => e.stopPropagation()}
        className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
      />
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'

interface ActiveDiscount {
  id: string
  code: string
  occasion: string | null
  discount_pct: number
  expires_at: string
}

// مفتاح تخزين الأكواد التي أغلقها العميل (حتى لا يتكرّر ظهور نفس الكود)
const DISMISSED_KEY = 'tn_dismissed_discounts'

function getDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function formatExpiry(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ar', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return ''
  }
}

function daysLeft(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

export default function DiscountPopup() {
  const [discount, setDiscount] = useState<ActiveDiscount | null>(null)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/active-discount')
      .then(r => r.json())
      .then((data: { code: ActiveDiscount | null }) => {
        if (cancelled || !data?.code) return
        // لا نُظهر الكود إذا سبق للعميل إغلاقه
        if (getDismissed().includes(data.code.id)) return
        setDiscount(data.code)
        setOpen(true)
      })
      .catch(() => { /* تجاهل بهدوء */ })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const handleClose = () => {
    if (discount) {
      try {
        const dismissed = getDismissed()
        if (!dismissed.includes(discount.id)) {
          localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed, discount.id]))
        }
      } catch { /* تجاهل */ }
    }
    setOpen(false)
  }

  const handleCopy = async () => {
    if (!discount) return
    try {
      await navigator.clipboard.writeText(discount.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* المتصفح لا يدعم النسخ التلقائي */ }
  }

  if (!open || !discount) return null

  const remaining = daysLeft(discount.expires_at)

  return (
    <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-dark/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-card rounded-t-3xl md:rounded-3xl shadow-2xl w-full md:max-w-md overflow-hidden wizard-enter">
        {/* زر الإغلاق */}
        <button
          onClick={handleClose}
          aria-label="إغلاق"
          className="absolute top-3 left-3 z-10 w-8 h-8 rounded-full bg-white/80 text-muted hover:text-dark flex items-center justify-center text-lg cursor-pointer shadow-sm"
        >
          ✕
        </button>

        {/* الرأس الترويجي */}
        <div className="bg-green/10 px-6 pt-8 pb-5 text-center">
          <div className="text-5xl mb-2">🎁</div>
          {discount.occasion && (
            <p className="text-sm font-medium text-green-700">{discount.occasion}</p>
          )}
          <h2 className="text-2xl font-black text-dark mt-1">
            خصم {discount.discount_pct}% خاص لك!
          </h2>
        </div>

        <div className="px-6 py-6 space-y-4">
          {/* الكود القابل للنسخ */}
          <div>
            <p className="text-xs text-muted text-center mb-2">انسخ الكود واستخدمه عند تقديم طلبك</p>
            <button
              onClick={handleCopy}
              className="w-full group flex items-center justify-between gap-3 border-2 border-dashed border-green/40 bg-green/5 rounded-2xl px-4 py-3 cursor-pointer transition-colors hover:border-green"
            >
              <span className="font-mono font-black text-xl text-dark tracking-wider">
                {discount.code}
              </span>
              <span className={`text-sm font-bold whitespace-nowrap ${copied ? 'text-green' : 'text-green-700'}`}>
                {copied ? '✓ تم النسخ' : '📋 نسخ'}
              </span>
            </button>
          </div>

          {/* مدة السريان */}
          <p className="text-xs text-center text-muted">
            {remaining > 0
              ? <>⏳ ساري {remaining === 1 ? 'ليوم واحد' : `لـ ${remaining} يوم`} — حتى {formatExpiry(discount.expires_at)}</>
              : <>⏳ ساري حتى {formatExpiry(discount.expires_at)}</>}
          </p>

          <button
            onClick={handleClose}
            className="w-full bg-green text-white font-bold rounded-2xl py-3 cursor-pointer hover:opacity-90 transition-opacity"
          >
            تمام، فهمت
          </button>
        </div>
      </div>
    </div>
  )
}

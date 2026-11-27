'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Button from '@/components/ui/Button'

export default function GoogleSignIn({ next, failed = false, beforeSignIn }: {
  next: string | null
  failed?: boolean
  beforeSignIn?: () => boolean
}) {
  const [enabled, setEnabled] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(failed)
  const starting = useRef(false)

  useEffect(() => {
    const origin = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!origin || !key) return
    const controller = new AbortController()
    fetch(new URL('/auth/v1/settings', origin), {
      headers: { apikey: key },
      cache: 'no-store',
      signal: controller.signal,
    }).then(async response => {
      if (response.ok) setEnabled((await response.json()).external?.google === true)
    }).catch(() => undefined)
    return () => controller.abort()
  }, [])

  async function signIn() {
    if (starting.current || beforeSignIn?.() === false) return
    starting.current = true
    setPending(true)
    setError(false)
    try {
      const response = await fetch('/api/auth/google/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next }),
      })
      const data = await response.json()
      if (!response.ok || typeof data.url !== 'string') throw new Error('Google sign-in unavailable')
      window.location.assign(data.url)
    } catch {
      starting.current = false
      setPending(false)
      setError(true)
    }
  }

  if (!enabled && !error) return null

  return (
    <div className="space-y-2">
      {enabled && <Button type="button" variant="outline" className="w-full gap-2.5 border-[#747775] bg-white px-3 text-sm text-[#1f1f1f] hover:bg-[#f8f9fa]" onClick={signIn} loading={pending}>
        <Image src="/brands/google-g.png" alt="" width={20} height={20} unoptimized className="shrink-0" />
        المتابعة باستخدام Google
      </Button>}
      {error && <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">تعذّر إكمال الدخول باستخدام Google. حاول مرة أخرى أو استخدم البريد الإلكتروني.</p>}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { publicAuthUrl } from '@/lib/auth-origin'
import { safePortalReturnPath } from '@/lib/portal-login'
import { createClient } from '@/lib/supabase'

export default function GoogleSignIn({ next, failed = false }: { next: string | null; failed?: boolean }) {
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
    if (starting.current) return
    starting.current = true
    setPending(true)
    setError(false)
    try {
      const callback = process.env.NODE_ENV === 'production'
        ? publicAuthUrl('/auth/google/callback')
        : new URL('/auth/google/callback', window.location.origin)
      const destination = safePortalReturnPath(next)
      if (destination) callback.searchParams.set('next', destination)
      const { data, error } = await createClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callback.href, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
      })
      if (error || !data.url) throw new Error('Google sign-in unavailable')
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
      {enabled && <Button type="button" variant="outline" className="w-full bg-white text-dark" onClick={signIn} loading={pending}>
        المتابعة باستخدام Google
      </Button>}
      {error && <p role="alert" className="text-sm text-red-700">تعذّر إكمال الدخول باستخدام Google. حاول مرة أخرى أو استخدم البريد الإلكتروني.</p>}
    </div>
  )
}

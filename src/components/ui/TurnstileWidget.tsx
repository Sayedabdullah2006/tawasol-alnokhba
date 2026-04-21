'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  onVerify: (token: string) => void
  onExpire?: () => void
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
      remove: (id: string) => void
    }
    onTurnstileLoad?: () => void
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
const SCRIPT_ID = 'cf-turnstile-script'

// Invisible Turnstile challenge — no checkbox, no CAPTCHA images, no user
// interaction unless Cloudflare flags the session. Token is generated on mount.
export default function TurnstileWidget({ onVerify, onExpire }: Props) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [scriptReady, setScriptReady] = useState<boolean>(
    typeof window !== 'undefined' && Boolean(window.turnstile)
  )

  useEffect(() => {
    if (!siteKey) return
    if (typeof window === 'undefined') return
    if (window.turnstile) { setScriptReady(true); return }

    if (!document.getElementById(SCRIPT_ID)) {
      window.onTurnstileLoad = () => setScriptReady(true)
      const s = document.createElement('script')
      s.id = SCRIPT_ID
      s.src = SCRIPT_URL
      s.async = true
      s.defer = true
      document.head.appendChild(s)
    } else {
      const iv = setInterval(() => {
        if (window.turnstile) { setScriptReady(true); clearInterval(iv) }
      }, 100)
      return () => clearInterval(iv)
    }
  }, [siteKey])

  useEffect(() => {
    if (!siteKey || !scriptReady || !containerRef.current || !window.turnstile) return
    if (widgetIdRef.current) return

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token: string) => onVerify(token),
      'expired-callback': () => onExpire?.(),
      'error-callback': () => onExpire?.(),
      // Default "managed" widget — visible, auto-verifies without CAPTCHA entry
      theme: 'light',
    })

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current) } catch { /* ignore */ }
        widgetIdRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady])

  if (!siteKey) return null

  // Empty container Cloudflare attaches to. Stays invisible until (if ever)
  // a challenge becomes necessary; then it renders centered.
  return <div ref={containerRef} className="flex justify-center" />
}

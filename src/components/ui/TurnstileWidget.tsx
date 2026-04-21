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

// Visible Turnstile challenge — always shows a checkbox that users must click
// to verify they are human. Token is generated after user interaction.
export default function TurnstileWidget({ onVerify, onExpire }: Props) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [scriptReady, setScriptReady] = useState<boolean>(
    typeof window !== 'undefined' && Boolean(window.turnstile)
  )

  // Debug logging
  console.log('TurnstileWidget Debug:', {
    siteKey: siteKey ? `${siteKey.substring(0, 10)}...` : 'undefined',
    scriptReady,
    windowTurnstile: typeof window !== 'undefined' ? !!window.turnstile : 'SSR'
  })

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
    console.log('TurnstileWidget Render Effect:', {
      siteKey: !!siteKey,
      scriptReady,
      containerExists: !!containerRef.current,
      turnstileExists: !!(typeof window !== 'undefined' && window.turnstile),
      widgetIdExists: !!widgetIdRef.current
    })

    if (!siteKey || !scriptReady || !containerRef.current || !window.turnstile) return
    if (widgetIdRef.current) return

    console.log('Rendering Turnstile widget...')
    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => {
          console.log('Turnstile token received:', token.substring(0, 20) + '...')
          onVerify(token)
        },
        'expired-callback': () => {
          console.log('Turnstile token expired')
          onExpire?.()
        },
        'error-callback': (errorCode: string) => {
          console.log('Turnstile error:', errorCode)
          onExpire?.()
        },
        // Always visible checkbox - user must click to verify
        theme: 'light',
        size: 'normal',
      })
      console.log('Turnstile widget rendered with ID:', widgetIdRef.current)
    } catch (error) {
      console.error('Turnstile render error:', error)
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current) } catch { /* ignore */ }
        widgetIdRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady])

  if (!siteKey) return null

  // Container where Cloudflare renders the visible checkbox widget
  return <div ref={containerRef} className="flex justify-center" />
}

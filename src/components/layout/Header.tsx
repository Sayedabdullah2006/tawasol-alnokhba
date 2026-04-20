'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '/', label: 'الرئيسية' },
  { href: '/services', label: 'الخدمات' },
  { href: '/pricing', label: 'الأسعار' },
  { href: '/policies', label: 'السياسات' },
  { href: '/request', label: 'تقديم طلب' },
]

interface UserInfo {
  id: string
  fullName: string
  role: string
}

export default function Header() {
  const router = useRouter()
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, role')
          .eq('id', authUser.id)
          .single()

        setUser({
          id: authUser.id,
          fullName: profile?.full_name || authUser.email?.split('@')[0] || 'مستخدم',
          role: profile?.role || 'client',
        })
      }
      setLoading(false)
    }
    load()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null)
      } else {
        load()
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setDropdownOpen(false)
    setMenuOpen(false)
    router.push('/')
    router.refresh()
  }

  const dashboardLink = user?.role === 'admin' ? '/admin' : '/dashboard'

  return (
    <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-md border-b border-border shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center" aria-label="تواصل النخبة">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="تواصل النخبة"
            className="h-16 w-auto object-contain"
            onError={(e) => {
              const el = e.currentTarget as HTMLImageElement
              el.style.display = 'none'
              el.nextElementSibling?.classList.remove('hidden')
            }} />
          <span className="hidden text-xl md:text-2xl font-black text-dark">تواصل النخبة</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map(l => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-dark/80 hover:text-green transition-colors">
              {l.label}
            </Link>
          ))}

          {loading ? (
            <div className="w-20 h-9 bg-border/30 rounded-xl animate-pulse" />
          ) : user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-green/10 text-green rounded-xl text-sm font-medium
                           hover:bg-green/20 transition-all cursor-pointer"
              >
                <div className="w-7 h-7 bg-green text-white rounded-full flex items-center justify-center text-xs font-black">
                  {user.fullName.charAt(0)}
                </div>
                <span className="max-w-[100px] truncate">{user.fullName}</span>
                <svg className={cn('w-4 h-4 transition-transform', dropdownOpen && 'rotate-180')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {dropdownOpen && (
                <div className="absolute left-0 mt-2 w-56 bg-card rounded-xl border border-border shadow-xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-border">
                    <p className="font-bold text-dark text-sm">{user.fullName}</p>
                    <p className="text-xs text-muted">
                      {user.role === 'admin' ? 'مدير المنصة' : 'عميل'}
                    </p>
                  </div>

                  <Link
                    href={dashboardLink}
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-4 py-3 text-sm text-dark hover:bg-cream transition-colors"
                  >
                    {user.role === 'admin' ? '🛡️ لوحة الإدارة' : '📋 طلباتي'}
                  </Link>

                  {user.role === 'admin' && (
                    <Link
                      href="/dashboard"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 px-4 py-3 text-sm text-dark hover:bg-cream transition-colors"
                    >
                      📋 لوحة العميل
                    </Link>
                  )}

                  <Link
                    href="/dashboard"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-4 py-3 text-sm text-dark hover:bg-cream transition-colors"
                  >
                    👤 الملف الشخصي
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-500 hover:bg-red-50
                               transition-colors border-t border-border cursor-pointer"
                  >
                    🚪 تسجيل الخروج
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/auth/login"
              className="px-5 py-2 bg-green text-white rounded-xl text-sm font-medium hover:bg-green/90 transition-all"
            >
              تسجيل الدخول
            </Link>
          )}
        </nav>

        {/* Mobile menu button */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden p-2 text-dark cursor-pointer"
          aria-label="القائمة"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu — fullscreen overlay so it always fits everything */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 top-20 z-50 bg-cream flex flex-col"
          onClick={() => setMenuOpen(false)}>
          <nav className="flex-1 overflow-y-auto px-4 pt-2 pb-6"
            onClick={e => e.stopPropagation()}>
            {/* User card on top when logged in */}
            {user && (
              <div className="flex items-center gap-3 p-4 mb-3 bg-card rounded-2xl border border-border">
                <div className="w-12 h-12 bg-green text-white rounded-full flex items-center justify-center text-lg font-black flex-shrink-0">
                  {user.fullName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-dark truncate">{user.fullName}</p>
                  <p className="text-xs text-muted">{user.role === 'admin' ? 'مدير المنصة' : 'عميل'}</p>
                </div>
              </div>
            )}

            {/* Quick account links when logged in */}
            {user && (
              <div className="bg-card rounded-2xl border border-border overflow-hidden mb-3">
                <Link
                  href={dashboardLink}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-4 text-dark hover:bg-cream transition-colors border-b border-border"
                >
                  <span className="text-xl">{user.role === 'admin' ? '🛡️' : '📋'}</span>
                  <span className="font-medium">{user.role === 'admin' ? 'لوحة الإدارة' : 'طلباتي'}</span>
                </Link>
                {user.role === 'admin' && (
                  <Link
                    href="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-4 text-dark hover:bg-cream transition-colors border-b border-border"
                  >
                    <span className="text-xl">📋</span>
                    <span className="font-medium">لوحة العميل</span>
                  </Link>
                )}
                <Link
                  href="/dashboard/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-4 text-dark hover:bg-cream transition-colors"
                >
                  <span className="text-xl">👤</span>
                  <span className="font-medium">الملف الشخصي</span>
                </Link>
              </div>
            )}

            {/* Site nav */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden mb-3">
              {navLinks.map((l, i) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    'block px-4 py-4 text-dark hover:bg-cream transition-colors font-medium',
                    i < navLinks.length - 1 && 'border-b border-border'
                  )}
                >
                  {l.label}
                </Link>
              ))}
            </div>

            {/* Auth action — last so it's never clipped */}
            {loading ? (
              <div className="h-14 bg-border/30 rounded-2xl animate-pulse" />
            ) : user ? (
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl font-bold cursor-pointer hover:bg-red-100 transition-colors"
              >
                🚪 تسجيل الخروج
              </button>
            ) : (
              <Link
                href="/auth/login"
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center justify-center gap-2 py-4 bg-green text-white rounded-2xl font-bold"
              >
                تسجيل الدخول
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}

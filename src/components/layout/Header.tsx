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

      {/* Mobile menu */}
      <div className={cn(
        'md:hidden overflow-hidden transition-all duration-300 bg-card border-b border-border',
        menuOpen ? 'max-h-96' : 'max-h-0 border-b-0'
      )}>
        <nav className="flex flex-col px-4 py-3 gap-1">
          {navLinks.map(l => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="py-3 text-sm font-medium text-dark/80 hover:text-green transition-colors"
            >
              {l.label}
            </Link>
          ))}

          {loading ? null : user ? (
            <>
              <div className="border-t border-border my-2" />
              <div className="flex items-center gap-2 py-2">
                <div className="w-8 h-8 bg-green text-white rounded-full flex items-center justify-center text-sm font-black">
                  {user.fullName.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-bold text-dark">{user.fullName}</p>
                  <p className="text-xs text-muted">{user.role === 'admin' ? 'مدير المنصة' : 'عميل'}</p>
                </div>
              </div>

              <Link
                href={dashboardLink}
                onClick={() => setMenuOpen(false)}
                className="py-3 text-sm font-medium text-dark/80 hover:text-green transition-colors"
              >
                {user.role === 'admin' ? '🛡️ لوحة الإدارة' : '📋 طلباتي'}
              </Link>

              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="py-3 text-sm font-medium text-dark/80 hover:text-green transition-colors"
              >
                👤 الملف الشخصي
              </Link>

              <button
                onClick={handleLogout}
                className="py-3 text-sm font-medium text-red-500 text-right cursor-pointer"
              >
                🚪 تسجيل الخروج
              </button>
            </>
          ) : (
            <Link
              href="/auth/login"
              onClick={() => setMenuOpen(false)}
              className="py-3 text-sm font-medium text-green"
            >
              تسجيل الدخول
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}

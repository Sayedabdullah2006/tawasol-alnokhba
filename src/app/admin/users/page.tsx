'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/utils'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface UserData {
  id: string
  email: string
  full_name: string
  phone: string
  city: string
  role: string
  is_banned: boolean
  requests_count: number
  created_at: string
  last_sign_in: string | null
}

export default function AdminUsersPage() {
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<UserData[]>([])
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [pwUser, setPwUser] = useState<UserData | null>(null)
  const [pwValue, setPwValue] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [motivatingId, setMotivatingId] = useState<string | null>(null)

  // تحفيز المستخدمين الذين لم يقدّموا أي طلب
  const DEFAULT_INCENTIVE_MSG =
    'يسعدنا انضمامك إلى تواصل النخبة! 🎉\n\nلاحظنا أنك لم تقدّم طلبك الأول بعد، ويسعدنا أن نمنحك خصماً خاصاً لتبدأ معنا. استخدم الكود التالي عند تقديم طلبك الأول واحصل على الخصم مباشرةً.\n\nبانتظار إبداعك معنا 🌟'
  const [incOpen, setIncOpen] = useState(false)
  const [incPct, setIncPct] = useState('30')
  const [incExpiry, setIncExpiry] = useState('14')
  const [incCode, setIncCode] = useState('')
  const [incMessage, setIncMessage] = useState(DEFAULT_INCENTIVE_MSG)
  const [incSending, setIncSending] = useState(false)

  const loadUsers = useCallback(async () => {
    // Verify admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') { router.push('/dashboard'); return }

    const res = await fetch('/api/admin/users')
    if (res.ok) {
      const data = await res.json()
      setUsers(data.users)
    }
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { loadUsers() }, [loadUsers])

  useEffect(() => {
    document.body.style.overflow = (pwUser || incOpen) ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [pwUser, incOpen])

  const handleChangePassword = async () => {
    if (!pwUser) return
    if (pwValue.length < 8) {
      showToast('كلمة المرور يجب أن تكون 8 أحرف على الأقل', 'error')
      return
    }
    setPwSaving(true)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: pwUser.id, action: 'set-password', newPassword: pwValue }),
    })
    if (res.ok) {
      showToast(`تم تغيير كلمة مرور ${pwUser.full_name || pwUser.email}`)
      setPwUser(null)
      setPwValue('')
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? 'فشل تغيير كلمة المرور', 'error')
    }
    setPwSaving(false)
  }

  const handleToggleBan = async (userId: string, isBanned: boolean) => {
    setActionLoading(userId)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: isBanned ? 'unban' : 'ban' }),
    })

    if (res.ok) {
      showToast(isBanned ? 'تم تفعيل المستخدم' : 'تم إيقاف المستخدم')
      loadUsers()
    } else {
      const data = await res.json()
      showToast(data.error || 'حدث خطأ', 'error')
    }
    setActionLoading(null)
  }

  // العملاء بلا طلبات (غير الإداريين وغير الموقوفين) — مؤهّلون للتحفيز
  const eligibleCount = users.filter(
    u => u.role !== 'admin' && !u.is_banned && (u.requests_count ?? 0) === 0 && u.email && u.email !== '-'
  ).length

  // تحفيز فردي سريع — رسالة بسيطة بدون خصم
  const handleMotivateOne = async (u: UserData) => {
    setMotivatingId(u.id)
    try {
      const res = await fetch('/api/admin/motivate-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) showToast(`تم إرسال رسالة تحفيز إلى ${u.full_name || u.email}`)
      else showToast(data.error ?? 'فشل الإرسال', 'error')
    } catch {
      showToast('حدث خطأ في الاتصال', 'error')
    } finally {
      setMotivatingId(null)
    }
  }

  const handleSendIncentive = async () => {
    const pct = Number(incPct)
    if (!pct || pct <= 0 || pct > 100) {
      showToast('نسبة الخصم يجب أن تكون بين 1 و 100', 'error')
      return
    }
    if (!incMessage.trim()) {
      showToast('الرسالة مطلوبة', 'error')
      return
    }
    setIncSending(true)
    const res = await fetch('/api/admin/incentivize-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discountPct: pct,
        message: incMessage.trim(),
        expiryDays: Number(incExpiry) || 14,
        code: incCode.trim() || undefined,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      showToast(`تم الإرسال بنجاح ✅ (${data.sent} رسالة · الكود ${data.code})`)
      setIncOpen(false)
    } else {
      showToast(data.error || 'فشل الإرسال', 'error')
    }
    setIncSending(false)
  }

  const filtered = users.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.includes(q)
  })

  if (loading) return <LoadingSpinner size="lg" />

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="text-2xl font-black text-dark">إدارة المستخدمين</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIncOpen(true)}
            className="px-3 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all bg-green/10 text-green hover:bg-green/20"
          >
            🎁 تحفيز من لم يطلبوا ({eligibleCount})
          </button>
          <span className="text-sm text-muted">{users.length} مستخدم</span>
        </div>
      </div>

      <div className="mb-4">
        <Input
          placeholder="بحث بالاسم أو البريد أو الجوال..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream">
              <tr>
                <th className="px-4 py-3 text-right font-bold">المستخدم</th>
                <th className="px-4 py-3 text-right font-bold">البريد</th>
                <th className="px-4 py-3 text-right font-bold">الجوال</th>
                <th className="px-4 py-3 text-right font-bold">الدور</th>
                <th className="px-4 py-3 text-right font-bold">الطلبات</th>
                <th className="px-4 py-3 text-right font-bold">التسجيل</th>
                <th className="px-4 py-3 text-right font-bold">الحالة</th>
                <th className="px-4 py-3 text-right font-bold">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className="border-t border-border hover:bg-cream/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-green/10 rounded-full flex items-center justify-center text-green text-xs font-black flex-shrink-0">
                        {u.full_name?.charAt(0) || '?'}
                      </div>
                      <span className="font-medium text-dark">{u.full_name || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted" dir="ltr">{u.email}</td>
                  <td className="px-4 py-3 text-muted" dir="ltr">{u.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      u.role === 'admin' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                    }`}>
                      {u.role === 'admin' ? 'مدير' : 'عميل'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-bold text-dark">{u.requests_count}</span>
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3">
                    {u.is_banned ? (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200">
                        موقوف
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green/5 text-green border border-green/20">
                        نشط
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => { setPwUser(u); setPwValue('') }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all bg-blue-50 text-blue-600 hover:bg-blue-100"
                      >
                        🔑 كلمة المرور
                      </button>
                      {u.role !== 'admin' && !u.is_banned && (u.requests_count ?? 0) === 0 && u.email && u.email !== '-' && (
                        <button
                          onClick={() => handleMotivateOne(u)}
                          disabled={motivatingId === u.id}
                          title="إرسال رسالة تحفيز لتقديم أول طلب"
                          className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all disabled:opacity-50 bg-gold/10 text-gold hover:bg-gold/20"
                        >
                          {motivatingId === u.id ? '...' : '🤍 تحفيز'}
                        </button>
                      )}
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => handleToggleBan(u.id, u.is_banned)}
                          disabled={actionLoading === u.id}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all disabled:opacity-50 ${
                            u.is_banned
                              ? 'bg-green/10 text-green hover:bg-green/20'
                              : 'bg-red-50 text-red-500 hover:bg-red-100'
                          }`}
                        >
                          {actionLoading === u.id ? '...' : u.is_banned ? 'تفعيل' : 'إيقاف'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="p-8 text-center text-muted">لا توجد نتائج</p>
        )}
      </div>

      {pwUser && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-dark/50 p-0 md:p-4">
          <div className="bg-card rounded-t-2xl md:rounded-2xl border border-border w-full md:max-w-md p-5 md:p-6 space-y-4 max-h-[90dvh] overflow-y-auto">
            <div>
              <h3 className="font-black text-dark text-lg">تغيير كلمة المرور</h3>
              <p className="text-sm text-muted mt-1">{pwUser.full_name || pwUser.email}</p>
            </div>
            <Input
              id="admin_new_password"
              label="كلمة المرور الجديدة"
              type="password"
              dir="ltr"
              placeholder="8 أحرف على الأقل"
              value={pwValue}
              onChange={e => setPwValue(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setPwUser(null); setPwValue('') }} className="flex-1">إلغاء</Button>
              <Button onClick={handleChangePassword} loading={pwSaving} disabled={!pwValue} className="flex-1">
                تأكيد التغيير
              </Button>
            </div>
          </div>
        </div>
      )}

      {incOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-dark/50 p-0 md:p-4">
          <div className="bg-card rounded-t-2xl md:rounded-2xl border border-border w-full md:max-w-lg p-5 md:p-6 space-y-4 max-h-[90dvh] overflow-y-auto">
            <div>
              <h3 className="font-black text-dark text-lg">🎁 تحفيز المستخدمين بدون طلبات</h3>
              <p className="text-sm text-muted mt-1">
                سيُرسَل كود خصم ترحيبي عبر البريد إلى <strong className="text-green">{eligibleCount}</strong> مستخدم لم يقدّموا أي طلب.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                id="inc_pct"
                label="نسبة الخصم %"
                type="number"
                dir="ltr"
                value={incPct}
                onChange={e => setIncPct(e.target.value)}
              />
              <Input
                id="inc_expiry"
                label="صلاحية الكود (أيام)"
                type="number"
                dir="ltr"
                value={incExpiry}
                onChange={e => setIncExpiry(e.target.value)}
              />
            </div>

            <Input
              id="inc_code"
              label="كود الخصم (اختياري)"
              dir="ltr"
              placeholder={`WELCOME${Number(incPct) || 30} (تلقائي)`}
              value={incCode}
              onChange={e => setIncCode(e.target.value)}
            />

            <div>
              <label htmlFor="inc_msg" className="block text-sm font-medium text-dark mb-1.5">نص الرسالة</label>
              <textarea
                id="inc_msg"
                rows={6}
                dir="rtl"
                value={incMessage}
                onChange={e => setIncMessage(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm leading-relaxed text-dark focus:border-green focus:outline-none focus:ring-1 focus:ring-green resize-y"
              />
              <p className="text-xs text-muted mt-1">سيظهر هذا النص أعلى بطاقة كود الخصم. تُحفظ الأسطر كما هي.</p>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setIncOpen(false)} className="flex-1">إلغاء</Button>
              <Button
                onClick={handleSendIncentive}
                loading={incSending}
                disabled={!incPct || !incMessage.trim() || eligibleCount === 0}
                className="flex-1"
              >
                إرسال للجميع ({eligibleCount})
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

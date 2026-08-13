'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import StatusBadge from '@/components/dashboard/StatusBadge'
import {
  formatMembershipNumber,
  membershipBenefitLabel,
  membershipStatusLabel,
  type MembershipBenefitType,
} from '@/lib/memberships'
import { formatNumber, generateRequestNumber } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import MembershipPlanBadge from '@/components/memberships/MembershipPlanBadge'

type MemberGroup = {
  key: string
  clientName: string
  clientEmail: string
  clientPhone: string
  memberships: any[]
  current: any
  totalAvailable: number
  totalReserved: number
  totalUsed: number
  recentRequests: any[]
  approvedDesigns: any[]
}

function available(wallet: any) {
  return wallet ? wallet.total_credits - wallet.reserved_credits - wallet.used_credits : 0
}

function memberKey(item: any) {
  return item.user_id || item.client_email?.trim().toLowerCase() || item.client_phone || item.id
}

function statusClass(status: string) {
  if (status === 'active') return 'bg-green text-white'
  if (status === 'payment_review') return 'bg-orange-100 text-orange-800'
  if (status === 'paused') return 'bg-gold/20 text-dark'
  return 'bg-slate-100 text-slate-700'
}

export default function AdminMembersPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/memberships', { cache: 'no-store' })
    if (response.status === 403) { router.replace('/dashboard'); return }
    const data = await response.json().catch(() => ({}))
    setRows(data.memberships ?? [])
    setLoading(false)
  }, [router])

  useEffect(() => { void load() }, [load])

  const action = async (id: string, value: string, extra: Record<string, unknown> = {}) => {
    const key = `${id}:${value}:${extra.deliverableId ?? ''}`
    setWorking(key)
    const response = await fetch('/api/admin/memberships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ membershipId: id, action: value, ...extra }),
    })
    const data = await response.json().catch(() => ({}))
    showToast(response.ok ? 'تم تحديث العضوية' : data.error ?? 'تعذّر تحديث العضوية', response.ok ? 'success' : 'error')
    if (response.ok) await load()
    setWorking(null)
  }

  const completeDeliverable = (membershipId: string, deliverable: any) => {
    const fileUrl = window.prompt('رابط ملف التسليم (اختياري)', deliverable.file_url ?? '')
    if (fileUrl === null) return
    void action(membershipId, 'complete_deliverable', { deliverableId: deliverable.id, fileUrl })
  }

  const members = useMemo(() => {
    const grouped = new Map<string, any[]>()
    for (const row of rows) grouped.set(memberKey(row), [...(grouped.get(memberKey(row)) ?? []), row])
    return [...grouped.entries()].map(([key, memberships]): MemberGroup => {
      const sorted = memberships.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const current = sorted.find(item => item.status === 'active') ?? sorted.find(item => item.status === 'payment_review') ?? sorted[0]
      const recentRequests = sorted.flatMap(item => item.recentRequests ?? []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5)
      const approvedDesigns = sorted.flatMap(item => item.approvedDesigns ?? []).sort((a, b) => String(b.approvedAt).localeCompare(String(a.approvedAt))).slice(0, 5)
      return {
        key,
        clientName: current.client_name,
        clientEmail: current.client_email,
        clientPhone: current.client_phone ?? '',
        memberships: sorted,
        current,
        totalAvailable: available(current.wallet),
        totalReserved: Number(current.wallet?.reserved_credits ?? 0),
        totalUsed: Number(current.wallet?.used_credits ?? 0),
        recentRequests,
        approvedDesigns,
      }
    }).filter(member => {
      if (status && !member.memberships.some(item => item.status === status)) return false
      if (!search.trim()) return true
      const query = search.trim().toLowerCase()
      return member.clientName?.toLowerCase().includes(query) || member.clientEmail?.toLowerCase().includes(query) || member.clientPhone?.includes(query) || member.memberships.some(item => formatMembershipNumber(item.membership_number).toLowerCase().includes(query))
    }).sort((a, b) => new Date(b.current.created_at).getTime() - new Date(a.current.created_at).getTime())
  }, [rows, search, status])

  if (loading) return <LoadingSpinner size="lg" />

  return <div className="mx-auto w-full max-w-7xl p-4 md:p-6" dir="rtl">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-3xl font-black text-dark">الأعضاء</h1><p className="mt-1 text-sm text-muted">ملفات المشتركين وعضوياتهم وأرصدتهم وآخر أعمالهم.</p></div>
      <div className="flex gap-2 text-xs font-bold"><span className="rounded-full bg-green/10 px-3 py-1.5 text-green">{members.length} عضو</span><span className="rounded-full bg-cream px-3 py-1.5 text-muted">{rows.filter(item => item.status === 'active').length} عضوية نشطة</span></div>
    </div>

    <section className="mb-5 flex flex-wrap gap-2 rounded-lg border border-border bg-card p-3">
      <input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث بالاسم أو البريد أو رقم العضوية..." className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-white px-4 text-sm outline-none focus:border-green sm:min-w-72" />
      <select value={status} onChange={event => setStatus(event.target.value)} className="min-h-11 rounded-lg border border-border bg-white px-4 text-sm"><option value="">كل حالات العضوية</option><option value="active">نشطة</option><option value="payment_review">بانتظار تحقق الدفع</option><option value="paused">معلّقة</option><option value="expired">منتهية</option><option value="cancelled">ملغاة</option></select>
      <Link href="/admin/member-requests" className="inline-flex min-h-11 items-center rounded-lg border border-green/30 bg-green/5 px-4 text-sm font-bold text-green">فتح طلبات الأعضاء</Link>
    </section>

    <div className="space-y-4">
      {members.length === 0 ? <div className="rounded-lg border border-border bg-card p-10 text-center text-muted">لا يوجد أعضاء يطابقون الفلاتر الحالية.</div> : members.map(member => {
        const item = member.current
        const isExpanded = !!expanded[member.key]
        return <article key={member.key} className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3"><MembershipPlanBadge planId={item.plan_id ?? item.membership_plans?.id} planName={item.membership_plans?.name_ar} size="lg" /><div className="min-w-0"><p className="text-xs font-bold text-gold">{formatMembershipNumber(item.membership_number)}</p><h2 className="mt-1 truncate text-xl font-black text-dark">{member.clientName}</h2><p className="truncate text-xs text-muted" dir="ltr">{member.clientEmail}</p>{member.clientPhone && <p className="text-xs text-muted" dir="ltr">{member.clientPhone}</p>}</div></div>
                <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(item.status)}`}>{membershipStatusLabel(item.status)}</span>{member.memberships.length > 1 && <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700">{member.memberships.length} عضويات</span>}</div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 border-y border-border py-4 text-center">
                <div><p className="text-[11px] text-muted">الرصيد المتاح</p><p className="mt-1 text-2xl font-black text-green">{member.totalAvailable}</p></div>
                <div className="border-x border-border"><p className="text-[11px] text-muted">المحجوز</p><p className="mt-1 text-2xl font-black text-gold">{member.totalReserved}</p></div>
                <div><p className="text-[11px] text-muted">المستخدم</p><p className="mt-1 text-2xl font-black text-dark">{member.totalUsed}</p></div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {item.status === 'payment_review' && <Button size="sm" onClick={() => action(item.id, 'activate_bank')} loading={working === `${item.id}:activate_bank:`}>تأكيد التحويل وتفعيلها</Button>}
                {item.status === 'active' && <Button size="sm" variant="outline" onClick={() => action(item.id, 'pause')} loading={working === `${item.id}:pause:`}>تعليق العضوية</Button>}
                {item.status === 'paused' && <Button size="sm" onClick={() => action(item.id, 'resume')} loading={working === `${item.id}:resume:`}>استئناف العضوية</Button>}
                <a href={`/api/memberships/${item.id}/contract`} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-dark">العقد PDF</a>
                <Link href={`/admin/member-requests?user=${encodeURIComponent(member.key)}`} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-dark">طلبات العضو</Link>
                {item.magazine?.share_token && item.magazine.is_public && <a href={`/m/${item.magazine.share_token}`} target="_blank" rel="noreferrer" className="rounded-lg border border-green/30 bg-green/5 px-3 py-2 text-xs font-bold text-green">المجلة العامة</a>}
                <button type="button" onClick={() => setExpanded(current => ({ ...current, [member.key]: !isExpanded }))} className="mr-auto rounded-lg bg-cream px-3 py-2 text-xs font-bold text-dark">{isExpanded ? 'إخفاء التفاصيل' : 'مزيد من التفاصيل'}</button>
              </div>
            </div>

            <aside className="rounded-lg border border-border bg-white p-4">
              <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-dark">آخر المنشورات</h3><span className="text-[11px] text-muted">{member.recentRequests.length}</span></div>
              <div className="mt-3 space-y-2">{member.recentRequests.length === 0 ? <p className="py-5 text-center text-xs text-muted">لم يرسل العضو طلبات نشر بعد.</p> : member.recentRequests.map(request => <Link href={`/admin/requests/${request.id}`} key={request.id} className="block rounded-lg border border-border p-3 transition hover:border-green"><div className="flex items-start justify-between gap-2"><p className="line-clamp-2 text-xs font-bold text-dark">{request.title || 'طلب دون عنوان'}</p><StatusBadge status={request.status} userRole="admin" /></div><p className="mt-2 text-[10px] text-muted">{generateRequestNumber(request.request_number)} · {new Date(request.created_at).toLocaleDateString('ar-SA')}</p></Link>)}</div>
            </aside>
          </div>

          {isExpanded && <div className="grid gap-4 border-t border-border bg-cream/35 p-5 lg:grid-cols-3">
            <section>
              <h3 className="text-sm font-black text-dark">العضويات</h3>
              <div className="mt-3 space-y-2">
                {member.memberships.map(membership => <div key={membership.id} className={`rounded-lg border bg-white p-4 text-xs ${membership.id === item.id ? 'border-green/40' : 'border-border'}`}>
                  <div className="flex items-center justify-between gap-2"><strong>{membership.membership_plans?.name_ar}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass(membership.status)}`}>{membershipStatusLabel(membership.status)}</span></div>
                  <div className="mt-2 flex justify-between gap-2 text-muted"><span>{formatMembershipNumber(membership.membership_number)} · {membership.duration_months} أشهر</span><span>{formatNumber(membership.total_amount)} ر.س</span></div>
                  <p className="mt-2 text-[11px] text-muted">{membership.starts_at ? new Date(membership.starts_at).toLocaleDateString('ar-SA') : 'بانتظار التفعيل'} - {membership.ends_at ? new Date(membership.ends_at).toLocaleDateString('ar-SA') : 'غير محدد'}</p>
                </div>)}
              </div>
            </section>
            <section><h3 className="text-sm font-black text-dark">أرصدة المزايا</h3><div className="mt-3 space-y-2">{item.benefitWallets?.length ? item.benefitWallets.map((wallet: any) => <div key={wallet.id} className="rounded-lg border border-border bg-white p-3"><div className="flex justify-between gap-2 text-xs"><span className="text-muted">{membershipBenefitLabel(wallet.benefit_type as MembershipBenefitType)}</span><strong className="text-dark">{wallet.total_units - wallet.reserved_units - wallet.used_units} متبقي</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full bg-green" style={{ width: `${wallet.total_units ? Math.max(0, Math.min(100, ((wallet.total_units - wallet.reserved_units - wallet.used_units) / wallet.total_units) * 100)) : 0}%` }} /></div></div>) : <p className="rounded-lg bg-white p-4 text-xs text-muted">لا توجد أرصدة مزايا إضافية.</p>}</div></section>
            <section><h3 className="text-sm font-black text-dark">آخر التصاميم المعتمدة</h3><div className="mt-3 grid grid-cols-3 gap-2">{member.approvedDesigns.length ? member.approvedDesigns.map(design => <a key={design.id} href={design.cover} target="_blank" rel="noreferrer" className="aspect-[4/5] overflow-hidden rounded-lg border border-border bg-white"><img src={design.cover} alt={design.title} className="h-full w-full object-cover" /></a>) : <p className="col-span-3 rounded-lg bg-white p-4 text-center text-xs text-muted">لا توجد تصاميم معتمدة بعد.</p>}</div></section>
            {item.deliverables?.length > 0 && <section className="lg:col-span-3"><h3 className="text-sm font-black text-dark">الخطط والمخرجات</h3><div className="mt-3 grid gap-2 md:grid-cols-2">{item.deliverables.map((deliverable: any) => <div key={deliverable.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-white p-3"><div><p className="text-xs font-bold text-dark">{deliverable.title}</p><p className="text-[11px] text-muted">{deliverable.status === 'completed' ? 'مكتمل' : deliverable.status === 'in_progress' ? 'قيد الإعداد' : 'بانتظار البدء'}</p></div><div className="flex gap-2">{deliverable.status === 'pending' && <Button size="sm" variant="outline" onClick={() => action(item.id, 'start_deliverable', { deliverableId: deliverable.id })}>بدء</Button>}{deliverable.status !== 'completed' && <Button size="sm" onClick={() => completeDeliverable(item.id, deliverable)}>تسليم</Button>}</div></div>)}</div></section>}
          </div>}
        </article>
      })}
    </div>
  </div>
}

'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase'
import { useCategories, type DBCategory } from '@/lib/hooks'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import type { Influencer } from '@/components/pricing/StepInfluencer'
import type { RequestType } from './RStepRequestType'
import type { ClientType } from './RStep1ClientType'
import type { CampaignSetup } from './RStepCampaignSetup'
import RStep3Details from './RStep3Details'
import RStepChannels from './RStepChannels'
import { type ContactData } from './RStep5Contact'
import RStep6Terms from './RStep6Terms'
import RStepCampaignPosts, { type CampaignPostData, makeEmptyPost, isPostComplete } from './RStepCampaignPosts'
import SuccessScreen from './SuccessScreen'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import { COMPETITION_SUBCATEGORIES, getCompetitionPositions } from '@/lib/constants'
import { AQ_EXTRAS_LIST, AQ_EXTRAS_NAMES, AQ_EXTRAS_ICONS } from '@/lib/auto-quote'

// ─── خيارات القوائم المنسدلة ───────────────────────────────────────
const REQUEST_TYPE_OPTIONS: { id: RequestType; label: string }[] = [
  { id: 'single',   label: '📄 منشور واحد' },
  { id: 'campaign', label: '🚀 حملة متعددة المنشورات' },
]

const CLIENT_TYPE_OPTIONS: { id: ClientType; label: string }[] = [
  { id: 'individual', label: '👤 فرد' },
  { id: 'business',   label: '🏢 شركة / مؤسسة' },
  { id: 'government', label: '🏛️ جهة حكومية' },
  { id: 'charity',    label: '❤️ جمعية خيرية' },
]

const DURATION_OPTIONS = [
  { id: 'week_1',  label: 'أسبوع' },
  { id: 'week_2',  label: 'أسبوعان' },
  { id: 'month_1', label: 'شهر' },
  { id: 'month_2', label: 'شهران' },
  { id: 'month_3', label: '3 أشهر' },
  { id: 'month_6', label: '6 أشهر' },
  { id: 'open',    label: 'مفتوح' },
]

// مفتاح حفظ المسودة محلياً + مدة صلاحيتها (7 أيام)
const DRAFT_KEY = 'tn_request_draft_v1'
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

// أنماط مشتركة للحقول
const selectCls = 'w-full rounded-xl border-2 border-border bg-white px-3 py-3 text-sm text-dark focus:outline-none focus:border-green transition-colors'
const fieldLabel = 'block text-sm font-bold text-dark mb-1.5'

// ─── مكوّن قسم قابل للطي ─────────────────────────────────────────
function FormSection({
  index, title, subtitle, complete, open, onToggle, children,
}: {
  index: number
  title: string
  subtitle?: string
  complete: boolean
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className={cn(
      'bg-card rounded-2xl border-2 overflow-hidden transition-all',
      complete ? 'border-green/40' : 'border-border',
    )}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-right hover:bg-muted/5 transition-colors"
      >
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0',
          complete ? 'bg-green text-white' : 'bg-muted/15 text-muted',
        )}>
          {complete ? '✓' : index}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-dark text-sm">{title}</div>
          {subtitle && <div className="text-xs text-muted mt-0.5">{subtitle}</div>}
        </div>
        <span className="text-muted text-xs flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-2 border-t border-border wizard-enter">
          {children}
        </div>
      )}
    </div>
  )
}

export default function RequestWizard() {
  const { showToast } = useToast()
  const { categories, loading: catsLoading } = useCategories()
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [requestNumber, setRequestNumber] = useState('')
  const [influencers, setInfluencers] = useState<Influencer[]>([])
  const [loading, setLoading] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  const draftRestored = useRef(false)

  // القسم المفتوح حالياً (أكورديون أحادي الفتح)
  const [openSection, setOpenSection] = useState(0)

  // ── بيانات الطلب ───────────────────────────────────────────────
  const [selectedInfluencer, setSelectedInfluencer] = useState<string | null>(null)
  const [requestType, setRequestType]   = useState<RequestType | null>(null)
  const [clientType, setClientType]     = useState<ClientType | null>(null)
  const [category, setCategory]         = useState<string | null>(null)
  const [subOption, setSubOption]       = useState<string | null>(null)
  const [competitionSelection, setCompetitionSelection] =
    useState<{ subcategory: string; position: string } | null>(null)
  const [details, setDetails] = useState({
    title: '', content: '', link: '', hashtags: '', preferredDate: '', images: [] as string[],
  })
  const [channels, setChannels]         = useState<string[]>([])
  const [selectedExtras, setSelectedExtras] = useState<string[]>([])
  const [contact, setContact]           = useState<ContactData>({ fullName: '', phone: '', email: '', city: '', xHandle: '' })
  const [termsAccepted, setTermsAccepted]   = useState(false)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)

  // ── بيانات الحملة ──────────────────────────────────────────────
  const [campaignSetup, setCampaignSetup] = useState<CampaignSetup>({ postCount: 2, duration: '' })
  const [campaignPosts, setCampaignPosts] = useState<CampaignPostData[]>([makeEmptyPost(), makeEmptyPost()])

  // مزامنة طول مصفوفة المنشورات مع عدد المنشورات
  useEffect(() => {
    setCampaignPosts(prev => {
      const n = campaignSetup.postCount
      if (prev.length === n) return prev
      if (prev.length < n) return [...prev, ...Array.from({ length: n - prev.length }, makeEmptyPost)]
      return prev.slice(0, n)
    })
  }, [campaignSetup.postCount])

  const selectedCat: DBCategory | null = categories.find(c => c.id === category) ?? null
  const needsSubOption = !!(selectedCat?.has_sub_option && selectedCat?.sub_options?.length)
  const isCompetitionCategory = category === 'competitions'
  const availableCategories = clientType
    ? categories.filter(c => !c.client_types || c.client_types.includes(clientType))
    : categories
  const selectedInf = influencers.find(i => i.id === selectedInfluencer) ?? null

  // ── تحميل البيانات ──────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    supabase.from('influencers').select('*').eq('is_active', true).then(({ data }) => {
      setInfluencers((data as Influencer[]) ?? [])
      setLoading(false)
    })
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data: profile }) => {
          if (profile) {
            setContact(prev => ({
              fullName: profile.full_name || prev.fullName,
              phone:    profile.phone    || prev.phone,
              email:    user.email       || prev.email,
              city:     profile.city     || prev.city,
              xHandle:  profile.x_handle || prev.xHandle,
            }))
          }
        })
      }
    })
  }, [])

  // ── استرجاع مسودة غير مكتملة (مرة واحدة عند الفتح) ──────────────
  useEffect(() => {
    if (draftRestored.current) return
    draftRestored.current = true
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const d = JSON.parse(raw)
        if (d && typeof d.savedAt === 'number' && Date.now() - d.savedAt < DRAFT_TTL_MS) {
          if (d.selectedInfluencer)   setSelectedInfluencer(d.selectedInfluencer)
          if (d.requestType)          setRequestType(d.requestType)
          if (d.clientType)           setClientType(d.clientType)
          if (d.category)             setCategory(d.category)
          if (d.subOption)            setSubOption(d.subOption)
          if (d.competitionSelection) setCompetitionSelection(d.competitionSelection)
          if (d.details)              setDetails(d.details)
          if (Array.isArray(d.channels))        setChannels(d.channels)
          if (Array.isArray(d.selectedExtras))  setSelectedExtras(d.selectedExtras)
          if (d.contact)              setContact(d.contact)
          if (d.campaignSetup)        setCampaignSetup(d.campaignSetup)
          if (Array.isArray(d.campaignPosts) && d.campaignPosts.length) setCampaignPosts(d.campaignPosts)
          showToast('تم استرجاع طلبك غير المكتمل ✨', 'info')
        }
      }
    } catch { /* مسودة تالفة — نتجاهلها */ }
    setHydrated(true)
  }, [showToast])

  // ── حفظ المسودة تلقائياً بعد أي تغيير ───────────────────────────
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        savedAt: Date.now(),
        selectedInfluencer, requestType, clientType, category, subOption,
        competitionSelection, details, channels, selectedExtras, contact,
        campaignSetup, campaignPosts,
      }))
    } catch { /* تجاوز سعة التخزين — نتجاهل بهدوء */ }
  }, [
    hydrated, selectedInfluencer, requestType, clientType, category, subOption,
    competitionSelection, details, channels, selectedExtras, contact,
    campaignSetup, campaignPosts,
  ])

  // ملاحظة: بيانات التواصل تُحمَّل تلقائياً من بروفايل الحساب وتُرسَل مع الطلب،
  // دون عرض حقول إدخال — لأنها مُسجّلة مسبقاً عند إنشاء الحساب.

  // ── تبديل الخدمات الإضافية (مع تعارض pin6/pin12) ────────────────
  const toggleExtra = (id: string) => {
    if (id === 'pin6' && !selectedExtras.includes('pin6')) {
      setSelectedExtras([...selectedExtras.filter(e => e !== 'pin12'), 'pin6']); return
    }
    if (id === 'pin12' && !selectedExtras.includes('pin12')) {
      setSelectedExtras([...selectedExtras.filter(e => e !== 'pin6'), 'pin12']); return
    }
    setSelectedExtras(
      selectedExtras.includes(id) ? selectedExtras.filter(e => e !== id) : [...selectedExtras, id]
    )
  }

  // ── اكتمال الأقسام ──────────────────────────────────────────────
  const subOptionSatisfied =
    isCompetitionCategory
      ? !!competitionSelection?.subcategory && !!competitionSelection?.position
      : needsSubOption ? !!subOption : true

  const aboutComplete =
    !!selectedInfluencer && !!requestType && !!clientType && (
      requestType === 'campaign'
        ? campaignSetup.postCount >= 2
        : (!!category && subOptionSatisfied)
    )

  const contentComplete =
    requestType === 'campaign'
      ? campaignPosts.length > 0 && campaignPosts.every(isPostComplete)
      : requestType === 'single'
        ? details.title.trim() !== '' && details.content.trim() !== ''
        : false

  const publishComplete = channels.length > 0

  const finishComplete = termsAccepted && privacyAccepted

  const sectionComplete = [aboutComplete, contentComplete, publishComplete, finishComplete]
  const canSubmit = sectionComplete.every(Boolean)

  // أول متطلب ناقص — يُعرض كتلميح فوق زر الإرسال
  const missingHint = (): string | null => {
    if (!selectedInfluencer) return 'اختر الحساب الذي تريد النشر معه'
    if (!requestType) return 'اختر نوع الطلب'
    if (!clientType) return 'اختر صفة مقدّم الطلب'
    if (requestType === 'single') {
      if (!category) return 'اختر فئة المحتوى'
      if (!subOptionSatisfied) return 'أكمل الخيار الفرعي للفئة'
      if (details.title.trim() === '' || details.content.trim() === '') return 'أكمل عنوان ونص المنشور'
    }
    if (requestType === 'campaign') {
      if (campaignSetup.postCount < 2) return 'حدّد عدد المنشورات'
      if (!campaignPosts.every(isPostComplete)) return 'أكمل تفاصيل جميع منشورات الحملة'
    }
    if (channels.length === 0) return 'اختر قناة نشر واحدة على الأقل'
    if (!termsAccepted || !privacyAccepted) return 'فعّل الموافقة على الشروط والخصوصية'
    return null
  }

  // ── الإرسال ─────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      let body: Record<string, unknown>

      if (requestType === 'campaign') {
        body = {
          request_type:     'campaign',
          influencer_id:    selectedInfluencer,
          client_type:      clientType,
          channels,
          selected_extras:  selectedExtras,
          client_name:      contact.fullName,
          client_phone:     contact.phone,
          client_email:     contact.email,
          client_city:      contact.city   || null,
          x_handle:         contact.xHandle || null,
          campaign_post_count: campaignSetup.postCount,
          campaign_duration:   campaignSetup.duration || null,
          campaign_posts: campaignPosts.map(p => ({
            category:       p.category,
            sub_option:     p.subOption
              ? (typeof p.subOption === 'object' ? JSON.stringify(p.subOption) : p.subOption)
              : null,
            title:          p.title,
            content:        p.content,
            preferred_date: p.preferredDate || null,
            images:         p.images,
            link:           p.link || null,
            hashtags:       p.hashtags || null,
          })),
        }
      } else {
        const subOptionData = isCompetitionCategory ? competitionSelection : subOption
        body = {
          request_type:    'single',
          influencer_id:   selectedInfluencer,
          client_type:     clientType,
          category,
          sub_option:      subOptionData,
          title:           details.title,
          content:         details.content,
          link:            details.link || null,
          hashtags:        details.hashtags || null,
          preferred_date:  details.preferredDate || null,
          content_images:  details.images,
          client_name:     contact.fullName,
          client_phone:    contact.phone,
          client_email:    contact.email,
          client_city:     contact.city   || null,
          x_handle:        contact.xHandle || null,
          channels,
          selected_extras: selectedExtras,
        }
      }

      const res = await fetch('/api/submit-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'حدث خطأ')

      setRequestNumber(data.requestNumber)
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* تجاهل */ }
      setSuccess(true)
      showToast('تم إرسال طلبك بنجاح!')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء إرسال الطلب'
      showToast(msg, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || catsLoading) return <LoadingSpinner size="lg" />
  if (success) return <SuccessScreen requestNumber={requestNumber} />

  const competitionPositions = competitionSelection?.subcategory
    ? getCompetitionPositions(competitionSelection.subcategory)
    : []

  // ── العرض ───────────────────────────────────────────────────────
  return (
    <div className="bg-cream min-h-screen pb-28">
      <div className="max-w-2xl mx-auto w-full px-4 pt-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl md:text-3xl font-black text-dark mb-1">📋 طلب نشر جديد</h1>
          <p className="text-sm text-muted">عبّئ النموذج دفعة واحدة — وبمجرد الإرسال يصلك العرض</p>
        </div>

        <div className="space-y-3">

          {/* ① عن الطلب ─────────────────────────────────────────── */}
          <FormSection
            index={1}
            title="عن الطلب"
            subtitle="الحساب ونوع الطلب وصفتك والفئة"
            complete={aboutComplete}
            open={openSection === 0}
            onToggle={() => setOpenSection(openSection === 0 ? -1 : 0)}
          >
            <div className="space-y-4">
              <div>
                <label className={fieldLabel}>الحساب الذي تنشر معه *</label>
                <select
                  value={selectedInfluencer ?? ''}
                  onChange={e => setSelectedInfluencer(e.target.value || null)}
                  className={selectCls}
                >
                  <option value="">— اختر الحساب —</option>
                  {influencers.map(inf => (
                    <option key={inf.id} value={inf.id}>{inf.name_ar}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={fieldLabel}>نوع الطلب *</label>
                <select
                  value={requestType ?? ''}
                  onChange={e => {
                    const v = (e.target.value || null) as RequestType | null
                    setRequestType(v)
                    if (v === 'campaign') {
                      setCategory(null); setSubOption(null); setCompetitionSelection(null)
                    }
                  }}
                  className={selectCls}
                >
                  <option value="">— اختر النوع —</option>
                  {REQUEST_TYPE_OPTIONS.map(o => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
                {requestType === 'campaign' && (
                  <p className="text-xs text-green-700 mt-1.5">🎉 الحملة المتعددة تمنحك خصماً على الإجمالي</p>
                )}
              </div>

              <div>
                <label className={fieldLabel}>صفة مقدّم الطلب *</label>
                <select
                  value={clientType ?? ''}
                  onChange={e => {
                    const v = (e.target.value || null) as ClientType | null
                    if (clientType !== v) {
                      setCategory(null)
                      setSubOption(null)
                      setCompetitionSelection(null)
                      setCampaignPosts(prev => prev.map(p => ({ ...p, category: '', subOption: null })))
                    }
                    setClientType(v)
                  }}
                  className={selectCls}
                >
                  <option value="">— اختر الصفة —</option>
                  {CLIENT_TYPE_OPTIONS.map(o => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* منشور واحد: الفئة + الخيار الفرعي */}
              {requestType === 'single' && (
                <>
                  <div>
                    <label className={fieldLabel}>فئة المحتوى *</label>
                    <select
                      value={category ?? ''}
                      onChange={e => {
                        setCategory(e.target.value || null)
                        setSubOption(null)
                        setCompetitionSelection(null)
                      }}
                      disabled={!clientType}
                      className={cn(selectCls, !clientType && 'opacity-50 cursor-not-allowed')}
                    >
                      <option value="">{clientType ? '— اختر الفئة —' : 'اختر صفتك أولاً'}</option>
                      {availableCategories.map(c => (
                        <option key={c.id} value={c.id}>{c.icon} {c.name_ar}</option>
                      ))}
                    </select>
                  </div>

                  {/* المسابقات: نوع المسابقة + المركز */}
                  {isCompetitionCategory && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-muted/5 rounded-xl p-3">
                      <div>
                        <label className={fieldLabel}>نوع المسابقة *</label>
                        <select
                          value={competitionSelection?.subcategory ?? ''}
                          onChange={e => setCompetitionSelection({ subcategory: e.target.value, position: '' })}
                          className={selectCls}
                        >
                          <option value="">— اختر النوع —</option>
                          {COMPETITION_SUBCATEGORIES.map(s => (
                            <option key={s.id} value={s.id}>{s.nameAr}</option>
                          ))}
                        </select>
                      </div>
                      {competitionSelection?.subcategory && (
                        <div>
                          <label className={fieldLabel}>المركز / الإنجاز *</label>
                          <select
                            value={competitionSelection?.position ?? ''}
                            onChange={e => setCompetitionSelection({
                              subcategory: competitionSelection!.subcategory,
                              position: e.target.value,
                            })}
                            className={selectCls}
                          >
                            <option value="">— اختر المركز —</option>
                            {competitionPositions.map(p => (
                              <option key={p.id} value={p.id}>{p.nameAr}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* فئات أخرى لها خيار فرعي (مثل الاختراعات) */}
                  {!isCompetitionCategory && needsSubOption && selectedCat?.sub_options && (
                    <div>
                      <label className={fieldLabel}>{selectedCat.sub_option_title ?? 'الخيار الفرعي'} *</label>
                      <select
                        value={subOption ?? ''}
                        onChange={e => setSubOption(e.target.value || null)}
                        className={selectCls}
                      >
                        <option value="">— اختر —</option>
                        {selectedCat.sub_options.map(opt => (
                          <option key={opt.id} value={opt.id}>{opt.icon} {opt.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              {/* حملة: عدد المنشورات + المدة */}
              {requestType === 'campaign' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={fieldLabel}>عدد المنشورات *</label>
                    <select
                      value={campaignSetup.postCount}
                      onChange={e => setCampaignSetup({ ...campaignSetup, postCount: Number(e.target.value) })}
                      className={selectCls}
                    >
                      {Array.from({ length: 9 }, (_, i) => i + 2).map(n => (
                        <option key={n} value={n}>{n} منشورات</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={fieldLabel}>مدة الحملة (اختياري)</label>
                    <select
                      value={campaignSetup.duration}
                      onChange={e => setCampaignSetup({ ...campaignSetup, duration: e.target.value })}
                      className={selectCls}
                    >
                      <option value="">— غير محدّدة —</option>
                      {DURATION_OPTIONS.map(d => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button size="sm" onClick={() => setOpenSection(1)} disabled={!aboutComplete}>
                  التالي ←
                </Button>
              </div>
            </div>
          </FormSection>

          {/* ② تفاصيل المحتوى ───────────────────────────────────── */}
          <FormSection
            index={2}
            title="تفاصيل المحتوى"
            subtitle={requestType === 'campaign' ? 'منشورات الحملة' : 'عنوان ونص المنشور'}
            complete={contentComplete}
            open={openSection === 1}
            onToggle={() => setOpenSection(openSection === 1 ? -1 : 1)}
          >
            {!requestType ? (
              <p className="text-sm text-muted text-center py-4">اختر نوع الطلب في القسم السابق أولاً</p>
            ) : requestType === 'campaign' ? (
              <RStepCampaignPosts
                posts={campaignPosts}
                onChange={setCampaignPosts}
                clientType={clientType}
                categories={categories}
              />
            ) : (
              <RStep3Details data={details} onChange={setDetails} />
            )}

            <div className="flex justify-end pt-4">
              <Button size="sm" onClick={() => setOpenSection(2)} disabled={!contentComplete}>
                التالي ←
              </Button>
            </div>
          </FormSection>

          {/* ③ النشر والإضافات ──────────────────────────────────── */}
          <FormSection
            index={3}
            title="النشر والإضافات"
            subtitle="القنوات والخدمات الإضافية"
            complete={publishComplete}
            open={openSection === 2}
            onToggle={() => setOpenSection(openSection === 2 ? -1 : 2)}
          >
            <div className="space-y-6">
              {selectedInf ? (
                <RStepChannels
                  influencer={selectedInf}
                  selected={channels}
                  onToggle={(id) => setChannels(prev =>
                    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                  )}
                />
              ) : (
                <p className="text-sm text-muted text-center py-4">اختر الحساب في القسم الأول أولاً</p>
              )}

              <div>
                <h3 className="font-bold text-dark text-sm mb-1">خدمات إضافية (اختياري)</h3>
                <p className="text-xs text-muted mb-3">اختر ما يناسبك — يمكنك تجاوز هذا القسم</p>
                <div className="grid grid-cols-2 gap-3">
                  {AQ_EXTRAS_LIST.map(id => {
                    const isSel = selectedExtras.includes(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleExtra(id)}
                        className={cn(
                          'relative text-right p-3 rounded-xl border-2 transition-all',
                          isSel ? 'border-green bg-green/5' : 'border-border bg-card hover:border-green/40',
                        )}
                      >
                        <div className={cn(
                          'absolute top-2 left-2 w-5 h-5 rounded-md border-2 flex items-center justify-center',
                          isSel ? 'bg-green border-green' : 'border-border',
                        )}>
                          {isSel && <span className="text-white text-xs leading-none">✓</span>}
                        </div>
                        <div className="text-xl mb-1">{AQ_EXTRAS_ICONS[id]}</div>
                        <div className="text-sm font-semibold text-dark leading-tight pl-5">
                          {AQ_EXTRAS_NAMES[id]}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex justify-end">
                <Button size="sm" onClick={() => setOpenSection(3)} disabled={!publishComplete}>
                  التالي ←
                </Button>
              </div>
            </div>
          </FormSection>

          {/* ④ الموافقة على الشروط ──────────────────────────────── */}
          <FormSection
            index={4}
            title="الموافقة على الشروط"
            subtitle="اقرأ الشروط والأحكام ووافق عليها"
            complete={finishComplete}
            open={openSection === 3}
            onToggle={() => setOpenSection(openSection === 3 ? -1 : 3)}
          >
            <div className="space-y-6">
              <RStep6Terms
                termsAccepted={termsAccepted}
                privacyAccepted={privacyAccepted}
                onTermsChange={setTermsAccepted}
                onPrivacyChange={setPrivacyAccepted}
              />

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
                <div className="text-2xl mb-2">📧</div>
                <p className="font-bold text-blue-700 text-sm">
                  بمجرد إرسالك سيصلك عرضك خلال دقائق
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  مُحتسَب خصيصاً بحسب طبيعة خبرك — ولا يوجد أي التزام مالي قبل موافقتك
                </p>
              </div>
            </div>
          </FormSection>

        </div>
      </div>

      {/* شريط الإرسال الثابت */}
      <div className="fixed bottom-0 inset-x-0 bg-card/95 backdrop-blur-md border-t border-border px-4 py-3">
        <div className="max-w-2xl mx-auto">
          {!canSubmit && missingHint() && (
            <p className="text-xs text-muted text-center mb-2">⬑ {missingHint()}</p>
          )}
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            loading={submitting}
            className="w-full"
          >
            {submitting ? 'جارٍ إرسال طلبك...' : 'إرسال الطلب والحصول على العرض'}
          </Button>
        </div>
      </div>
    </div>
  )
}

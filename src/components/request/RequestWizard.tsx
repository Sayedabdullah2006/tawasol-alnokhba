'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useCategories, type DBCategory } from '@/lib/hooks'
import { useToast } from '@/components/ui/Toast'
import WizardProgress from '@/components/pricing/WizardProgress'
import WizardFooter from '@/components/pricing/WizardFooter'
import StepInfluencer, { type Influencer } from '@/components/pricing/StepInfluencer'
import RStepRequestType, { type RequestType } from './RStepRequestType'
import RStep1ClientType, { type ClientType } from './RStep1ClientType'
import Step1Category from '@/components/pricing/Step1Category'
import StepSubOption from '@/components/pricing/StepSubOption'
import RStep3Details from './RStep3Details'
import RStepChannels from './RStepChannels'
import RStepExtras from './RStepExtras'
import RStep5Contact, { type ContactData } from './RStep5Contact'
import RStep6Terms from './RStep6Terms'
import StepCompetition from '@/components/pricing/StepCompetition'
import RStepCampaignSetup, { type CampaignSetup } from './RStepCampaignSetup'
import RStepCampaignPosts, { type CampaignPostData, makeEmptyPost, isPostComplete } from './RStepCampaignPosts'
import { validateEmail } from '@/lib/email-validation'
import MicroAffirmation from './MicroAffirmation'
import SuccessScreen from './SuccessScreen'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import { calculateAutoQuote, calculateCampaignQuote, CAMPAIGN_DISCOUNT_PCT } from '@/lib/auto-quote'
import { formatNumber } from '@/lib/utils'
import { CATEGORIES } from '@/lib/constants'

type StepId =
  | 'influencer'
  | 'requestType'
  | 'clientType'
  | 'category'
  | 'subOption'
  | 'details'
  | 'channels'
  | 'extras'
  | 'contact'
  | 'terms'
  | 'confirm'
  | 'campaignSetup'
  | 'campaignPosts'

const CHANNEL_LABELS: Record<string, string> = {
  x: 'X',
  ig: 'Instagram',
  li: 'LinkedIn',
  tk: 'TikTok',
}

const DURATION_LABELS: Record<string, string> = {
  week_1:  'أسبوع',
  week_2:  'أسبوعان',
  month_1: 'شهر',
  month_2: 'شهران',
  month_3: '3 أشهر',
  month_6: '6 أشهر',
  open:    'مفتوح',
}

// رسائل تشجيع قصيرة تظهر بمجرد اكتمال الخطوة بشكل صحيح
const STEP_AFFIRMATIONS: Partial<Record<StepId, string>> = {
  influencer:    'اختيار موفّق 👌',
  requestType:   'تمام، نكمل 🚀',
  clientType:    'وضحت لنا الصورة ✨',
  category:      'فئة واضحة 🎯',
  subOption:     'اختيار دقيق 👍',
  details:       'محتوى جاهز للنشر ✍️',
  channels:      'قنوات موفّقة 📡',
  campaignSetup: 'حملة قوية 🚀',
  campaignPosts: 'منشورات مكتملة ✅',
}

// مفتاح حفظ المسودة محلياً + مدة صلاحيتها (7 أيام)
const DRAFT_KEY = 'tn_request_draft_v1'
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export default function RequestWizard() {
  const { showToast } = useToast()
  const { categories, loading: catsLoading } = useCategories()
  const [stepIndex, setStepIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [requestNumber, setRequestNumber] = useState('')
  const [quotedTotal, setQuotedTotal] = useState(0)
  const [influencers, setInfluencers] = useState<Influencer[]>([])
  const [loading, setLoading] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const draftRestored = useRef(false)

  // ── Step data ──────────────────────────────────────────────────
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

  // ── Discount code state ────────────────────────────────────────
  const [discountInput, setDiscountInput]   = useState('')
  const [validatingCode, setValidatingCode] = useState(false)
  const [discountError, setDiscountError]   = useState('')
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string; pct: number; occasion: string | null
  } | null>(null)

  const handleApplyDiscount = async () => {
    if (!discountInput.trim()) return
    setValidatingCode(true)
    setDiscountError('')
    setAppliedDiscount(null)
    const res = await fetch('/api/validate-discount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: discountInput.trim() }),
    })
    const data = await res.json()
    if (data.valid) {
      setAppliedDiscount({ code: data.code, pct: data.discount_pct, occasion: data.occasion })
      setDiscountError('')
    } else {
      setDiscountError(data.error ?? 'الكود غير صحيح')
    }
    setValidatingCode(false)
  }

  // ── Campaign-specific state ────────────────────────────────────
  const [campaignSetup, setCampaignSetup] = useState<CampaignSetup>({ postCount: 2, duration: '' })
  const [campaignPosts, setCampaignPosts] = useState<CampaignPostData[]>([makeEmptyPost(), makeEmptyPost()])

  // Sync post array length when postCount changes
  useEffect(() => {
    setCampaignPosts(prev => {
      const n = campaignSetup.postCount
      if (prev.length === n) return prev
      if (prev.length < n) return [...prev, ...Array.from({ length: n - prev.length }, makeEmptyPost)]
      return prev.slice(0, n)
    })
  }, [campaignSetup.postCount])

  const selectedCat: DBCategory | null = categories.find(c => c.id === category) ?? null
  const needsSubOption = selectedCat?.has_sub_option && selectedCat?.sub_options?.length
  const isCompetitionCategory = category === 'competitions'

  // ── Price calculation ──────────────────────────────────────────
  const singlePriceCalc = useMemo(() => {
    if (!category || requestType !== 'single') return null
    return calculateAutoQuote({
      category,
      subOption: isCompetitionCategory ? competitionSelection : subOption,
      clientType,
      selectedExtras,
      channelCount: channels.length,
    })
  }, [category, subOption, competitionSelection, clientType, selectedExtras, isCompetitionCategory, requestType, channels])

  const campaignPriceCalc = useMemo(() => {
    if (requestType !== 'campaign') return null
    return calculateCampaignQuote(
      campaignPosts.map(p => ({ category: p.category, subOption: p.subOption, clientType })),
      selectedExtras,
      CAMPAIGN_DISCOUNT_PCT,
      channels.length,
    )
  }, [campaignPosts, clientType, selectedExtras, requestType, channels])

  const priceCalc = requestType === 'campaign' ? null : singlePriceCalc

  // تقدير حيّ يظهر مبكراً بمجرد توفّر معطيات كافية لاحتساب السعر
  const liveEstimate = requestType === 'campaign'
    ? (campaignPriceCalc?.total ?? 0)
    : (priceCalc?.total ?? 0)

  // ── اكتمال بيانات التواصل ───────────────────────────────────────
  // المستخدم مسجّل دخول دائماً (محمي عبر proxy.ts). إن كان بروفايله مكتملاً
  // نتخطّى خطوة التواصل تلقائياً؛ وإلا نعرضها لاستكمال الناقص.
  const contactComplete =
    isLoggedIn &&
    contact.fullName.trim() !== '' &&
    contact.phone.trim() !== '' &&
    validateEmail(contact.email).valid

  // ── Steps ──────────────────────────────────────────────────────
  const steps: StepId[] = useMemo(() => {
    if (requestType === 'campaign') {
      return [
        'influencer', 'requestType', 'clientType', 'campaignSetup', 'campaignPosts',
        'channels', 'extras', ...(contactComplete ? [] : ['contact'] as StepId[]), 'terms', 'confirm',
      ]
    }
    const base: StepId[] = ['influencer', 'requestType', 'clientType', 'category']
    if (isCompetitionCategory || needsSubOption) base.push('subOption')
    base.push('details', 'channels', 'extras')
    if (!contactComplete) base.push('contact')
    base.push('terms', 'confirm')
    return base
  }, [requestType, isCompetitionCategory, needsSubOption, contactComplete])

  const totalSteps   = steps.length

  // ضمان بقاء المؤشر ضمن النطاق إذا تغيّر مسار الخطوات (مثلاً بعد استرجاع مسودة)
  useEffect(() => {
    if (stepIndex > totalSteps - 1) setStepIndex(totalSteps - 1)
  }, [totalSteps, stepIndex])

  const currentStep  = steps[stepIndex]

  // ── Load data ──────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    supabase.from('influencers').select('*').eq('is_active', true).then(({ data }) => {
      setInfluencers((data as Influencer[]) ?? [])
      setLoading(false)
    })
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setIsLoggedIn(true)
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
          if (typeof d.stepIndex === 'number') setStepIndex(d.stepIndex)
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
        campaignSetup, campaignPosts, stepIndex,
      }))
    } catch { /* تجاوز سعة التخزين — نتجاهل بهدوء */ }
  }, [
    hydrated, selectedInfluencer, requestType, clientType, category, subOption,
    competitionSelection, details, channels, selectedExtras, contact,
    campaignSetup, campaignPosts, stepIndex,
  ])

  const selectedInf = influencers.find(i => i.id === selectedInfluencer) ?? null

  // ── Validation ─────────────────────────────────────────────────
  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'influencer':    return selectedInfluencer !== null
      case 'requestType':   return requestType !== null
      case 'clientType':    return clientType !== null
      case 'category':      return category !== null
      case 'subOption':
        if (isCompetitionCategory) {
          return competitionSelection !== null &&
                 competitionSelection.subcategory !== '' &&
                 competitionSelection.position !== ''
        }
        return subOption !== null
      case 'details':       return details.title.trim() !== '' && details.content.trim() !== ''
      case 'channels':      return channels.length > 0
      case 'extras':        return true
      case 'contact':
        return contact.fullName.trim() !== ''
          && contact.phone.trim() !== ''
          && validateEmail(contact.email).valid
      case 'terms':         return termsAccepted && privacyAccepted
      case 'confirm':       return true
      case 'campaignSetup': return campaignSetup.postCount >= 2
      case 'campaignPosts': return campaignPosts.every(isPostComplete)
      default:              return true
    }
  }

  const goNext = () => { if (stepIndex < totalSteps - 1) setStepIndex(stepIndex + 1) }
  const goBack = () => { if (stepIndex > 0) setStepIndex(stepIndex - 1) }

  // ── Submit ─────────────────────────────────────────────────────
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
          discount_code:    appliedDiscount?.code ?? null,
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
          discount_code:   appliedDiscount?.code ?? null,
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
      setQuotedTotal(data.quotedTotal ?? 0)
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* تجاهل */ }
      setSuccess(true)
      showToast('تم إرسال طلبك وعرض السعر بنجاح!')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء إرسال الطلب'
      showToast(msg, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || catsLoading) return <LoadingSpinner size="lg" />
  if (success) return <SuccessScreen requestNumber={requestNumber} quotedTotal={quotedTotal} />

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-cream">
      <div className="max-w-3xl mx-auto w-full px-4 pt-6 flex-1 flex flex-col">
        <WizardProgress current={stepIndex + 1} total={totalSteps} />

        {liveEstimate > 0 && currentStep !== 'confirm' && (
          <div className="flex justify-center -mt-3 mb-1">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green bg-green/5 border border-green/20 rounded-full px-3 py-1 wizard-enter">
              💰 تقدير حالي: {formatNumber(liveEstimate)} ر.س
            </span>
          </div>
        )}

        <div className="flex-1 py-4">

          {currentStep === 'influencer' && (
            <StepInfluencer influencers={influencers} selected={selectedInfluencer} onSelect={setSelectedInfluencer} />
          )}

          {currentStep === 'requestType' && (
            <RStepRequestType
              selected={requestType}
              onSelect={(v) => {
                setRequestType(v)
                // reset single-post fields when switching type
                if (v === 'campaign') {
                  setCategory(null); setSubOption(null); setCompetitionSelection(null)
                }
              }}
            />
          )}

          {currentStep === 'clientType' && (
            <RStep1ClientType
              selected={clientType}
              onSelect={(v) => {
                if (clientType !== v) {
                  setCategory(null)
                  setSubOption(null)
                  // إعادة تعيين تصنيفات منشورات الحملة عند تغيير نوع العميل
                  setCampaignPosts(prev => prev.map(p => ({ ...p, category: '', subOption: null })))
                }
                setClientType(v)
              }}
            />
          )}

          {currentStep === 'category' && (
            <Step1Category
              selected={category}
              onSelect={(id) => { setCategory(id); setSubOption(null); setCompetitionSelection(null) }}
              categories={categories}
              clientType={clientType}
            />
          )}

          {currentStep === 'subOption' && (
            <>
              {isCompetitionCategory ? (
                <StepCompetition selected={competitionSelection} onSelect={setCompetitionSelection} />
              ) : selectedCat ? (
                <StepSubOption category={selectedCat} selected={subOption} onSelect={setSubOption} />
              ) : null}
            </>
          )}

          {currentStep === 'details' && (
            <RStep3Details data={details} onChange={setDetails} />
          )}

          {currentStep === 'campaignSetup' && (
            <RStepCampaignSetup data={campaignSetup} onChange={setCampaignSetup} />
          )}

          {currentStep === 'campaignPosts' && (
            <RStepCampaignPosts
              posts={campaignPosts}
              onChange={setCampaignPosts}
              clientType={clientType}
              categories={categories}
            />
          )}

          {currentStep === 'channels' && (
            <RStepChannels
              influencer={selectedInf}
              selected={channels}
              onToggle={(id) => setChannels(prev =>
                prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
              )}
            />
          )}

          {currentStep === 'extras' && (
            <RStepExtras
              selected={selectedExtras}
              onChange={setSelectedExtras}
              basePrice={
                requestType === 'campaign'
                  ? (campaignPriceCalc?.afterDiscount ?? 0)
                  : (priceCalc?.basePrice ?? 0)
              }
              baseLabel={
                requestType === 'campaign'
                  ? `إجمالي الحملة (بعد خصم ${CAMPAIGN_DISCOUNT_PCT}%)`
                  : undefined
              }
            />
          )}

          {currentStep === 'contact' && (
            <RStep5Contact data={contact} onChange={setContact} />
          )}

          {currentStep === 'terms' && (
            <RStep6Terms
              termsAccepted={termsAccepted}
              privacyAccepted={privacyAccepted}
              onTermsChange={setTermsAccepted}
              onPrivacyChange={setPrivacyAccepted}
            />
          )}

          {/* ── Confirm ─────────────────────────────────────────── */}
          {currentStep === 'confirm' && (() => {
            const rawTotal = requestType === 'campaign'
              ? (campaignPriceCalc?.total ?? 0)
              : (priceCalc?.total ?? 0)
            const discountAmount = appliedDiscount ? Math.round(rawTotal * appliedDiscount.pct / 100) : 0
            const discountedTotal = rawTotal - discountAmount
            return (
            <div className="wizard-enter max-w-lg mx-auto space-y-5">
              <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-1">
                كل شي تمام؟
              </h2>
              <p className="text-sm text-muted text-center">
                راجع ملخص طلبك — وبمجرد الإرسال يصلك عرض السعر فوراً
              </p>

              {/* ملخص الطلب */}
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="p-5 space-y-3 text-sm">
                  {selectedInf && (
                    <div className="flex justify-between">
                      <span className="text-muted">المؤثر</span>
                      <span className="font-medium">{selectedInf.name_ar}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted">نوع الطلب</span>
                    <span className="font-medium">
                      {requestType === 'campaign' ? `🚀 حملة (${campaignSetup.postCount} منشورات)` : '📄 منشور واحد'}
                    </span>
                  </div>
                  {requestType === 'single' && category && (
                    <div className="flex justify-between">
                      <span className="text-muted">الفئة</span>
                      <span className="font-medium">
                        {CATEGORIES.find(c => c.id === category)?.nameAr ?? category}
                      </span>
                    </div>
                  )}
                  {requestType === 'campaign' && campaignSetup.duration && (
                    <div className="flex justify-between">
                      <span className="text-muted">مدة الحملة</span>
                      <span className="font-medium">{DURATION_LABELS[campaignSetup.duration] ?? campaignSetup.duration}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted">القنوات</span>
                    <span className="font-medium">{channels.map(c => CHANNEL_LABELS[c] ?? c).join('، ')}</span>
                  </div>
                  {contact.email.trim() && (
                    <div className="flex justify-between">
                      <span className="text-muted">يصلك العرض على</span>
                      <span className="font-medium" dir="ltr">{contact.email}</span>
                    </div>
                  )}
                  {requestType === 'single' && (
                    <div className="border-t border-border pt-3">
                      <div className="flex justify-between">
                        <span className="text-muted">عنوان الخبر</span>
                        <span className="font-medium text-right max-w-[200px] truncate">{details.title}</span>
                      </div>
                    </div>
                  )}
                  {requestType === 'campaign' && (
                    <div className="border-t border-border pt-3 space-y-1">
                      {campaignPosts.map((p, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-muted">منشور {i + 1}</span>
                          <span className="font-medium truncate max-w-[180px]">{p.title || '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* تفاصيل السعر */}
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="bg-green/5 border-b border-border px-5 py-3">
                  <p className="font-bold text-dark text-sm">💰 تفاصيل العرض</p>
                </div>
                <div className="p-5 space-y-2 text-sm">
                  {requestType === 'campaign' && campaignPriceCalc ? (
                    <>
                      <div className="flex justify-between text-muted">
                        <span>مجموع المنشورات ({campaignSetup.postCount})</span>
                        <span>{formatNumber(campaignPriceCalc.singleChannelSubtotal)} ر.س</span>
                      </div>
                      {campaignPriceCalc.channelSurcharge > 0 && (
                        <div className="flex justify-between text-muted">
                          <span>قنوات إضافية ({campaignPriceCalc.channelCount} قنوات)</span>
                          <span>+{formatNumber(campaignPriceCalc.channelSurcharge)} ر.س</span>
                        </div>
                      )}
                      <div className="flex justify-between text-green font-semibold">
                        <span>خصم الحملة ({CAMPAIGN_DISCOUNT_PCT}%)</span>
                        <span>− {formatNumber(campaignPriceCalc.discountAmount)} ر.س</span>
                      </div>
                      {campaignPriceCalc.extrasBreakdown.map(e => (
                        <div key={e.id} className="flex justify-between text-muted">
                          <span>{e.name}</span>
                          <span>+{formatNumber(e.price)} ر.س</span>
                        </div>
                      ))}
                    </>
                  ) : priceCalc ? (
                    <>
                      <div className="flex justify-between text-muted">
                        <span>السعر الأساسي</span>
                        <span>{formatNumber(priceCalc.singleChannelBase)} ر.س</span>
                      </div>
                      {priceCalc.channelSurcharge > 0 && (
                        <div className="flex justify-between text-muted">
                          <span>قنوات إضافية ({priceCalc.channelCount} قنوات)</span>
                          <span>+{formatNumber(priceCalc.channelSurcharge)} ر.س</span>
                        </div>
                      )}
                      {priceCalc.extrasBreakdown.map(e => (
                        <div key={e.id} className="flex justify-between text-muted">
                          <span>{e.name}</span>
                          <span>+{formatNumber(e.price)} ر.س</span>
                        </div>
                      ))}
                    </>
                  ) : null}

                  {appliedDiscount && (
                    <div className="flex justify-between text-green font-semibold">
                      <span>كود خصم {appliedDiscount.occasion ? `(${appliedDiscount.occasion})` : ''} − {appliedDiscount.pct}%</span>
                      <span>− {formatNumber(discountAmount)} ر.س</span>
                    </div>
                  )}

                  <div className="flex justify-between font-black text-dark text-lg border-t border-border pt-3 mt-1">
                    <span>الإجمالي</span>
                    <span className="text-green">{formatNumber(discountedTotal)} ر.س</span>
                  </div>
                </div>
              </div>

              {/* كود الخصم */}
              <div className="bg-card rounded-2xl border border-border p-4">
                {appliedDiscount ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-green text-lg">✅</span>
                      <div>
                        <p className="text-sm font-bold text-dark">
                          كود <span className="font-mono">{appliedDiscount.code}</span> — خصم {appliedDiscount.pct}%
                        </p>
                        {appliedDiscount.occasion && (
                          <p className="text-xs text-muted">{appliedDiscount.occasion}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => { setAppliedDiscount(null); setDiscountInput(''); setDiscountError('') }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      إزالة
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-dark mb-2">🏷️ لديك كود خصم؟</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={discountInput}
                        onChange={e => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError('') }}
                        onKeyDown={e => e.key === 'Enter' && handleApplyDiscount()}
                        placeholder="أدخل الكود هنا"
                        className="flex-1 px-3 py-2 rounded-xl border border-border text-sm font-mono bg-white"
                        maxLength={20}
                      />
                      <button
                        onClick={handleApplyDiscount}
                        disabled={validatingCode || !discountInput.trim()}
                        className="px-4 py-2 rounded-xl bg-green text-white text-sm font-bold disabled:opacity-50 transition-opacity"
                      >
                        {validatingCode ? '...' : 'تطبيق'}
                      </button>
                    </div>
                    {discountError && (
                      <p className="text-xs text-red-500 mt-1.5">{discountError}</p>
                    )}
                  </div>
                )}
              </div>

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
            )
          })()}

          {STEP_AFFIRMATIONS[currentStep] && (
            <MicroAffirmation show={canProceed()} text={STEP_AFFIRMATIONS[currentStep]!} />
          )}
        </div>

        {/* Footer */}
        {currentStep !== 'confirm' ? (
          <WizardFooter
            onNext={goNext}
            onBack={stepIndex > 0 ? goBack : undefined}
            showBack={stepIndex > 0}
            nextDisabled={!canProceed()}
          />
        ) : (
          <div className="sticky bottom-0 bg-card/95 backdrop-blur-md border-t border-border px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" onClick={goBack}>→ رجوع</Button>
            <div className="flex-1" />
            <Button onClick={handleSubmit} disabled={submitting} loading={submitting}>
              {submitting ? 'جارٍ إرسال طلبك...' : 'إرسال الطلب والحصول على العرض'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

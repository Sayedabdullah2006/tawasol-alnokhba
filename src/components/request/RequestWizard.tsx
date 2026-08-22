'use client'

import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useCategories, useSiteContent, type DBCategory, type SiteContent } from '@/lib/hooks'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import type { Influencer } from '@/components/pricing/StepInfluencer'
import type { RequestType } from './RStepRequestType'
import type { ClientType } from './RStep1ClientType'
import type { CampaignSetup } from './RStepCampaignSetup'
import RStep3Details, { type ContentDetails } from './RStep3Details'
import RStepExtras from './RStepExtras'
import { type ContactData } from './RStep5Contact'
import { TERMS_TEXT } from './RStep6Terms'
import RStepCampaignPosts, { type CampaignPostData, makeEmptyPost, isPostComplete } from './RStepCampaignPosts'
import SuccessScreen from './SuccessScreen'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import RequestManageActions from '@/components/dashboard/RequestManageActions'
import { getStatusLabel } from '@/lib/status-labels'
import { COMPETITION_SUBCATEGORIES, getCompetitionPositions, getPackageFeaturesForPostPrice, ORDERABLE_PACKAGES, CATEGORY_CONDITIONS, type RequestStatus } from '@/lib/constants'
import { AQ_EXTRAS_PRICES, calculateAutoQuote } from '@/lib/auto-quote'
import MembershipTeaser from '@/components/memberships/MembershipTeaser'
import MembershipBenefitPicker, { type MembershipBenefitWallet } from '@/components/memberships/MembershipBenefitPicker'
import RequestReviewsTrust from './RequestReviewsTrust'
import {
  membershipBenefitSelectionLabel,
  type MembershipBenefitSelection,
  type MembershipBenefitType,
} from '@/lib/memberships'

// القيم الافتراضية لمحتوى الموقع (تُستخدم حتى يصل المحتوى المعدَّل من القاعدة)
// الشروط العامة محذوفة — يُكتفى بشروط القبول بحسب الفئة.
const SITE_CONTENT_FALLBACK: SiteContent = {
  terms_text: TERMS_TEXT,
  news_conditions_general: [],
  news_conditions_footer: '',
  category_conditions: CATEGORY_CONDITIONS,
}

// ─── خيارات القوائم المنسدلة ───────────────────────────────────────
const REQUEST_TYPE_OPTIONS: { id: RequestType; icon: string; label: string; desc: string }[] = [
  { id: 'single',   icon: '📄', label: 'منشور واحد',   desc: 'خبر واحد يُنشر مرة' },
  { id: 'campaign', icon: '🚀', label: 'حملة متعددة',  desc: 'عدة منشورات بخصم' },
]

const CLIENT_TYPE_OPTIONS: { id: ClientType; icon: string; label: string }[] = [
  { id: 'individual', icon: '👤', label: 'فرد' },
  { id: 'business',   icon: '🏢', label: 'شركة / مؤسسة' },
  { id: 'government', icon: '🏛️', label: 'جهة حكومية' },
]

// تسميات قنوات النشر (لاختيار قناة الباقة الأساسية)
const CHANNEL_LABELS: Record<string, string> = {
  x: 'X (تويتر)', ig: 'Instagram', li: 'LinkedIn', tk: 'TikTok',
}

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
const RECOVERY_TOKEN_KEY = 'tn_request_recovery_token_v1'
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

type RecoveryOffer = {
  code: string
  discountPct: number
  maxDiscountAmount: number
  expiresAt: string
}

type PendingQuote = Record<string, unknown> & {
  id: string
  status: RequestStatus
}

type MembershipCreditWallet = {
  total_credits: number
  reserved_credits: number
  used_credits: number
}

type MembershipDetailsResponse = {
  membership?: { plan_id?: string | null } | null
  wallet?: MembershipCreditWallet | null
  benefitWallets?: MembershipBenefitWallet[]
}

function resizeCampaignPosts(posts: CampaignPostData[], postCount: number): CampaignPostData[] {
  if (posts.length === postCount) return posts
  if (posts.length < postCount) {
    return [...posts, ...Array.from({ length: postCount - posts.length }, makeEmptyPost)]
  }
  return posts.slice(0, postCount)
}

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
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const membershipId = searchParams.get('membership')
  const resumeTokenParam = searchParams.get('resume')
  const membershipMode = !!membershipId
  const membershipPortalMode = membershipMode && pathname.startsWith('/dashboard/membership/request')
  const { showToast } = useToast()
  const { categories, loading: catsLoading } = useCategories()
  // محتوى الموقع القابل للتعديل من لوحة الأدمن (الشروط + شروط قبول الخبر)
  const siteContent = useSiteContent(SITE_CONTENT_FALLBACK)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [requestNumber, setRequestNumber] = useState('')
  const [membershipResult, setMembershipResult] = useState<{ membershipBalance: number | null; benefitBalances: { type: MembershipBenefitType; remaining: number }[] } | null>(null)
  const [influencers, setInfluencers] = useState<Influencer[]>([])
  const [loading, setLoading] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null)
  const [recoveryOffer, setRecoveryOffer] = useState<RecoveryOffer | null>(null)
  // طلب قائم (قبل الدفع/الاكتمال) — يمنع تقديم طلب جديد. نحمل الصف كاملاً لإتاحة التعديل/الإلغاء.
  const [pendingQuote, setPendingQuote] = useState<PendingQuote | null>(null)
  const [membershipBenefits, setMembershipBenefits] = useState<MembershipBenefitWallet[]>([])
  const [membershipWallet, setMembershipWallet] = useState<MembershipCreditWallet | null>(null)
  const [membershipPlanId, setMembershipPlanId] = useState<string | null>(null)
  const [selectedMembershipBenefits, setSelectedMembershipBenefits] = useState<MembershipBenefitSelection[]>([])

  useEffect(() => {
    if (!membershipId) return
    fetch(`/api/memberships/${membershipId}`).then(async response => {
      if (!response.ok) return
      const data = await response.json().catch(() => ({})) as MembershipDetailsResponse
      const planId = typeof data.membership?.plan_id === 'string' ? data.membership.plan_id : null
      setMembershipPlanId(planId)
      setMembershipWallet(data.wallet ?? null)
      setMembershipBenefits(Array.isArray(data.benefitWallets) ? data.benefitWallets : [])
    }).catch(() => undefined)
  }, [membershipId])

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
  const [details, setDetails] = useState<ContentDetails>({
    title: '', content: '', link: '', hashtags: '', preferredDate: '', images: [], supportingDocuments: [],
  })
  const [selectedExtras, setSelectedExtras] = useState<string[]>([])
  const [discountCode, setDiscountCode] = useState('')
  const [contact, setContact]           = useState<ContactData>({ fullName: '', phone: '', email: '', city: '', xHandle: '' })
  const [isLoggedIn, setIsLoggedIn]     = useState(false)
  const [orgInfo, setOrgInfo]           = useState({ name: '', representative: '', license: '' })
  // الموافقة على الشروط ضمنية بالضغط على «إرسال الطلب» — مع رابط لعرضها في نافذة منبثقة
  const [showTerms, setShowTerms] = useState(false)
  // الباقة المختارة (للأفراد + المنشور الواحد فقط)
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null)
  // قناة النشر للباقة الأساسية (قناة واحدة يحددها المستخدم)
  const [basicChannel, setBasicChannel] = useState<string | null>(null)

  // ── بيانات الحملة ──────────────────────────────────────────────
  const [campaignSetup, setCampaignSetup] = useState<CampaignSetup>({ postCount: 2, duration: '' })
  const [campaignPosts, setCampaignPosts] = useState<CampaignPostData[]>([makeEmptyPost(), makeEmptyPost()])

  // مزامنة طول مصفوفة المنشورات مع عدد المنشورات
  const selectedCat: DBCategory | null = categories.find(c => c.id === category) ?? null
  const needsSubOption = !!(selectedCat?.has_sub_option && selectedCat?.sub_options?.length)
  const isCompetitionCategory = category === 'competitions'
  // الوكالة ترى نفس فئات الأفراد (كل أنواع الأخبار)
  const membershipClientType: ClientType | null = membershipPlanId
    ? membershipPlanId === 'corporate' ? 'business' : 'individual'
    : null
  const effectiveClientType = membershipMode
    ? membershipClientType
    : clientType === 'agency' ? 'individual' : clientType
  const availableCategories = effectiveClientType
    ? categories.filter(c => !c.client_types || c.client_types.includes(effectiveClientType))
    : categories
  const selectedInf = influencers.find(i => i.id === selectedInfluencer) ?? null

  // قنوات الحساب المتاحة (لاختيار قناة الباقة الأساسية)
  const availableChannels = useMemo(() => selectedInf
    ? [
        selectedInf.x_followers  ? 'x'  : null,
        selectedInf.ig_followers ? 'ig' : null,
        selectedInf.li_followers ? 'li' : null,
        selectedInf.tk_followers ? 'tk' : null,
      ].filter((channel): channel is string => channel !== null)
    : [], [selectedInf])
  const channels = availableChannels

  // ── تحميل البيانات ──────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    supabase.from('influencers').select('*').eq('is_active', true).then(({ data }) => {
      const list = (data as Influencer[]) ?? []
      setInfluencers(list)
      // حساب النشر مثبّت تلقائياً على الحساب النشط الوحيد (أول سعودي) — لا يُختار يدوياً
      if (list.length > 0) setSelectedInfluencer(prev => prev ?? list[0].id!)
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
        // فحص وجود طلب قائم (أي حالة تمنع طلباً جديداً) — لعرض خيارات المراجعة/التعديل/الإلغاء
        supabase
          .from('publish_requests')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['pending', 'quoted', 'negotiation', 'approved', 'payment_review', 'info_requested'])
          .order('created_at', { ascending: false })
          .limit(1)
          .then(({ data }) => {
            if (data && data.length > 0) setPendingQuote(data[0] as PendingQuote)
          })
      }
    })
  }, [])

  // ── استرجاع مسودة غير مكتملة (مرة واحدة عند الفتح) ──────────────
  useEffect(() => {
    let cancelled = false
    const restoreDraft = () => {
      if (cancelled) return
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
          if (d.details) {
            setDetails({
              ...d.details,
              images: Array.isArray(d.details.images) ? d.details.images : [],
              supportingDocuments: Array.isArray(d.details.supportingDocuments) ? d.details.supportingDocuments : [],
            })
          }
          if (d.contact)              setContact(d.contact)
          if (d.orgInfo)              setOrgInfo(d.orgInfo)
          if (d.campaignSetup)        setCampaignSetup(d.campaignSetup)
          if (d.selectedPackage === 'basic' && Array.isArray(d.selectedExtras)) setSelectedExtras(d.selectedExtras)
          if (typeof d.discountCode === 'string') setDiscountCode(d.discountCode)
          if (ORDERABLE_PACKAGES.some((pkg) => pkg.id === d.selectedPackage)) {
            setSelectedPackage(d.selectedPackage)
          }
          if (d.basicChannel)         setBasicChannel(d.basicChannel)
          if (Array.isArray(d.campaignPosts) && d.campaignPosts.length) {
            setCampaignPosts(d.campaignPosts.map((post: CampaignPostData) => ({
              ...post,
              images: Array.isArray(post.images) ? post.images : [],
              supportingDocuments: Array.isArray(post.supportingDocuments) ? post.supportingDocuments : [],
            })))
          }
          showToast('تم استرجاع طلبك غير المكتمل ✨', 'info')
        }
      }
      } catch { /* Ignore corrupt drafts. */ }
      setHydrated(true)
    }
    queueMicrotask(restoreDraft)
    return () => { cancelled = true }
  }, [showToast])

  // Restore a server-side draft from a signed email link. Local drafts still work as before.
  useEffect(() => {
    const resumeToken = resumeTokenParam
    const storedToken = (() => {
      try { return localStorage.getItem(RECOVERY_TOKEN_KEY) } catch { return null }
    })()
    const token = resumeToken || storedToken
    if (!token || membershipMode) return

    let cancelled = false
    fetch(`/api/request-drafts?token=${encodeURIComponent(token)}`)
      .then(async response => {
        if (!response.ok) return null
        return response.json() as Promise<{
          payload?: Record<string, unknown>
          offer?: RecoveryOffer | null
        }>
      })
      .then(result => {
        if (!result || cancelled) return
        const d = result.payload ?? {}
        if (typeof d.selectedInfluencer === 'string') setSelectedInfluencer(d.selectedInfluencer)
        if (d.requestType === 'single' || d.requestType === 'campaign') setRequestType(d.requestType)
        if (typeof d.clientType === 'string') setClientType(d.clientType as ClientType)
        if (typeof d.category === 'string') setCategory(d.category)
        if (typeof d.subOption === 'string') setSubOption(d.subOption)
        if (d.competitionSelection && typeof d.competitionSelection === 'object') {
          setCompetitionSelection(d.competitionSelection as { subcategory: string; position: string })
        }
        if (d.details && typeof d.details === 'object') {
          const restored = d.details as ContentDetails
          setDetails({
            ...restored,
            images: Array.isArray(restored.images) ? restored.images : [],
            supportingDocuments: Array.isArray(restored.supportingDocuments) ? restored.supportingDocuments : [],
          })
        }
        if (d.contact && typeof d.contact === 'object') setContact(d.contact as ContactData)
        if (d.orgInfo && typeof d.orgInfo === 'object') {
          setOrgInfo(d.orgInfo as { name: string; representative: string; license: string })
        }
        if (d.campaignSetup && typeof d.campaignSetup === 'object') setCampaignSetup(d.campaignSetup as CampaignSetup)
        if (Array.isArray(d.campaignPosts)) setCampaignPosts(d.campaignPosts as CampaignPostData[])
        if (typeof d.selectedPackage === 'string' && ORDERABLE_PACKAGES.some(pkg => pkg.id === d.selectedPackage)) {
          setSelectedPackage(d.selectedPackage)
        }
        if (typeof d.basicChannel === 'string') setBasicChannel(d.basicChannel)
        if (Array.isArray(d.selectedExtras)) setSelectedExtras(d.selectedExtras.filter((item): item is string => typeof item === 'string'))
        setRecoveryToken(token)
        try { localStorage.setItem(RECOVERY_TOKEN_KEY, token) } catch { /* Storage is optional. */ }
        if (result.offer) {
          setRecoveryOffer(result.offer)
          setDiscountCode(result.offer.code)
          showToast('تم تفعيل عرض استكمال الطلب على مسودتك', 'success')
        } else if (resumeToken) {
          showToast('تم استرجاع طلبك المحفوظ، أكمل من حيث توقفت', 'info')
        }
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [membershipMode, resumeTokenParam, showToast])

  // ── عند اختيار الحساب: النشر تلقائياً على كل قنواته المتاحة ───
  // السعر موحّد لكل القنوات، فلا حاجة لاختيار القناة يدوياً
  // ── حفظ المسودة تلقائياً بعد أي تغيير ───────────────────────────
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        savedAt: Date.now(),
        selectedInfluencer, requestType, clientType, category, subOption,
        competitionSelection, details, channels, contact, orgInfo,
        campaignSetup, campaignPosts, selectedPackage, basicChannel, selectedExtras, discountCode,
      }))
    } catch { /* تجاوز سعة التخزين — نتجاهل بهدوء */ }
  }, [
    hydrated, selectedInfluencer, requestType, clientType, category, subOption,
    competitionSelection, details, channels, contact, orgInfo,
    campaignSetup, campaignPosts, selectedPackage, basicChannel, selectedExtras, discountCode,
  ])

  // ملاحظة: بيانات التواصل تُحمَّل تلقائياً من بروفايل الحساب وتُرسَل مع الطلب،
  // دون عرض حقول إدخال — لأنها مُسجّلة مسبقاً عند إنشاء الحساب.

  // ── اكتمال الأقسام ──────────────────────────────────────────────
  const subOptionSatisfied =
    isCompetitionCategory
      ? !!competitionSelection?.subcategory && !!competitionSelection?.position
      : needsSubOption ? !!subOption : true

  const aboutComplete =
    !!selectedInfluencer && !!requestType && !!effectiveClientType && (
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


  // ── الباقات تُعرض للأفراد (المنشور الواحد + الحملة)، ولا تُعرض لفئة «أخرى» ──
  // فئة «أخرى» تُعامَل كالجهات: عرض مالي يدوي من الأدمن (بلا باقات ولا تسعير تلقائي).
  const isOtherCategory = category === 'Others'
  const showPackages = !membershipMode && clientType === 'individual' && !isOtherCategory
  // الباقة الأساسية تتطلّب اختيار قناة واحدة للنشر
  const basicNeedsChannel = showPackages && selectedPackage === 'basic'
  const packagesComplete = !showPackages || (!!selectedPackage && (!basicNeedsChannel || !!basicChannel))

  // السعر الديناميكي للباقة الأساسية = سعر التسعير التلقائي حسب نوع الخبر
  const basicDynamicPrice: number | null = (() => {
    if (!showPackages || requestType !== 'single' || !category || !subOptionSatisfied) return null
    try {
      const subOptionForCalc = isCompetitionCategory ? competitionSelection : subOption
      return calculateAutoQuote({
        category,
        subOption: subOptionForCalc,
        clientType: 'individual',
        selectedExtras: [],
        channelCount: 1,
      }).total
    } catch {
      return null
    }
  })()

  // مجموع أسعار أخبار الحملة (قبل الباقة والخصم) — لعرض سعر الباقة في الحملة
  const CAMPAIGN_DISCOUNT = 30
  const campaignBaseSubtotal: number | null = (() => {
    if (!showPackages || requestType !== 'campaign') return null
    try {
      let sum = 0
      for (const p of campaignPosts) {
        if (!p.category) return null
        sum += calculateAutoQuote({
          category: p.category,
          subOption: p.subOption ?? null,
          clientType: 'individual',
          selectedExtras: [],
          channelCount: 1,
        }).total
      }
      return sum
    } catch {
      return null
    }
  })()

  const selectedPackageData = ORDERABLE_PACKAGES.find((pkg) => pkg.id === selectedPackage) ?? null
  const extrasTotal = selectedExtras.reduce((total, id) => total + (AQ_EXTRAS_PRICES[id] ?? 0), 0)
  const estimatedTotal = (() => {
    if (!showPackages || !selectedPackageData) return null
    if (requestType === 'campaign' && campaignBaseSubtotal != null) {
      const packageTotal = Math.round(campaignBaseSubtotal * selectedPackageData.priceMultiplier)
      return packageTotal - Math.round(packageTotal * CAMPAIGN_DISCOUNT / 100)
    }
    if (requestType === 'single' && basicDynamicPrice != null) {
      return Math.round(basicDynamicPrice * selectedPackageData.priceMultiplier)
    }
    return null
  })()

  // بيانات تواصل الضيف (الزائر غير المسجَّل) — إلزامية لإنشاء حسابه ومتابعة طلبه.
  const emailValid = /^\S+@\S+\.\S+$/.test(contact.email.trim())
  const checkoutSubtotal = estimatedTotal != null ? estimatedTotal + extrasTotal : null
  const recoveryDiscountAmount = recoveryOffer && checkoutSubtotal != null && discountCode === recoveryOffer.code
    ? Math.min(Math.round(checkoutSubtotal * recoveryOffer.discountPct / 100), recoveryOffer.maxDiscountAmount)
    : 0
  const checkoutTotalAfterRecovery = checkoutSubtotal == null ? null : checkoutSubtotal - recoveryDiscountAmount
  const contactComplete = isLoggedIn || (
    contact.fullName.trim().length >= 3 &&
    contact.phone.trim().replace(/\D/g, '').length >= 9 &&
    emailValid
  )

  // Persist only viable package selections. The debounce prevents a request on every keystroke.
  useEffect(() => {
    if (!hydrated || membershipMode || !selectedPackage || !emailValid || success) return
    const timeout = window.setTimeout(async () => {
      const payload = {
        selectedInfluencer, requestType, clientType, category, subOption,
        competitionSelection, details, contact, orgInfo, campaignSetup, campaignPosts,
        selectedPackage, basicChannel, selectedExtras,
      }
      try {
        const response = await fetch('/api/request-drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: recoveryToken,
            clientEmail: contact.email,
            clientName: contact.fullName,
            clientPhone: contact.phone,
            selectedPackage,
            estimatedTotal: estimatedTotal != null ? estimatedTotal + extrasTotal : null,
            payload,
          }),
        })
        if (!response.ok) return
        const result = await response.json() as { token?: string }
        if (result.token && result.token !== recoveryToken) {
          setRecoveryToken(result.token)
          localStorage.setItem(RECOVERY_TOKEN_KEY, result.token)
        }
      } catch { /* Recovery must never interrupt checkout. */ }
    }, 1200)
    return () => window.clearTimeout(timeout)
  }, [
    hydrated, membershipMode, selectedPackage, emailValid, success, recoveryToken,
    selectedInfluencer, requestType, clientType, category, subOption, competitionSelection,
    details, contact, orgInfo, campaignSetup, campaignPosts, basicChannel, selectedExtras,
    estimatedTotal, extrasTotal,
  ])

  const sectionComplete = [aboutComplete, contentComplete, packagesComplete, contactComplete]
  const canSubmit = sectionComplete.every(Boolean)

  // أول متطلب ناقص — يُعرض كتلميح فوق زر الإرسال
  const missingHint = (): string | null => {
    if (!requestType) return 'اختر نوع الطلب'
    if (!effectiveClientType) return membershipMode ? 'جارٍ التحقق من باقة العضوية' : 'اختر صفة مقدّم الطلب'
    if (effectiveClientType !== 'individual' && orgInfo.name.trim() === '') return 'أدخل اسم الجهة'
    if (requestType === 'single') {
      if (!category) return 'اختر فئة المحتوى'
      if (!subOptionSatisfied) return 'أكمل الخيار الفرعي للفئة'
      if (details.title.trim() === '' || details.content.trim() === '') return 'أكمل عنوان ونص المنشور'
    }
    if (requestType === 'campaign') {
      if (campaignSetup.postCount < 2) return 'حدّد عدد المنشورات'
      if (!campaignPosts.every(isPostComplete)) return 'أكمل تفاصيل جميع منشورات الحملة'
    }
    if (showPackages && !selectedPackage) return 'اختر الباقة المناسبة'
    if (basicNeedsChannel && !basicChannel) return 'اختر قناة النشر للباقة الأساسية'
    if (!isLoggedIn) {
      if (contact.fullName.trim().length < 3) return 'أدخل اسمك الكامل'
      if (contact.phone.trim().replace(/\D/g, '').length < 9) return 'أدخل رقم جوالك'
      if (!emailValid) return 'أدخل بريداً إلكترونياً صحيحاً'
    }
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
          client_type:      effectiveClientType,
          org_name:           effectiveClientType !== 'individual' ? (orgInfo.name.trim() || null) : null,
          org_representative: effectiveClientType !== 'individual' ? (orgInfo.representative.trim() || null) : null,
          org_license:        effectiveClientType !== 'individual' ? (orgInfo.license.trim() || null) : null,
          channels,
          selected_extras:  selectedExtras,
          discount_code:    discountCode.trim() || null,
          recovery_token:   recoveryToken,
          // باقة واحدة للحملة كلها (للأفراد)
          selected_package: showPackages ? selectedPackage : null,
          basic_channel:    showPackages && selectedPackage === 'basic' ? basicChannel : null,
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
            supporting_documents: p.supportingDocuments,
            link:           p.link || null,
            hashtags:       p.hashtags || null,
          })),
        }
      } else {
        const subOptionData = isCompetitionCategory ? competitionSelection : subOption
        body = {
          request_type:    'single',
          influencer_id:   selectedInfluencer,
          client_type:     effectiveClientType,
          org_name:           effectiveClientType !== 'individual' ? (orgInfo.name.trim() || null) : null,
          org_representative: effectiveClientType !== 'individual' ? (orgInfo.representative.trim() || null) : null,
          org_license:        effectiveClientType !== 'individual' ? (orgInfo.license.trim() || null) : null,
          category,
          sub_option:      subOptionData,
          title:           details.title,
          content:         details.content,
          link:            details.link || null,
          hashtags:        details.hashtags || null,
          preferred_date:  details.preferredDate || null,
          content_images:  details.images,
          supporting_documents: details.supportingDocuments,
          client_name:     contact.fullName,
          client_phone:    contact.phone,
          client_email:    contact.email,
          client_city:     contact.city   || null,
          x_handle:        contact.xHandle || null,
          channels,
          selected_extras: selectedExtras,
          discount_code: discountCode.trim() || null,
          recovery_token: recoveryToken,
          selected_package: showPackages ? selectedPackage : null,
          basic_channel: showPackages && selectedPackage === 'basic' ? basicChannel : null,
        }
      }

      if (membershipMode) {
        body.membership_id = membershipId
        body.membership_benefits = selectedMembershipBenefits
      }
      const res = await fetch(membershipMode ? '/api/memberships/submit-request' : '/api/submit-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'حدث خطأ')

      try { localStorage.removeItem(DRAFT_KEY) } catch { /* تجاهل */ }
      if (recoveryToken) {
        fetch('/api/request-drafts', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: recoveryToken, requestId: data.id }),
        }).catch(() => undefined)
        try { localStorage.removeItem(RECOVERY_TOKEN_KEY) } catch { /* Storage is optional. */ }
      }

      if (membershipMode) {
        setRequestNumber(data.requestNumber)
        setMembershipResult({ membershipBalance: data.membershipBalance ?? null, benefitBalances: data.benefitBalances ?? [] })
        setSuccess(true)
        showToast(`تم إرسال الطلب وحجز الرصيد${data.membershipBalance != null ? ` · المتبقي ${data.membershipBalance}` : ''}`)
        return
      }

      // ── تسجيل دخول تلقائي للضيف الجديد حتى يتابع طلبه ويدفع بلا حاجز ──
      let signedIn = false
      if (data.autoLogin?.email && data.autoLogin?.password) {
        const supabase = createClient()
        const { error: siErr } = await supabase.auth.signInWithPassword({
          email: data.autoLogin.email,
          password: data.autoLogin.password,
        })
        signedIn = !siErr
        if (signedIn) router.refresh()
      }
      // جلسة متاحة؟ (سجّلناه الآن، أو كان مسجّلاً مسبقاً). الحساب الموجود لزائر غير مسجّل يحتاج دخولاً.
      const hasSession = signedIn || (!data.autoLogin && !data.existingAccount)

      // فرد معتمد مباشرةً — تحويله للدفع
      if (data.readyForPayment && data.id) {
        if (hasSession) {
          // جلسة جاهزة (سجّلناه الآن أو كان مسجّلاً) → للدفع مباشرة
          showToast('تم إنشاء طلبك — أكمل الدفع')
          router.push(`/payment/${data.id}`)
          return
        }
        if (data.existingAccount) {
          // حساب موجود لزائر غير مسجّل → دخول ثم عودة للدفع
          showToast('لديك حساب — سجّل دخولك لإكمال الدفع ومتابعة طلبك')
          router.push(`/auth/login?next=${encodeURIComponent(`/payment/${data.id}`)}`)
          return
        }
        // ضيف جديد تعذّر تسجيله تلقائياً (نادر) → شاشة نجاح + رابط المتابعة في الإيميل
      }

      setRequestNumber(data.requestNumber)
      setSuccess(true)
      showToast('تم إرسال طلبك بنجاح!')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء إرسال الطلب'
      showToast(msg, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const openReview = () => {
    if (!canSubmit) return
    setReviewing(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loading || catsLoading) return <LoadingSpinner size="lg" />
  if (success) return <SuccessScreen requestNumber={requestNumber} membershipBalance={membershipResult?.membershipBalance} benefitBalances={membershipResult?.benefitBalances} />

  // طلب قائم بانتظار الموافقة — يُمنع تقديم طلب جديد حتى اتخاذ إجراء
  if (pendingQuote && !membershipMode) {
    const statusInfo = getStatusLabel(pendingQuote.status, 'client')
    return (
      <div className="min-h-screen px-4 py-12 flex items-center justify-center">
        <div className="max-w-md w-full space-y-4">
          <div className="bg-card rounded-2xl border-2 border-amber-200 p-7 text-center shadow-sm">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-50 flex items-center justify-center text-3xl">
              ⏳
            </div>
            <h2 className="text-xl font-black text-dark mb-2">لديك طلب قائم</h2>
            <p className="text-sm text-muted leading-relaxed mb-1">
              لا يمكنك تقديم طلب جديد قبل إنهاء طلبك الحالي
              {' '}(الحالة: <span className="font-bold text-dark">{statusInfo.label}</span>).
            </p>
            <p className="text-sm text-muted leading-relaxed mb-6">
              راجع طلبك واتخذ الإجراء المناسب — أو <span className="font-bold text-dark">عدّله</span> أو <span className="font-bold text-dark">ألغِه</span> لتتمكن من تقديم طلب جديد.
            </p>
            <div className="flex flex-col gap-3">
              <Button onClick={() => router.push(`/dashboard/${pendingQuote.id}`)} className="w-full" size="lg">
                مراجعة الطلب القائم
              </Button>
              <Button variant="outline" onClick={() => router.push('/dashboard')} className="w-full">
                الذهاب إلى لوحة التحكم
              </Button>
            </div>
          </div>

          {/* تعديل/إلغاء — يظهر للطلبات غير المدفوعة فقط، ويحرّر العميل لتقديم طلب جديد */}
          <RequestManageActions request={pendingQuote} onCancelled={() => setPendingQuote(null)} />
        </div>
      </div>
    )
  }

  if (reviewing) {
    const summaryTitle = requestType === 'campaign'
      ? `حملة من ${campaignPosts.length} منشورات`
      : details.title
    const totalLabel = membershipMode ? 'رصيد واحد' : checkoutTotalAfterRecovery != null
      ? `${checkoutTotalAfterRecovery.toLocaleString('ar-SA')} ر.س`
      : 'سيصلك عرض سعر بعد المراجعة'
    const canSelectExtras = requestType === 'single' && selectedPackage === 'basic' && estimatedTotal != null

    return (
      <div className="min-h-screen pb-8">
        <div className="max-w-2xl mx-auto w-full px-4 py-6">
          <button
            type="button"
            onClick={() => setReviewing(false)}
            className="text-sm font-bold text-green mb-5"
          >
            ← تعديل الطلب
          </button>

          <div className="mb-5">
            <span className="inline-flex bg-green/10 text-green text-xs font-black px-3 py-1 rounded-full mb-3">الخطوة الأخيرة</span>
            <h1 className="text-2xl font-black text-dark mb-1">راجع طلبك</h1>
            <p className="text-sm text-muted">تأكد من التفاصيل قبل المتابعة.</p>
          </div>

          <div className="space-y-3">
            <section className="bg-card border border-border rounded-2xl p-5">
              <h2 className="font-black text-dark mb-3">تفاصيل الطلب</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4"><span className="text-muted">نوع الطلب</span><span className="font-bold text-dark">{requestType === 'campaign' ? 'حملة متعددة' : 'منشور واحد'}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted">المحتوى</span><span className="font-bold text-dark text-left">{summaryTitle}</span></div>
                {details.preferredDate && requestType === 'single' && (
                  <div className="flex justify-between gap-4"><span className="text-muted">موعد النشر</span><span className="font-bold text-dark">{details.preferredDate}</span></div>
                )}
              </div>
            </section>

            {membershipMode && selectedMembershipBenefits.length > 0 && (
              <section className="rounded-2xl border border-green/20 bg-green/5 p-5">
                <h2 className="font-black text-dark">المزايا المختارة</h2>
                <div className="mt-3 space-y-2">
                  {selectedMembershipBenefits.map(selection => (
                    <div key={selection.type} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm">
                      <span className="font-bold text-dark">{membershipBenefitSelectionLabel(selection)}</span>
                      <span className="text-xs font-black text-green">خصم وحدة واحدة</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {selectedPackageData && (
              <section className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h2 className="font-black text-dark">{selectedPackageData.name}</h2>
                    <p className="text-sm text-muted mt-1">{selectedPackageData.blurb}</p>
                  </div>
                  {estimatedTotal != null && <span className="text-green font-black whitespace-nowrap">{totalLabel}</span>}
                </div>
                <ul className="space-y-2">
                  {getPackageFeaturesForPostPrice(
                    selectedPackageData,
                    estimatedTotal == null
                      ? null
                      : estimatedTotal / (requestType === 'campaign' ? Math.max(campaignPosts.length, 1) : 1),
                  ).map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-dark">
                      <span className="text-green">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {canSelectExtras && (
              <RStepExtras
                selected={selectedExtras}
                onChange={setSelectedExtras}
                basePrice={estimatedTotal}
                baseLabel="سعر الباقة الأساسية"
              />
            )}

            {!membershipMode && clientType === 'individual' && estimatedTotal != null && (
              <section className="bg-card border border-border rounded-2xl p-5">
                {recoveryOffer && (
                  <div className="mb-4 rounded-xl border border-green/30 bg-green/5 px-4 py-3 text-sm text-dark">
                    <strong className="text-green">عرض الاستكمال مفعّل</strong>
                    <span className="block mt-1">
                      خصم {recoveryOffer.discountPct}% بحد أقصى {recoveryOffer.maxDiscountAmount.toLocaleString('ar-SA')} ر.س، ويُثبت في بيانات الطلب عند إرساله.
                    </span>
                  </div>
                )}
                <label className={fieldLabel}>كوبون الخصم</label>
                <input
                  type="text"
                  value={discountCode}
                  onChange={(event) => {
                    setDiscountCode(event.target.value.toUpperCase())
                    if (recoveryOffer && event.target.value.toUpperCase() !== recoveryOffer.code) setRecoveryOffer(null)
                  }}
                  placeholder="أدخل الكود إن وجد"
                  className={selectCls}
                  autoCapitalize="characters"
                />
                <p className="text-xs text-muted mt-2">يُطبَّق الخصم بعد التحقق من الكود.</p>
              </section>
            )}

            <section className="bg-card border border-border rounded-2xl p-5">
              <div className="flex justify-between items-center gap-4">
                <div>
                  <h2 className="font-black text-dark">{membershipMode ? 'ملخص الرصيد' : 'ملخص الدفع'}</h2>
                  <p className="text-xs text-muted mt-1">{membershipMode ? 'سيُحجز الرصيد عند الإرسال ويُستهلك عند بدء التنفيذ.' : discountCode.trim() ? 'سيُحدّث المبلغ بعد التحقق من الكوبون.' : 'السعر قبل الخصم إن وجد.'}</p>
                </div>
                <span className="text-green font-black text-lg text-left">{totalLabel}</span>
              </div>
            </section>
          </div>

          <p className="text-[11px] text-muted text-center mt-5 mb-3 leading-relaxed">
            بالمتابعة فإنك توافق على{' '}
            <button type="button" onClick={() => setShowTerms(true)} className="text-green font-medium underline">الشروط والأحكام وسياسة الخصوصية</button>
          </p>
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-[11px] font-medium leading-5 text-red-700">
            <strong>إقرار وإخلاء مسؤولية:</strong> بإرسال الطلب، يقر مقدم الطلب بأن جميع البيانات والمعلومات والمستندات والصور المقدمة صحيحة ودقيقة ومصرح له باستخدامها ونشرها، ويتحمل وحده كامل المسؤولية القانونية عن صحتها ومشروعيتها وعدم مخالفتها لحقوق الغير. ولا تتحمل شركة تواصل النخبة للدعاية والإعلان أو حساب «أول سعودي» أي مسؤولية قانونية أو تعويضية ناشئة عن عدم صحة أو دقة أو اكتمال البيانات المقدمة.
          </p>
          <Button onClick={handleSubmit} loading={submitting} disabled={submitting} className="w-full" size="lg">
            {membershipMode ? 'إرسال الطلب من رصيد العضوية' : clientType === 'individual' ? 'المتابعة إلى الدفع' : 'إرسال الطلب للمراجعة'}
          </Button>
        </div>

        {showTerms && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowTerms(false)}>
            <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="font-black text-dark text-base">الشروط والأحكام وسياسة الخصوصية</h3>
                <button type="button" onClick={() => setShowTerms(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:bg-muted/10 text-lg" aria-label="إغلاق">✕</button>
              </div>
              <div className="px-5 py-4 overflow-y-auto text-sm text-dark/80 leading-relaxed whitespace-pre-line">{siteContent.terms_text}</div>
              <div className="px-5 py-3 border-t border-border"><Button onClick={() => setShowTerms(false)} className="w-full">إغلاق</Button></div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const competitionPositions = competitionSelection?.subcategory
    ? getCompetitionPositions(competitionSelection.subcategory)
    : []

  // اختيار نوع الطلب / الصفة عبر البطاقات — بنفس آثار القوائم المنسدلة السابقة
  const selectRequestType = (v: RequestType) => {
    setRequestType(v)
    if (v === 'campaign') {
      setCategory(null); setSubOption(null); setCompetitionSelection(null)
      setSelectedExtras([])
    }
  }
  const selectClientType = (v: ClientType) => {
    if (clientType !== v) {
      setCategory(null); setSubOption(null); setCompetitionSelection(null)
      setCampaignPosts(prev => prev.map(p => ({ ...p, category: '', subOption: null })))
    }
    if (v !== 'individual') {
      setSelectedExtras([])
      setDiscountCode('')
    }
    setClientType(v)
  }

  // تقدّم التعبئة — للأقسام الفعّالة فقط (الباقة للأفراد، التواصل للزائر)
  const progressSteps = [
    aboutComplete, contentComplete,
    ...(showPackages ? [packagesComplete] : []),
    ...(!isLoggedIn ? [contactComplete] : []),
  ]
  const progressDone = progressSteps.filter(Boolean).length
  const progressPct = Math.round((progressDone / progressSteps.length) * 100)
  const membershipAvailable = membershipWallet
    ? membershipWallet.total_credits - membershipWallet.reserved_credits - membershipWallet.used_credits
    : null

  // ── العرض ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-36 lg:pb-10">
      <div className="max-w-6xl mx-auto w-full px-4 pt-6">
        <div className="relative max-w-3xl mx-auto text-center mb-5">
          {membershipMode && membershipAvailable != null && (
            <div className="mb-4 inline-flex items-center gap-3 rounded-lg border border-gold/30 bg-white/80 px-4 py-2 text-right shadow-sm lg:absolute lg:left-0 lg:top-0 lg:mb-0">
              <div><p className="text-[10px] font-bold text-muted">رصيد النشر المتبقي</p><p className="text-xs text-muted">بعد هذا الطلب: {Math.max(0, membershipAvailable - 1)}</p></div>
              <strong className="text-2xl text-green">{membershipAvailable}</strong>
            </div>
          )}
          <h1 className="text-2xl md:text-3xl font-black text-dark mb-1">طلب نشر جديد</h1>
          <p className="text-sm text-muted">{membershipMode ? 'قدّم الخبر من رصيد عضويتك دون المرور بالدفع' : 'عبّئ بياناتك بسرعة — وبمجرد الإرسال يظهر سعرك ويصلك العرض'}</p>
        </div>

        {/* شريط التقدّم */}
        <div className="max-w-3xl mx-auto mb-6">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-dark">{progressDone} من {progressSteps.length} مكتمل</span>
            <span className="text-xs font-black text-green">{progressPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-l from-green to-green/70 transition-all duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <RequestReviewsTrust />

        {!membershipMode && <div className="mb-4 lg:hidden"><MembershipTeaser compact /></div>}
        <div className={cn(!membershipPortalMode && 'lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-6 xl:gap-8')}>
        <main className={cn('min-w-0 mx-auto w-full', membershipPortalMode ? 'max-w-4xl' : 'max-w-2xl lg:max-w-none lg:mx-0')}>
        <div className="space-y-3">

          {/* ① عن الطلب ─────────────────────────────────────────── */}
          <FormSection
            index={1}
            title="عن الطلب"
            subtitle={membershipMode ? 'الحساب ونوع الطلب والفئة' : 'الحساب ونوع الطلب وصفتك والفئة'}
            complete={aboutComplete}
            open={openSection === 0}
            onToggle={() => setOpenSection(openSection === 0 ? -1 : 0)}
          >
            <div className="space-y-4">
              <div>
                <label className={fieldLabel}>نوع الطلب *</label>
                <div className={membershipMode ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
                  {REQUEST_TYPE_OPTIONS.map(o => {
                    if (membershipMode && o.id === 'campaign') return null
                    const active = requestType === o.id
                    return (
                      <button
                        type="button"
                        key={o.id}
                        onClick={() => selectRequestType(o.id)}
                        className={cn(
                          'rounded-2xl border-2 p-4 text-center transition-all active:scale-[0.98]',
                          active ? 'border-green bg-green/5 ring-2 ring-green/20' : 'border-border bg-white hover:border-green/40',
                        )}
                      >
                        <div className="text-3xl mb-1.5">{o.icon}</div>
                        <div className="font-black text-dark text-sm">{o.label}</div>
                        <div className="text-[11px] text-muted mt-0.5">{o.desc}</div>
                      </button>
                    )
                  })}
                </div>
                {requestType === 'campaign' && (
                  <p className="text-xs text-green-700 mt-2">🎉 الحملة المتعددة تمنحك خصماً على الإجمالي</p>
                )}
              </div>

              {!membershipMode && <div>
                <label className={fieldLabel}>صفة مقدّم الطلب *</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CLIENT_TYPE_OPTIONS.map(o => {
                    const active = clientType === o.id
                    return (
                      <button
                        type="button"
                        key={o.id}
                        onClick={() => selectClientType(o.id)}
                        className={cn(
                          'flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition-all active:scale-[0.98]',
                          active ? 'border-green bg-green/5 text-dark ring-2 ring-green/20' : 'border-border bg-white text-muted hover:border-green/40',
                        )}
                      >
                        <span className="text-lg leading-none">{o.icon}</span>
                        <span className="leading-tight text-right">{o.label}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-amber-600 mt-2">⚠️ يجب اختيار الصفة الصحيحة؛ فقد يؤدي الاختيار غير الصحيح إلى إلغاء الطلب وعدم الأهلية لاسترجاع المبلغ، وفق سياسة الاسترجاع والأنظمة النافذة.</p>
              </div>}

              {/* بيانات الجهة — لغير الأفراد (شركة / حكومة / جمعية / وكالة) */}
              {effectiveClientType && effectiveClientType !== 'individual' && (
                <div className="space-y-3 bg-muted/5 rounded-xl p-3 border border-border">
                  <div>
                    <label className={fieldLabel}>اسم الجهة *</label>
                    <input
                      type="text"
                      value={orgInfo.name}
                      onChange={e => setOrgInfo({ ...orgInfo, name: e.target.value })}
                      placeholder="الاسم الرسمي للجهة"
                      className={selectCls}
                    />
                  </div>
                  <div>
                    <label className={fieldLabel}>اسم ممثل الجهة (اختياري)</label>
                    <input
                      type="text"
                      value={orgInfo.representative}
                      onChange={e => setOrgInfo({ ...orgInfo, representative: e.target.value })}
                      placeholder="اسم الشخص المسؤول"
                      className={selectCls}
                    />
                  </div>
                  <div>
                    <label className={fieldLabel}>السجل أو الترخيص (اختياري)</label>
                    <input
                      type="text"
                      value={orgInfo.license}
                      onChange={e => setOrgInfo({ ...orgInfo, license: e.target.value })}
                      placeholder="رقم السجل التجاري أو الترخيص"
                      className={selectCls}
                    />
                  </div>
                </div>
              )}

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
                      disabled={!effectiveClientType}
                      className={cn(selectCls, !effectiveClientType && 'opacity-50 cursor-not-allowed')}
                    >
                      <option value="">{effectiveClientType ? '— اختر الفئة —' : membershipMode ? 'جارٍ تحميل العضوية...' : 'اختر صفتك أولاً'}</option>
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
                      onChange={e => {
                        const postCount = Number(e.target.value)
                        setCampaignSetup({ ...campaignSetup, postCount })
                        setCampaignPosts(prev => resizeCampaignPosts(prev, postCount))
                      }}
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
            {/* شروط قبول الخبر — شرط الفئة (للمنشور المفرد) + أي بنود عامة إن وُجدت — تُدار من لوحة الأدمن */}
            {(() => {
              const singleCondition =
                requestType === 'single' && category ? siteContent.category_conditions[category] : ''
              const hasContent =
                siteContent.news_conditions_general.length > 0 ||
                !!singleCondition ||
                !!siteContent.news_conditions_footer
              if (!hasContent) return null
              return (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] leading-6 text-red-600">
                  <p className="font-bold mb-1">⚠️ شروط قبول الخبر:</p>
                  <ul className="list-disc pr-4 space-y-0.5">
                    {siteContent.news_conditions_general.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                    {singleCondition && (
                      <li><span className="font-bold">حسب الفئة:</span> {singleCondition}</li>
                    )}
                  </ul>
                  {siteContent.news_conditions_footer && (
                    <p className="font-bold mt-1">{siteContent.news_conditions_footer}</p>
                  )}
                </div>
              )
            })()}

            {!requestType ? (
              <p className="text-sm text-muted text-center py-4">اختر نوع الطلب في القسم السابق أولاً</p>
            ) : requestType === 'campaign' ? (
              <RStepCampaignPosts
                posts={campaignPosts}
                onChange={setCampaignPosts}
                clientType={effectiveClientType}
                categories={categories}
                categoryConditions={siteContent.category_conditions}
              />
            ) : (
              <>
                <RStep3Details data={details} onChange={setDetails} />
                {membershipMode && membershipBenefits.length > 0 && (
                  <MembershipBenefitPicker
                    wallets={membershipBenefits}
                    value={selectedMembershipBenefits}
                    onChange={setSelectedMembershipBenefits}
                  />
                )}
              </>
            )}

            <div className="flex justify-end pt-4">
              {showPackages ? (
                <Button size="sm" onClick={() => setOpenSection(2)} disabled={!contentComplete}>
                  التالي ←
                </Button>
              ) : (
                <Button size="sm" onClick={openReview} disabled={!canSubmit}>
                  مراجعة الطلب
                </Button>
              )}
            </div>
          </FormSection>

          {/* ③ اختيار الباقة — للأفراد + المنشور الواحد فقط ──────── */}
          {showPackages && (
            <FormSection
              index={3}
              title="اختر الباقة"
              subtitle={requestType === 'campaign' ? 'باقة واحدة تنطبق على كل أخبار الحملة' : 'حدّد الباقة المناسبة لخبرك'}
              complete={packagesComplete}
              open={openSection === 2}
              onToggle={() => setOpenSection(openSection === 2 ? -1 : 2)}
            >
              {requestType === 'campaign' && (
                <p className="text-xs text-muted mb-3 bg-cream rounded-lg p-2">
                  🚀 الباقة المختارة تنطبق على كل أخبار الحملة ({campaignPosts.length} منشورات) — السعر يشمل خصم الحملة {CAMPAIGN_DISCOUNT}%.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ORDERABLE_PACKAGES.map(pkg => {
                  const isSelected = selectedPackage === pkg.id
                  // السعر: المفرد = سعر الخبر × معامل الباقة ؛ الحملة = مجموع الأخبار × معامل الباقة − خصم الحملة
                  let pkgPrice: number | null = null   // بعد الخصم
                  let pkgBefore: number | null = null  // قبل خصم الحملة (مشطوب)
                  if (requestType === 'campaign') {
                    if (campaignBaseSubtotal != null) {
                      const withPkg = Math.round(campaignBaseSubtotal * pkg.priceMultiplier)
                      pkgBefore = withPkg
                      pkgPrice = withPkg - Math.round(withPkg * CAMPAIGN_DISCOUNT / 100)
                    }
                  } else if (basicDynamicPrice != null) {
                    pkgPrice = Math.round(basicDynamicPrice * pkg.priceMultiplier)
                  }
                  const priceLabel = pkgPrice != null ? `${pkgPrice} ر.س` : 'حسب نوع الخبر'
                  const postPrice = pkgPrice == null
                    ? null
                    : pkgPrice / (requestType === 'campaign' ? Math.max(campaignPosts.length, 1) : 1)
                  const visibleFeatures = getPackageFeaturesForPostPrice(pkg, postPrice)
                  return (
                    <button
                      type="button"
                      key={pkg.id}
                      onClick={() => {
                        setSelectedPackage(pkg.id)
                        if (pkg.id !== 'basic') setSelectedExtras([])
                      }}
                      className={cn(
                        'relative text-right rounded-2xl border-2 p-4 transition-all flex flex-col',
                        isSelected
                          ? 'border-green bg-green/5 ring-2 ring-green/30'
                          : 'border-border bg-card hover:border-green/40',
                      )}
                    >
                      {pkg.highlighted && (
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-green text-white text-[10px] font-black px-2.5 py-0.5 rounded-full whitespace-nowrap">
                          الأكثر اختياراً
                        </span>
                      )}
                      <div className="flex items-center justify-between gap-2 mb-1 mt-1">
                        <span className="font-black text-dark text-sm">{pkg.name}</span>
                        {isSelected && <span className="text-green text-base flex-shrink-0">✓</span>}
                      </div>
                      <div className="flex items-baseline gap-2 mb-1">
                        {pkgBefore != null && pkgBefore !== pkgPrice && (
                          <span className="text-muted text-sm line-through">{pkgBefore} ر.س</span>
                        )}
                        <span className="text-green font-black text-lg">{priceLabel}</span>
                      </div>
                      <p className="text-xs text-muted mb-2">{pkg.blurb}</p>
                      {pkg.badge && (
                        <span className="inline-flex items-center gap-1 self-start bg-pink-50 text-pink-600 border border-pink-200 text-[10px] font-bold px-2 py-1 rounded-lg mb-3">
                          🛍️ {pkg.badge}
                        </span>
                      )}
                      <ul className="space-y-1.5 mt-auto">
                        {visibleFeatures.map((f, i) => {
                          const isSponsored = f.includes('مموّل')
                          return (
                            <li
                              key={i}
                              className={
                                isSponsored
                                  ? 'flex items-start gap-1.5 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-300 rounded-md px-1.5 py-1'
                                  : 'flex items-start gap-1.5 text-xs text-dark'
                              }
                            >
                              <span className={isSponsored ? 'flex-shrink-0' : 'text-green flex-shrink-0'}>
                                {isSponsored ? '📣' : '✓'}
                              </span>
                              <span>{f}</span>
                            </li>
                          )
                        })}
                      </ul>
                    </button>
                  )
                })}
              </div>

              {/* اختيار قناة النشر — للباقة الأساسية فقط (قناة واحدة) */}
              {basicNeedsChannel && (
                <div className="mt-4 bg-cream rounded-xl p-4">
                  <label className={fieldLabel}>اختر قناة النشر *</label>
                  <p className="text-xs text-muted mb-3">الباقة الأساسية تشمل النشر في قناة واحدة فقط</p>
                  {availableChannels.length === 0 ? (
                    <p className="text-xs text-muted">لا توجد قنوات متاحة لهذا الحساب</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {availableChannels.map(ch => (
                        <button
                          type="button"
                          key={ch}
                          onClick={() => setBasicChannel(ch)}
                          className={cn(
                            'rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-all',
                            basicChannel === ch
                              ? 'border-green bg-green/5 text-dark'
                              : 'border-border bg-white text-muted hover:border-green/40',
                          )}
                        >
                          {basicChannel === ch && <span className="text-green">✓ </span>}
                          {CHANNEL_LABELS[ch] ?? ch}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-4">
                <Button size="sm" onClick={openReview} disabled={!canSubmit}>
                  مراجعة الطلب
                </Button>
              </div>
            </FormSection>
          )}

        </div>
        </main>

        {!membershipPortalMode && <aside className="hidden lg:block sticky top-6">
          {membershipMode ? (
            <div className="overflow-hidden rounded-lg border border-gold/40 bg-dark p-6 text-white shadow-xl">
              <p className="text-xs font-bold text-gold">طلب ضمن العضوية</p>
              <h2 className="mt-2 text-2xl font-black">رصيدك يغطي هذا الطلب</h2>
              <p className="mt-3 text-sm leading-7 text-white/65">لن يظهر دفع أو اختيار باقة. بعد الإرسال يُحجز رصيد واحد حتى تبدأ الإدارة التنفيذ.</p>
              <div className="my-5 border-y border-white/10 py-4"><strong className="text-3xl text-gold">1</strong><span className="mr-2 text-sm text-white/60">رصيد لهذا المنشور</span></div>
              <button type="button" onClick={() => router.push('/dashboard/membership')} className="w-full rounded-lg border border-white/20 px-4 py-3 text-sm font-bold hover:bg-white/10">العودة إلى عضويتي</button>
            </div>
          ) : <MembershipTeaser />}
        </aside>}
      </div>
      </div>

      {/* سلة الطلب الثابتة */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg backdrop-blur-md lg:hidden">
        <div className="max-w-2xl mx-auto">
          {!canSubmit && missingHint() && (
            <p className="text-xs text-muted text-center mb-2">⬑ {missingHint()}</p>
          )}
          {showPackages && selectedPackageData && (
            <div className="flex items-center justify-between gap-3 text-sm mb-2">
              <div className="min-w-0">
                <span className="text-muted">السلة: </span>
                <span className="font-bold text-dark">{selectedPackageData.name}</span>
              </div>
              {checkoutTotalAfterRecovery != null && (
                <div className="text-left">
                  <span className="font-black text-green whitespace-nowrap">{checkoutTotalAfterRecovery.toLocaleString('ar-SA')} ر.س</span>
                  {recoveryDiscountAmount > 0 && (
                    <span className="block text-xs text-muted line-through">{checkoutSubtotal?.toLocaleString('ar-SA')} ر.س</span>
                  )}
                </div>
              )}
            </div>
          )}
          <Button
            onClick={openReview}
            disabled={!canSubmit}
            className="w-full"
          >
            مراجعة الطلب
          </Button>
        </div>
      </div>

      {/* نافذة الشروط والأحكام */}
      {showTerms && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setShowTerms(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-black text-dark text-base">الشروط والأحكام وسياسة الخصوصية</h3>
              <button
                type="button"
                onClick={() => setShowTerms(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:bg-muted/10 text-lg"
                aria-label="إغلاق"
              >
                ✕
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto text-sm text-dark/80 leading-relaxed whitespace-pre-line">
              {siteContent.terms_text}
            </div>
            <div className="px-5 py-3 border-t border-border">
              <Button onClick={() => setShowTerms(false)} className="w-full">إغلاق</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

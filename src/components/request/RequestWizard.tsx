'use client'
import {useIndividualCatalog} from '@/hooks/useIndividualCatalog'
import {activePackages, newsPrice, PACKAGE_IDS} from '@/lib/catalog/model'

import { getIndividualPackage, packagePrice, resolvePackageChannels } from '@/lib/individual-packages'
import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import GoogleSignIn from '@/components/auth/GoogleSignIn'
import { REQUEST_AFTER_LOGIN } from '@/lib/portal-login'
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
import RStep5Contact, { type ContactData } from './RStep5Contact'
import PackageComparison from './PackageComparison'
import styles from './RequestWizard.module.css'
import { TERMS_TEXT } from './RStep6Terms'
import RStepCampaignPosts, { type CampaignPostData, makeEmptyPost, isPostComplete } from './RStepCampaignPosts'
import SuccessScreen from './SuccessScreen'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import RequestManageActions from '@/components/dashboard/RequestManageActions'
import { getStatusLabel } from '@/lib/status-labels'
import { COMPETITION_SUBCATEGORIES, getCompetitionPositions, getPackageFeaturesForPostPrice, ORDERABLE_PACKAGES, CATEGORY_CONDITIONS, type RequestStatus } from '@/lib/constants'
import { AQ_EXTRAS_PRICES, calculateAutoQuote } from '@/lib/auto-quote'
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

const CLIENT_TYPE_OPTIONS: { id: ClientType; label: string; desc: string }[] = [
  { id: 'individual', label: 'فرد', desc: 'قدّم خبرًا أو إنجازًا باسمك.' },
  { id: 'business',   label: 'شركة / مؤسسة', desc: 'قدّم خبرًا باسم شركة أو مؤسسة.' },
  { id: 'government', label: 'جهة حكومية', desc: 'قدّم خبرًا باسم جهة حكومية.' },
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
const GUEST_SELECTION_KEY = 'tn_request_guest_selection'
const RECOVERY_TOKEN_KEY = 'tn_request_recovery_token_v1'
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

function savedStep(value: unknown, max: number) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max ? value : null
}

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

function FormSection({ index, title, open, children }: {
  index: number
  title: string
  open: boolean
  children: ReactNode
}) {
  return (
    <section id={`request-section-${index}`} aria-labelledby={`request-heading-${index}`} hidden={!open} className={styles.panel}>
      <h2 id={`request-heading-${index}`} tabIndex={-1}>{title}</h2>
      {open && children}
    </section>
  )
}

export default function RequestWizard() {
  const {catalog,error:catalogError,refresh:refreshCatalog}=useIndividualCatalog()
  const singlePackages=useMemo(()=>catalog?activePackages(catalog):[],[catalog])
  const appliedPackageLink=useRef<string|null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const membershipId = searchParams.get('membership')
  const resumeTokenParam = searchParams.get('resume')
  const requestedPackage = searchParams.get('package')
  const continueAfterLogin = searchParams.get('continue') === 'details'
  const membershipMode = !!membershipId
  const membershipPortalMode = membershipMode && pathname.startsWith('/dashboard/membership/request')
  const { showToast } = useToast()
  const { categories, loading: catsLoading } = useCategories()
  // محتوى الموقع القابل للتعديل من لوحة الأدمن (الشروط + شروط قبول الخبر)
  const siteContent = useSiteContent(SITE_CONTENT_FALLBACK)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
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
  const [userId, setUserId] = useState<string | null>()
  const isLoggedIn = !!userId
  const [showAccountOptions, setShowAccountOptions] = useState(false)
  const [guestSubtotal, setGuestSubtotal] = useState<number | null>(null)
  const guestSelectionRestored = useRef(false)
  const localProgressRestored = useRef(false)
  const focusResumedStep = useRef(false)
  const [orgInfo, setOrgInfo]           = useState({ name: '', representative: '', license: '' })
  // الموافقة على الشروط ضمنية بالضغط على «إرسال الطلب» — مع رابط لعرضها في نافذة منبثقة
  const [termsAccepted, setTermsAccepted] = useState(false)
  // الباقة المختارة (للأفراد + المنشور الواحد فقط)
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null)
  // قناة النشر للباقة الأساسية (قناة واحدة يحددها المستخدم)
  const [basicChannel, setBasicChannel] = useState<string | null>(null)
  const [reachChannels, setReachChannels] = useState<string[]>([])
  const [career, setCareer] = useState({ language: 'ar', goal: '', experience: '', education: '' })

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
      setUserId(user?.id ?? null)
      if (user) {
        setContact(prev => ({ ...prev, email: user.email || prev.email }))
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
    }).catch(() => setUserId(null))
  }, [])

  // ── استرجاع مسودة غير مكتملة (مرة واحدة عند الفتح) ──────────────
  useEffect(() => {
    if (userId === undefined || hydrated) return
    let cancelled = false
    const restoreDraft = () => {
      if (cancelled) return
      try {
        const guestRaw = !membershipMode && (!userId || continueAfterLogin)
          ? sessionStorage.getItem(GUEST_SELECTION_KEY)
          : null
        let guest = null
        if (guestRaw) {
          try {
            const parsed = JSON.parse(guestRaw)
            if (typeof parsed?.savedAt === 'number' && Date.now() - parsed.savedAt < DRAFT_TTL_MS) guest = parsed
          } catch { /* A damaged guest draft should not block the signed-in draft. */ }
        }
        const authHandoff = !!(userId && continueAfterLogin && guest && guest.resumeAfterLogin !== false)
        const signedRaw = userId && !authHandoff ? localStorage.getItem(DRAFT_KEY) : null
        const d = authHandoff || !userId ? guest : signedRaw ? JSON.parse(signedRaw) : null
        if (d && typeof d.savedAt === 'number' && Date.now() - d.savedAt < DRAFT_TTL_MS &&
            (!d.userId || d.userId === userId)) {
          const priorStep = (d.membershipId ?? null) === membershipId ? savedStep(d.openSection, userId ? 4 : 2) : null
          if (requestedPackage && !membershipMode && d.packageLink === requestedPackage) {
            appliedPackageLink.current = requestedPackage
          }
          if (authHandoff) {
            guestSelectionRestored.current = true
            setOpenSection(3)
            focusResumedStep.current = true
            if (typeof d.subtotal === 'number') setGuestSubtotal(d.subtotal)
          } else if (priorStep != null) {
            setOpenSection(priorStep)
            localProgressRestored.current = !!userId
            if (!userId) setShowAccountOptions(d.showAccountOptions === true)
            if (userId && typeof d.guestSubtotal === 'number') setGuestSubtotal(d.guestSubtotal)
          } else if (continueAfterLogin && d.userId === userId && userId) {
            setOpenSection(3)
            focusResumedStep.current = true
            if (typeof d.guestSubtotal === 'number') setGuestSubtotal(d.guestSubtotal)
          } else if (!userId && d.resumeAfterLogin !== false) {
            setOpenSection(d.selectedPackage ? 2 : 1)
          }
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
          if (d.orgInfo)              setOrgInfo(d.orgInfo)
          if (d.campaignSetup)        setCampaignSetup(d.campaignSetup)
          if ((d.selectedPackage === 'basic' || d.selectedPackage === 'v2_basic') && Array.isArray(d.selectedExtras)) setSelectedExtras(d.selectedExtras)
          if (typeof d.discountCode === 'string') setDiscountCode(d.discountCode)
          if ([...ORDERABLE_PACKAGES.map(p=>p.id),...PACKAGE_IDS].includes(d.selectedPackage)) {
            setSelectedPackage(d.selectedPackage)
          }
          if (d.career && typeof d.career === 'object') setCareer(d.career)
          if (Array.isArray(d.reachChannels)) setReachChannels(d.reachChannels)
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
      } catch { /* Ignore corrupt drafts. */ }
      setHydrated(true)
    }
    queueMicrotask(restoreDraft)
    return () => { cancelled = true }
  }, [continueAfterLogin, hydrated, membershipId, membershipMode, requestedPackage, showToast, userId])

  // Restore a server-side draft from a signed email link. Local drafts still work as before.
  useEffect(() => {
    if (!hydrated || !userId || (guestSelectionRestored.current && !resumeTokenParam)) return
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
        if (resumeToken || !localProgressRestored.current) {
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
          if ([...ORDERABLE_PACKAGES.map(pkg => pkg.id), ...PACKAGE_IDS].includes(d.selectedPackage as string)) {
            setSelectedPackage(d.selectedPackage as string)
          }
          if (typeof d.basicChannel === 'string') setBasicChannel(d.basicChannel)
          if (Array.isArray(d.reachChannels)) setReachChannels(d.reachChannels.filter((item): item is string => typeof item === 'string'))
          if (Array.isArray(d.selectedExtras)) setSelectedExtras(d.selectedExtras.filter((item): item is string => typeof item === 'string'))
        }
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
  }, [hydrated, membershipMode, resumeTokenParam, showToast, userId])

  // ── عند اختيار الحساب: النشر تلقائياً على كل قنواته المتاحة ───
  // السعر موحّد لكل القنوات، فلا حاجة لاختيار القناة يدوياً
  // ── حفظ المسودة تلقائياً بعد أي تغيير ───────────────────────────
  useEffect(() => {
    if (!hydrated || !userId || success) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        userId,
        membershipId,
        openSection,
        packageLink: appliedPackageLink.current,
        guestSubtotal,
        savedAt: Date.now(),
        selectedInfluencer, requestType, clientType, category, subOption,
        competitionSelection, details, channels, contact, orgInfo,
        campaignSetup, campaignPosts, selectedPackage, basicChannel, reachChannels, career, selectedExtras, discountCode,
      }))
      if (guestSelectionRestored.current) {
        localStorage.removeItem(RECOVERY_TOKEN_KEY)
        sessionStorage.removeItem(GUEST_SELECTION_KEY)
        guestSelectionRestored.current = false
      }
    } catch { /* تجاوز سعة التخزين — نتجاهل بهدوء */ }
  }, [
    hydrated, userId, membershipId, openSection, guestSubtotal, success, selectedInfluencer, requestType, clientType, category, subOption,
    competitionSelection, details, channels, contact, orgInfo,
    campaignSetup, campaignPosts, selectedPackage, basicChannel, reachChannels, career, selectedExtras, discountCode,
  ])

  const guestDraft = useMemo(() => ({
    openSection,
    showAccountOptions,
    selectedInfluencer, requestType, clientType, category, subOption, competitionSelection,
    orgInfo, campaignSetup, selectedPackage, basicChannel, reachChannels, selectedExtras, discountCode,
  }), [
    openSection, showAccountOptions, selectedInfluencer, requestType, clientType, category,
    subOption, competitionSelection, orgInfo, campaignSetup, selectedPackage, basicChannel,
    reachChannels, selectedExtras, discountCode,
  ])

  useEffect(() => {
    if (!hydrated || userId || membershipMode || !guestDraft.clientType) return
    try {
      sessionStorage.setItem(GUEST_SELECTION_KEY, JSON.stringify({
        ...guestDraft,
        packageLink: appliedPackageLink.current,
        savedAt: Date.now(),
        resumeAfterLogin: false,
      }))
    } catch { /* Browser storage may be unavailable. */ }
  }, [guestDraft, hydrated, membershipMode, userId])

  useEffect(() => {
    const pkg = getIndividualPackage(requestedPackage ?? '',singlePackages)
    if (!hydrated || membershipMode || !pkg || appliedPackageLink.current===requestedPackage) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      appliedPackageLink.current=requestedPackage
      setRequestType('single')
      setClientType('individual')
      setSelectedPackage(pkg.id)
      setSelectedExtras([])
      if (pkg.requiredCategory) { setCategory(pkg.requiredCategory); setSubOption(null); setCompetitionSelection(null) }
      setOpenSection(0)
    })
    return () => { cancelled = true }
  }, [hydrated, membershipMode, requestedPackage, singlePackages])

  // ملاحظة: بيانات التواصل تُحمَّل تلقائياً من بروفايل الحساب وتُرسَل مع الطلب،
  // دون عرض حقول إدخال — لأنها مُسجّلة مسبقاً عند إنشاء الحساب.

  // ── اكتمال الأقسام ──────────────────────────────────────────────
  const subOptionSatisfied =
    isCompetitionCategory
      ? !!competitionSelection?.subcategory && !!competitionSelection?.position
      : needsSubOption ? !!subOption : true

  const identityComplete = !!selectedInfluencer && !!effectiveClientType && (effectiveClientType === 'individual' || orgInfo.name.trim() !== '')
  const aboutComplete =
    identityComplete && !!requestType && (
      requestType === 'campaign'
        ? campaignSetup.postCount >= 2
        : (!!category && subOptionSatisfied)
    )

  const baseContentComplete =
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
  const basicNeedsChannel = showPackages && (selectedPackage === 'basic' || !!singlePackages.find(p=>p.id===selectedPackage&&!p.channels&&p.channelCount===1))
  const offeredPackages = requestType === 'campaign' ? ORDERABLE_PACKAGES : singlePackages.filter(p=>!p.requiredCategory || p.requiredCategory===category)
  const chosenV2 = getIndividualPackage(selectedPackage ?? '',singlePackages)
  const chosenChannels = chosenV2?.channels ? [...chosenV2.channels] : chosenV2?.channelCount===1 ? (basicChannel?[basicChannel]:[]) : reachChannels
  let validV2Channels = true
  if (chosenV2) { try { resolvePackageChannels(chosenV2, chosenChannels, availableChannels) } catch { validV2Channels = false } }
  const careerComplete = !showPackages || chosenV2?.id !== 'v2_career' || [career.goal, career.experience, career.education].every(v => v.trim().length > 0)
  const packagesComplete = !showPackages || ((requestType==='campaign'||(!!catalog&&!catalogError)) && (!chosenV2?.requiredCategory || category === chosenV2.requiredCategory) && !!selectedPackage && offeredPackages.some(p => p.id === selectedPackage) && (!basicNeedsChannel || !!basicChannel) && validV2Channels)

  const contentComplete = baseContentComplete && careerComplete

  // السعر الديناميكي للباقة الأساسية = سعر التسعير التلقائي حسب نوع الخبر
  const basicDynamicPrice: number | null = (() => {
    if (!showPackages || requestType !== 'single' || !category || !subOptionSatisfied) return null
    try {
      const subOptionForCalc = isCompetitionCategory ? competitionSelection : subOption
      return catalog ? newsPrice(catalog,category,subOptionForCalc) : null
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

  const selectedPackageData = offeredPackages.find((pkg) => pkg.id === selectedPackage) ?? null
  const catalogExtras = chosenV2 ? catalog?.extras.filter(extra => extra.enabled && (extra.id !== 'infographic' || category === 'cv')) : undefined
  const effectiveExtras = [...new Set(selectedExtras)].filter(id => !chosenV2 || catalogExtras?.some(extra => extra.id === id))
  const extrasTotal = effectiveExtras
    .filter(id => !chosenV2?.includedExtras.includes(id))
    .reduce((total, id) => total + (chosenV2 ? catalogExtras?.find(extra => extra.id === id)?.price ?? 0 : AQ_EXTRAS_PRICES[id] ?? 0), 0)
  const estimatedTotal = (() => {
    if (!showPackages || !selectedPackageData) return null
    if (requestType === 'campaign' && campaignBaseSubtotal != null) {
      const packageTotal = Math.round(campaignBaseSubtotal * selectedPackageData.priceMultiplier)
      return packageTotal - Math.round(packageTotal * CAMPAIGN_DISCOUNT / 100)
    }
    if (requestType === 'single' && basicDynamicPrice != null) {
      return chosenV2 ? packagePrice(basicDynamicPrice, chosenV2, category) : Math.round(basicDynamicPrice * selectedPackageData.priceMultiplier)
    }
    return null
  })()

  // بيانات تواصل الضيف (الزائر غير المسجَّل) — إلزامية لإنشاء حسابه ومتابعة طلبه.
  const emailValid = /^\S+@\S+\.\S+$/.test(contact.email.trim())
  const checkoutSubtotal = estimatedTotal != null ? estimatedTotal + extrasTotal : null
  // The saved guest price is only checked when resuming at the content step.
  const priceChanged = openSection === 3 && guestSubtotal != null && checkoutSubtotal != null && checkoutSubtotal !== guestSubtotal
  const activeSection = !identityComplete ? 0
    : openSection > 1 && !aboutComplete ? 1
    : openSection >= 3 && showPackages && (!packagesComplete || priceChanged) ? 2
    : openSection
  const recoveryDiscountAmount = recoveryOffer && checkoutSubtotal != null && discountCode === recoveryOffer.code
    ? Math.min(Math.round(Math.max(0, checkoutSubtotal - (requestType === 'single' ? chosenV2?.sponsoredCampaignBudget ?? 0 : 0)) * recoveryOffer.discountPct) / 100, recoveryOffer.maxDiscountAmount)
    : 0
  const checkoutTotalAfterRecovery = checkoutSubtotal == null ? null : checkoutSubtotal - recoveryDiscountAmount
  const contactComplete = isLoggedIn || (
    contact.fullName.trim().length >= 3 &&
    contact.phone.trim().replace(/\D/g, '').length >= 9 &&
    emailValid
  )

  // Persist only viable package selections. The debounce prevents a request on every keystroke.
  useEffect(() => {
    if (!hydrated || !userId || membershipMode || !packagesComplete || !selectedPackage || !emailValid || success) return
    const timeout = window.setTimeout(async () => {
      const payload = {
        selectedInfluencer, requestType, clientType, category, subOption,
        competitionSelection, details, contact, orgInfo, campaignSetup, campaignPosts,
        selectedPackage, basicChannel, reachChannels, selectedExtras,
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
    hydrated, userId, membershipMode, packagesComplete, selectedPackage, emailValid, success, recoveryToken,
    selectedInfluencer, requestType, clientType, category, subOption, competitionSelection,
    details, contact, orgInfo, campaignSetup, campaignPosts, basicChannel, reachChannels, selectedExtras,
    estimatedTotal, extrasTotal,
  ])

  const sectionComplete = [identityComplete, aboutComplete, packagesComplete, contentComplete, contactComplete]
  const canSubmit = isLoggedIn && sectionComplete.every(Boolean)

  const handleSubmit = async () => {
    if (!canSubmit) return
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

          basic_channel:    showPackages && (selectedPackage === 'basic' || selectedPackage === 'v2_basic') ? basicChannel : null,
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
          selected_extras: effectiveExtras,
          discount_code: discountCode.trim() || null,
          recovery_token: recoveryToken,
          selected_package: showPackages ? selectedPackage : null,
          catalog_version: catalog?.version,
          ...(showPackages && requestType === 'single' && chosenV2 ? { channels: chosenChannels, ...(chosenV2.id === 'v2_career' ? { career } : {}) } : {}),
          basic_channel: showPackages && (selectedPackage === 'basic' || selectedPackage === 'v2_basic') ? basicChannel : null,
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
      if(data.code==='CATALOG_CHANGED') void refreshCatalog()
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

      // The server only accepts authenticated orders and derives ownership there.
      if(data.readyForPayment&&data.id){
        showToast('تم إنشاء طلبك — أكمل الدفع')
        router.push(`/payment/${data.id}`)
        return
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

  useEffect(() => {
    if (!focusResumedStep.current || loading || catsLoading || pendingQuote || (activeSection !== 3 && !priceChanged)) return
    focusResumedStep.current = false
    document.getElementById(`request-heading-${activeSection}`)?.focus()
  }, [activeSection, catsLoading, loading, pendingQuote, priceChanged])

  function goToStep(index: number) {
    if (submitting) return
    if (index === 3 && !isLoggedIn) {
      setShowAccountOptions(true)
      requestAnimationFrame(() => document.getElementById('request-account-heading')?.focus())
      return
    }
    if (index >= 3) setGuestSubtotal(null)
    setShowAccountOptions(false)
    setTermsAccepted(false)
    setOpenSection(index)
    requestAnimationFrame(() => document.getElementById(`request-heading-${index}`)?.focus())
  }

  function preserveGuestSelection() {
    try {
      sessionStorage.setItem(GUEST_SELECTION_KEY, JSON.stringify({
        ...guestDraft,
        packageLink: appliedPackageLink.current,
        savedAt: Date.now(),
        resumeAfterLogin: true,
        subtotal: checkoutSubtotal,
      }))
      return true
    } catch {
      showToast('تعذّر حفظ اختيارك. اسمح بتخزين بيانات الموقع ثم حاول مرة أخرى.', 'error')
      return false
    }
  }

  if (loading || catsLoading || !hydrated) return <LoadingSpinner size="lg" />
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

  function renderReview() {
    const summaryTitle = requestType === 'campaign'
      ? `حملة من ${campaignPosts.length} منشورات`
      : details.title
    const totalLabel = membershipMode ? 'رصيد واحد' : checkoutTotalAfterRecovery != null
      ? `${checkoutTotalAfterRecovery.toLocaleString('ar-SA')} ر.س`
      : 'سيصلك عرض سعر بعد المراجعة'
    const canSelectExtras = showPackages && requestType === 'single' && (selectedPackage === 'basic' || selectedPackage === 'v2_basic') && estimatedTotal != null

    return (
      <div className={styles.reviewGrid}>
        <div className="min-w-0 space-y-3">
          <section className="bg-card border border-border rounded-2xl p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-black text-dark">الخبر</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => goToStep(3)}>تعديل</Button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4"><span className="text-muted">نوع الطلب</span><span className="font-bold text-dark">{requestType === 'campaign' ? 'حملة متعددة' : 'منشور واحد'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted">المحتوى</span><span className="font-bold text-dark text-left">{summaryTitle}</span></div>
              {details.preferredDate && requestType === 'single' && (
                <div className="flex justify-between gap-4"><span className="text-muted">موعد النشر</span><span className="font-bold text-dark">{details.preferredDate}</span></div>
              )}
              {selectedCat && <div className="flex justify-between gap-4"><span className="text-muted">نوع الخبر</span><span>{selectedCat.name_ar}</span></div>}
            </div>
            {requestType === 'single' && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{details.content}</p>}
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

          {showPackages && selectedPackageData && (
            <section className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="font-black text-dark">الباقة والقنوات</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => goToStep(2)}>تعديل</Button>
              </div>
              <strong className="block">{selectedPackageData.name}</strong>
              <p className="mt-2 text-sm text-muted">{(chosenV2 ? chosenChannels : basicNeedsChannel && basicChannel ? [basicChannel] : channels).map(ch => CHANNEL_LABELS[ch] ?? ch).join('، ')}</p>
            </section>
          )}

          <section className="rounded-2xl border border-border p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-black">التواصل والمرفقات</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => goToStep(3)}>تعديل</Button>
            </div>
            <p className="break-words text-sm leading-7">{[contact.fullName, contact.email, contact.phone].filter(Boolean).join(' · ')}</p>
            {requestType === 'single' && <p className="mt-1 text-sm text-muted">صور الخبر ({details.images.length}) · المرفقات الداعمة ({details.supportingDocuments?.length ?? 0})</p>}
          </section>

          {canSelectExtras && (
            <details className={styles.guidance}>
              <summary>إضافات اختيارية</summary>
              <RStepExtras
                selected={effectiveExtras}
                onChange={setSelectedExtras}
                basePrice={estimatedTotal}
                baseLabel="سعر الباقة الأساسية"
                included={chosenV2?.includedExtras}
                options={catalogExtras}
              />
            </details>
          )}
        </div>
        <div className="min-w-0 space-y-3">
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
              <label className={fieldLabel} htmlFor="request-discount">رمز الخصم</label>
              <input id="request-discount"
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
          <details className={styles.guidance}>
            <summary>الشروط والأحكام وسياسة الخصوصية</summary>
            <p className="whitespace-pre-line pb-4 text-sm leading-7">{siteContent.terms_text}</p>
          </details>
          <label className="flex min-h-12 items-center gap-3 text-sm">
            <input type="checkbox" className="size-5" checked={termsAccepted} onChange={event => setTermsAccepted(event.target.checked)} />
            أوافق على الشروط وإرسال الطلب
          </label>
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-[11px] font-medium leading-5 text-red-700">
            <strong>إقرار وإخلاء مسؤولية:</strong> بإرسال الطلب، يقر مقدم الطلب بأن جميع البيانات والمعلومات والمستندات والصور المقدمة صحيحة ودقيقة ومصرح له باستخدامها ونشرها، ويتحمل وحده كامل المسؤولية القانونية عن صحتها ومشروعيتها وعدم مخالفتها لحقوق الغير. ولا تتحمل شركة تواصل النخبة للدعاية والإعلان أو حساب «أول سعودي» أي مسؤولية قانونية أو تعويضية ناشئة عن عدم صحة أو دقة أو اكتمال البيانات المقدمة.
          </p>
          <Button type="button" onClick={handleSubmit} loading={submitting} disabled={!canSubmit || !termsAccepted || submitting} className="w-full" size="lg">
            {membershipMode ? 'إرسال الطلب من رصيد العضوية' : showPackages ? 'المتابعة إلى الدفع' : 'إرسال الطلب للمراجعة'}
          </Button>
        </div>
      </div>
    )
  }

  const competitionPositions = competitionSelection?.subcategory
    ? getCompetitionPositions(competitionSelection.subcategory)
    : []

  // اختيار نوع الطلب / الصفة عبر البطاقات — بنفس آثار القوائم المنسدلة السابقة
  const selectRequestType = (v: RequestType) => {
    setRequestType(v)
    setSelectedPackage(null); setBasicChannel(null); setReachChannels([])
    if (v === 'campaign') {
      setCategory(null); setSubOption(null); setCompetitionSelection(null)
      setSelectedExtras([])
    }
  }
  const selectClientType = (v: ClientType) => {
    if (clientType !== v) {
      setCategory(null); setSubOption(null); setCompetitionSelection(null)
      setSelectedPackage(null); setBasicChannel(null); setReachChannels([])
      setCampaignPosts(prev => prev.map(p => ({ ...p, category: '', subOption: null })))
    }
    if (v !== 'individual') {
      setSelectedExtras([])
      setDiscountCode('')
    }
    setClientType(v)
  }

  const includePackageStep = showPackages || (!membershipMode && !effectiveClientType)
  const steps = [
    { id: 0, label: 'الصفة', ready: true, next: 'متابعة إلى نوع الخبر' },
    { id: 1, label: 'نوع الخبر', ready: identityComplete, next: showPackages ? 'متابعة إلى الباقات' : 'متابعة إلى تفاصيل الخبر' },
    ...(includePackageStep ? [{ id: 2, label: 'الباقة والقنوات', ready: identityComplete && aboutComplete, next: 'متابعة إلى تفاصيل الخبر' }] : []),
    { id: 3, label: 'المحتوى والمرفقات', ready: identityComplete && aboutComplete && packagesComplete, next: 'مراجعة الطلب' },
    { id: 4, label: 'المراجعة', ready: canSubmit, next: '' },
  ]
  const currentIndex = Math.max(0, steps.findLastIndex(step => step.id <= activeSection && step.ready))
  const currentStep = steps[currentIndex]
  const previousStep = steps[currentIndex - 1]
  const nextStep = steps[currentIndex + 1]
  const position = `الخطوة ${currentIndex + 1} من ${steps.length}`

  const membershipAvailable = membershipWallet
    ? membershipWallet.total_credits - membershipWallet.reserved_credits - membershipWallet.used_credits
    : null

  // ── العرض ───────────────────────────────────────────────────────
  return (
    <div className={`request-screen ${styles.screen}`}>
      <div className={styles.container}>
        <div className={styles.intro}>
          {membershipMode && membershipAvailable != null && (
            <div className="mb-4 inline-flex items-center gap-3 rounded-lg border border-gold/30 bg-white/80 px-4 py-2 text-right shadow-sm lg:absolute lg:left-0 lg:top-0 lg:mb-0">
              <div><p className="text-[10px] font-bold text-muted">رصيد النشر المتبقي</p><p className="text-xs text-muted">بعد هذا الطلب: {Math.max(0, membershipAvailable - 1)}</p></div>
              <strong className="text-2xl text-green">{membershipAvailable}</strong>
            </div>
          )}
          <h1 className="text-2xl md:text-3xl font-black text-dark mb-1">تقديم طلب نشر</h1>
          <p>{membershipMode ? 'قدّم الخبر من رصيد عضويتك دون المرور بالدفع' : 'اختر نوع الخبر، وحدد الباقة والقنوات، ثم أضف تفاصيلك وراجع الطلب قبل إرساله.'}</p>
        </div>

        <nav className={styles.progress} aria-label="خطوات الطلب">
          <p><strong>{currentStep.label}</strong><span>{position}</span></p>
          <progress max={steps.length} value={currentIndex + 1} aria-label="الخطوة الحالية في طلب النشر" aria-valuetext={position} />
          <ol>
            {steps.map((step, index) => (
              <li key={step.id}>
                <button
                  type="button"
                  aria-controls={`request-section-${step.id}`}
                  aria-current={index === currentIndex ? 'step' : undefined}
                  data-state={index === currentIndex ? 'current' : index < currentIndex ? 'complete' : step.ready ? 'available' : 'upcoming'}
                  disabled={!step.ready || index === currentIndex || submitting}
                  onClick={() => goToStep(step.id)}
                >
                  <span aria-hidden="true" className={styles.stepNumber}>{index < currentIndex ? '✓' : index + 1}</span>
                  <span className={styles.stepLabel}>{step.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className={cn(membershipMode && !membershipPortalMode && 'lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-6 xl:gap-8')}>
        <div className={cn('min-w-0 mx-auto w-full', !membershipMode ? 'max-w-none' : membershipPortalMode ? 'max-w-3xl' : 'max-w-2xl lg:max-w-none lg:mx-0')}>
        <div className="space-y-3">

          <FormSection index={0} title="صفة مقدم الطلب" open={currentStep.id === 0}>
            <div className="space-y-4">
              {!membershipMode && <fieldset className={styles.roleGroup}>
                <legend>بأي صفة تقدّم الطلب؟</legend>
                <div className={styles.roleOptions}>
                  {CLIENT_TYPE_OPTIONS.map(option => (
                    <label key={option.id} data-selected={clientType === option.id}>
                      <input type="radio" name="request-client-type" value={option.id} checked={clientType === option.id} onChange={() => selectClientType(option.id)} />
                      <span><strong>{option.label}</strong><span>{option.desc}</span></span>
                    </label>
                  ))}
                </div>
                <p className="mt-3 text-sm text-muted">قد يؤثر اختيار صفة غير صحيحة على قبول الطلب وأهلية الاسترداد.</p>
              </fieldset>}

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

              {membershipMode && <p className="text-sm text-muted">الصفة مرتبطة بالعضوية الحالية.</p>}

            </div>
          </FormSection>
          <FormSection index={1} title="نوع الخبر وقنوات الناشر" open={currentStep.id === 1}>
            <div className="space-y-4">
              {selectedInf && <p className="text-sm text-muted">الناشر {selectedInf.name_ar}</p>}
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
                        aria-pressed={active}
                        className={cn(
                          'rounded-2xl border-2 p-4 text-center transition-all active:scale-[0.98]',
                          active ? 'border-green bg-green/5 ring-2 ring-green/20' : 'border-border bg-white hover:border-green/40',
                        )}
                      >
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

              {/* منشور واحد: الفئة + الخيار الفرعي */}
              {requestType === 'single' && (
                <>
                  <div>
                    <label htmlFor="request-news-category" className={fieldLabel}>نوع الخبر *</label>
                    <select
                      id="request-news-category"
                      value={category ?? ''}
                      onChange={e => {
                        setCategory(e.target.value || null)
                        if (selectedPackage === 'v2_career' && e.target.value !== 'cv') setSelectedPackage(null)
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

              {effectiveClientType && effectiveClientType!=='individual' && <p className="text-sm leading-7 text-muted">طلبات الجهات تُراجع وتُسعّر يدويًا. يصلك عرض السعر قبل الدفع.</p>}

            </div>
          </FormSection>
          {/* ③ اختيار الباقة — للأفراد، مع إبقاء مسار الحملات الحالي */}
          {includePackageStep && (
            <FormSection index={2} title="الباقة وقنوات النشر" open={currentStep.id === 2}>
              {priceChanged && (
                <p className={styles.guidance + ' py-3 text-sm'} role="status">
                  تغيّر السعر منذ حفظ اختيارك. راجع السعر الحالي للباقة قبل المتابعة.
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                {selectedCat && <p className="text-sm text-muted">{selectedCat.name_ar}{selectedInf ? ' · ' + selectedInf.name_ar : ''}</p>}
                {showPackages && (
                  <div className="ms-auto flex flex-col items-end gap-1">
                    <span className="rounded-full bg-[#eadcff] px-3 py-0.5 text-xs font-black text-[#3d1152]">تمارا</span>
                    <span className="text-xs text-muted">تقدر تقسّط المبلغ</span>
                  </div>
                )}
              </div>
              {requestType === 'campaign' && (
                <p className="text-xs text-muted mb-3 bg-cream rounded-lg p-2">
                  🚀 الباقة المختارة تنطبق على كل أخبار الحملة ({campaignPosts.length} منشورات) — السعر يشمل خصم الحملة {CAMPAIGN_DISCOUNT}%.
                </p>
              )}
              {requestType==='single'&&(!catalog||catalogError)&&<p role="status" className="mb-4 text-sm">{catalogError?'تعذر تحديث الباقات. حدّثها قبل المتابعة.':'جارٍ تحميل الباقات الحالية…'} <button type="button" className="underline" onClick={()=>refreshCatalog()}>تحديث الباقات</button></p>}
              {requestType==='single' ? <PackageComparison
                packages={singlePackages.filter(p=>!p.requiredCategory || p.requiredCategory===category)}
                selected={selectedPackage}
                prices={Object.fromEntries(singlePackages.map(p=>[p.id,basicDynamicPrice==null?null:packagePrice(basicDynamicPrice,p,category)]))}
                availableChannels={availableChannels}
                onSelect={id=>{setSelectedPackage(id);if(id!=='v2_basic')setSelectedExtras([])}}
              /> : (
              <div data-package-grid className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {offeredPackages.map(pkg => {
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
                    pkgPrice = getIndividualPackage(pkg.id,singlePackages) ? packagePrice(basicDynamicPrice, getIndividualPackage(pkg.id,singlePackages)!, category) : Math.round(basicDynamicPrice * pkg.priceMultiplier)
                  }
                  if (getIndividualPackage(pkg.id,singlePackages)?.fixedPrice != null) pkgPrice = getIndividualPackage(pkg.id,singlePackages)!.fixedPrice!
                  const priceLabel = pkgPrice != null ? `${pkgPrice} ر.س` : 'يُحسب بعد تفاصيل الحملة'
                  const postPrice = pkgPrice == null
                    ? null
                    : pkgPrice / (requestType === 'campaign' ? Math.max(campaignPosts.length, 1) : 1)
                  const visibleFeatures = getIndividualPackage(pkg.id,singlePackages) ? pkg.features : getPackageFeaturesForPostPrice(pkg, postPrice)
                  return (
                    <button
                      type="button"
                      key={pkg.id}
                      onClick={() => {
                        setSelectedPackage(pkg.id)
                        if (pkg.id !== 'basic' && pkg.id !== 'v2_basic') setSelectedExtras([])
                        if (pkg.id === 'v2_career') { setCategory('cv'); setSubOption(null); setCompetitionSelection(null) }
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
                          اختيار مقترح
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
                      <ul className="space-y-1.5 mt-3">
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

              )}
              {showPackages && selectedPackageData && (chosenV2 || basicNeedsChannel) && (
                <fieldset className={styles.channelGroup}>
                  <legend>القنوات — {selectedPackageData.name}</legend>
                  <p>{chosenV2?.channels ? 'القنوات المشمولة' : basicNeedsChannel ? 'اختر قناة واحدة' : 'اختر ' + chosenV2?.channelCount + ' من القنوات المختلفة'}</p>
                  {availableChannels.length === 0 && <p>لا توجد قنوات متاحة لهذا الحساب</p>}
                  <div className={styles.channelOptions}>
                    {availableChannels.map(channel => {
                      const fixed = !!chosenV2?.channels
                      const checked = fixed ? chosenChannels.includes(channel)
                        : basicNeedsChannel ? basicChannel === channel : reachChannels.includes(channel)
                      return <label key={channel}>
                        <input
                          type={basicNeedsChannel ? 'radio' : 'checkbox'}
                          name="request-channel"
                          value={channel}
                          checked={checked}
                          disabled={fixed || (!basicNeedsChannel && !checked && reachChannels.length >= (chosenV2?.channelCount ?? 0))}
                          onChange={() => {
                            if (basicNeedsChannel) setBasicChannel(channel)
                            else setReachChannels(current => checked ? current.filter(item => item !== channel) : [...current, channel])
                          }}
                        />
                        <span>{CHANNEL_LABELS[channel] ?? channel}</span>
                      </label>
                    })}
                  </div>
                </fieldset>
              )}
              {chosenV2 && !validV2Channels && <p role="status" className="mt-3 text-sm">أكمل اختيار القنوات المطلوبة للباقة.</p>}
            </FormSection>
          )}
          {/* ④ تفاصيل المحتوى — بعد الباقة، أو مباشرة للجهات */}
          <FormSection index={3} title="تفاصيل الخبر" open={currentStep.id === 3}>
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
                <details className={styles.guidance}>
                  <summary>متطلبات قبول الخبر</summary>
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
                </details>
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
                <RStep3Details
                  data={details}
                  onChange={setDetails}
                  contact={!isLoggedIn ? <RStep5Contact data={contact} onChange={setContact} /> : null}
                />
                {membershipMode && membershipBenefits.length > 0 && (
                  <MembershipBenefitPicker
                    wallets={membershipBenefits}
                    value={selectedMembershipBenefits}
                    onChange={setSelectedMembershipBenefits}
                  />
                )}
              </>
            )}

              {showPackages && chosenV2?.id === 'v2_career' && <fieldset className="mt-4 border border-border rounded-xl p-4 space-y-4"><legend className="font-bold">البيانات المهنية المطلوبة</legend>
                <p className="text-xs leading-6 text-muted">أكمل بياناتك المهنية وفق المزايا المعروضة للباقة. لا تتضمن الخدمة ضمان التوظيف.</p>
                <label className="block text-sm">لغة السيرة<select value={career.language} onChange={e => setCareer(v => ({ ...v, language: e.target.value }))} className="block w-full border border-border rounded-lg p-3 mt-2"><option value="ar">العربية</option><option value="en">الإنجليزية</option></select></label>
                {([['goal','الهدف المهني'],['experience','الخبرات أو الأنشطة والمشاريع'],['education','المؤهلات والتعليم']] as const).map(([key,label]) => <label className="block text-sm" key={key}>{label} *<textarea maxLength={6000} value={career[key]} onChange={e => setCareer(v => ({ ...v, [key]: e.target.value }))} className="block w-full border border-border rounded-lg p-3 mt-2" /></label>)}
              </fieldset>}
            {requestType === 'campaign' && !isLoggedIn && (
              <section className="mt-6 border-t border-border pt-5"><RStep5Contact data={contact} onChange={setContact} /></section>
            )}

          </FormSection>
          <FormSection index={4} title="مراجعة الطلب" open={currentStep.id === 4}>
            {currentStep.id === 4 && renderReview()}
          </FormSection>
          {showAccountOptions && !isLoggedIn && nextStep?.id === 3 && nextStep.ready && (
            <section id="request-account-options" className={styles.panel} aria-labelledby="request-account-heading">
              <h2 id="request-account-heading" tabIndex={-1}>أكمل طلبك بحسابك</h2>
              <p className="mb-4 text-sm">سجّل الدخول أو أنشئ حسابًا للمتابعة إلى المحتوى والمرفقات. سنحتفظ باختيارك.</p>
              {selectedPackageData && (
                <p className="mb-4 text-sm font-bold">
                  {selectedPackageData.name}
                  {checkoutSubtotal != null && ` · ${checkoutSubtotal.toLocaleString('ar-SA')} ر.س`}
                </p>
              )}
              <div className="mb-3 max-w-xs">
                <GoogleSignIn next={REQUEST_AFTER_LOGIN} beforeSignIn={preserveGuestSelection} />
              </div>
              <div className={styles.accountActions}>
                <Link href={`/auth/register?next=${encodeURIComponent(REQUEST_AFTER_LOGIN)}`} onClick={event => { if (!preserveGuestSelection()) event.preventDefault() }}>إنشاء حساب</Link>
                <Link href={`/auth/login?next=${encodeURIComponent(REQUEST_AFTER_LOGIN)}`} onClick={event => { if (!preserveGuestSelection()) event.preventDefault() }}>تسجيل الدخول</Link>
              </div>
            </section>
          )}
          <div className={styles.actions}>
            {previousStep && <Button type="button" variant="outline" disabled={submitting} onClick={() => goToStep(previousStep.id)}>السابق</Button>}
            {nextStep && <Button type="button" disabled={!nextStep.ready} onClick={() => goToStep(nextStep.id)}
              aria-expanded={nextStep.id === 3 && !isLoggedIn ? showAccountOptions : undefined}
              aria-controls={nextStep.id === 3 && !isLoggedIn && showAccountOptions ? 'request-account-options' : undefined}>
              {currentStep.next}
            </Button>}
          </div>
        </div>
        </div>

        {membershipMode && !membershipPortalMode && <aside className="hidden lg:block sticky top-28">
            <div className="overflow-hidden rounded-lg border border-gold/40 bg-dark p-6 text-white shadow-xl">
              <p className="text-xs font-bold text-gold">طلب ضمن العضوية</p>
              <h2 className="mt-2 text-2xl font-black">رصيدك يغطي هذا الطلب</h2>
              <p className="mt-3 text-sm leading-7 text-white/65">لن يظهر دفع أو اختيار باقة. بعد الإرسال يُحجز رصيد واحد حتى تبدأ الإدارة التنفيذ.</p>
              <div className="my-5 border-y border-white/10 py-4"><strong className="text-3xl text-gold">1</strong><span className="mr-2 text-sm text-white/60">رصيد لهذا المنشور</span></div>
              <button type="button" onClick={() => router.push('/dashboard/membership')} className="w-full rounded-lg border border-white/20 px-4 py-3 text-sm font-bold hover:bg-white/10">العودة إلى عضويتي</button>
            </div>
        </aside>}
      </div>
        <div className="mt-5"><RequestReviewsTrust /></div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useCategories, useSiteContent, type DBCategory, type SiteContent } from '@/lib/hooks'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import type { Influencer } from '@/components/pricing/StepInfluencer'
import type { RequestType } from './RStepRequestType'
import type { ClientType } from './RStep1ClientType'
import type { CampaignSetup } from './RStepCampaignSetup'
import RStep3Details from './RStep3Details'
import { type ContactData } from './RStep5Contact'
import { TERMS_TEXT } from './RStep6Terms'
import RStepCampaignPosts, { type CampaignPostData, makeEmptyPost, isPostComplete } from './RStepCampaignPosts'
import SuccessScreen from './SuccessScreen'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import { COMPETITION_SUBCATEGORIES, getCompetitionPositions, PACKAGES, CATEGORY_CONDITIONS } from '@/lib/constants'
import { calculateAutoQuote } from '@/lib/auto-quote'

// القيم الافتراضية لمحتوى الموقع (تُستخدم حتى يصل المحتوى المعدَّل من القاعدة)
const SITE_CONTENT_FALLBACK: SiteContent = {
  terms_text: TERMS_TEXT,
  news_conditions_general: [
    'أن يتضمّن الخبر إنجازاً واقعياً مع إرفاق كل الإثباتات.',
    'إن ذُكرت «أوّلية» (الأول/الأولى) فيلزم إرفاق ما يُثبتها (إيميل أو خطاب أو مراسلة رسمية).',
    'إن ذُكرت جهة فيلزم إرفاق موافقتها على النشر.',
  ],
  news_conditions_footer: 'عدم الالتزام بذلك سيؤدي إلى إلغاء الخبر.',
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
  { id: 'charity',    icon: '❤️', label: 'جمعية خيرية' },
  { id: 'agency',     icon: '📣', label: 'وكالة دعاية' },
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
  const router = useRouter()
  const { showToast } = useToast()
  const { categories, loading: catsLoading } = useCategories()
  // محتوى الموقع القابل للتعديل من لوحة الأدمن (الشروط + شروط قبول الخبر)
  const siteContent = useSiteContent(SITE_CONTENT_FALLBACK)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [requestNumber, setRequestNumber] = useState('')
  const [influencers, setInfluencers] = useState<Influencer[]>([])
  const [loading, setLoading] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  const draftRestored = useRef(false)
  // طلب قائم بانتظار موافقة العميل — يمنع تقديم طلب جديد
  const [pendingQuote, setPendingQuote] = useState<{ id: string } | null>(null)

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
  // الخدمات الإضافية لم تَعُد تُختار أثناء الإرسال — تُعرض على العميل بعد وصول العرض
  const selectedExtras: string[] = []
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
  // الوكالة ترى نفس فئات الأفراد (كل أنواع الأخبار)
  const effectiveClientType = clientType === 'agency' ? 'individual' : clientType
  const availableCategories = effectiveClientType
    ? categories.filter(c => !c.client_types || c.client_types.includes(effectiveClientType))
    : categories
  const selectedInf = influencers.find(i => i.id === selectedInfluencer) ?? null

  // قنوات الحساب المتاحة (لاختيار قناة الباقة الأساسية)
  const availableChannels: string[] = selectedInf
    ? [
        selectedInf.x_followers  ? 'x'  : null,
        selectedInf.ig_followers ? 'ig' : null,
        selectedInf.li_followers ? 'li' : null,
        selectedInf.tk_followers ? 'tk' : null,
      ].filter(Boolean) as string[]
    : []

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
        // فحص وجود عرض قائم بانتظار موافقة العميل
        supabase
          .from('publish_requests')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'quoted')
          .order('created_at', { ascending: false })
          .limit(1)
          .then(({ data }) => {
            if (data && data.length > 0) setPendingQuote({ id: data[0].id })
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
          if (d.contact)              setContact(d.contact)
          if (d.orgInfo)              setOrgInfo(d.orgInfo)
          if (d.campaignSetup)        setCampaignSetup(d.campaignSetup)
          if (d.selectedPackage)      setSelectedPackage(d.selectedPackage)
          if (d.basicChannel)         setBasicChannel(d.basicChannel)
          if (Array.isArray(d.campaignPosts) && d.campaignPosts.length) setCampaignPosts(d.campaignPosts)
          showToast('تم استرجاع طلبك غير المكتمل ✨', 'info')
        }
      }
    } catch { /* مسودة تالفة — نتجاهلها */ }
    setHydrated(true)
  }, [showToast])

  // ── عند اختيار الحساب: النشر تلقائياً على كل قنواته المتاحة ───
  // السعر موحّد لكل القنوات، فلا حاجة لاختيار القناة يدوياً
  useEffect(() => {
    if (!selectedInf) return
    const available = [
      selectedInf.x_followers  ? 'x'  : null,
      selectedInf.ig_followers ? 'ig' : null,
      selectedInf.li_followers ? 'li' : null,
      selectedInf.tk_followers ? 'tk' : null,
    ].filter(Boolean) as string[]
    setChannels(available)
  }, [selectedInf])

  // ── حفظ المسودة تلقائياً بعد أي تغيير ───────────────────────────
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        savedAt: Date.now(),
        selectedInfluencer, requestType, clientType, category, subOption,
        competitionSelection, details, channels, contact, orgInfo,
        campaignSetup, campaignPosts, selectedPackage, basicChannel,
      }))
    } catch { /* تجاوز سعة التخزين — نتجاهل بهدوء */ }
  }, [
    hydrated, selectedInfluencer, requestType, clientType, category, subOption,
    competitionSelection, details, channels, contact, orgInfo,
    campaignSetup, campaignPosts, selectedPackage,
  ])

  // ملاحظة: بيانات التواصل تُحمَّل تلقائياً من بروفايل الحساب وتُرسَل مع الطلب،
  // دون عرض حقول إدخال — لأنها مُسجّلة مسبقاً عند إنشاء الحساب.

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


  // ── الباقات تُعرض للأفراد (المنشور الواحد + الحملة) ───────────────
  const showPackages = clientType === 'individual'
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
          subOption: (p as any).subOption ?? null,
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

  // بيانات تواصل الضيف (الزائر غير المسجَّل) — إلزامية لإنشاء حسابه ومتابعة طلبه.
  const emailValid = /^\S+@\S+\.\S+$/.test(contact.email.trim())
  const contactComplete = isLoggedIn || (
    contact.fullName.trim().length >= 3 &&
    contact.phone.trim().replace(/\D/g, '').length >= 9 &&
    emailValid
  )

  const sectionComplete = [aboutComplete, contentComplete, packagesComplete, contactComplete]
  const canSubmit = sectionComplete.every(Boolean)

  // أول متطلب ناقص — يُعرض كتلميح فوق زر الإرسال
  const missingHint = (): string | null => {
    if (!requestType) return 'اختر نوع الطلب'
    if (!clientType) return 'اختر صفة مقدّم الطلب'
    if (clientType !== 'individual' && orgInfo.name.trim() === '') return 'أدخل اسم الجهة'
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
          client_type:      clientType,
          org_name:           clientType !== 'individual' ? (orgInfo.name.trim() || null) : null,
          org_representative: clientType !== 'individual' ? (orgInfo.representative.trim() || null) : null,
          org_license:        clientType !== 'individual' ? (orgInfo.license.trim() || null) : null,
          channels,
          selected_extras:  selectedExtras,
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
          org_name:           clientType !== 'individual' ? (orgInfo.name.trim() || null) : null,
          org_representative: clientType !== 'individual' ? (orgInfo.representative.trim() || null) : null,
          org_license:        clientType !== 'individual' ? (orgInfo.license.trim() || null) : null,
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
          selected_package: showPackages ? selectedPackage : null,
          basic_channel: showPackages && selectedPackage === 'basic' ? basicChannel : null,
        }
      }

      const res = await fetch('/api/submit-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'حدث خطأ')

      try { localStorage.removeItem(DRAFT_KEY) } catch { /* تجاهل */ }

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

  if (loading || catsLoading) return <LoadingSpinner size="lg" />
  if (success) return <SuccessScreen requestNumber={requestNumber} />

  // طلب قائم بانتظار الموافقة — يُمنع تقديم طلب جديد حتى اتخاذ إجراء
  if (pendingQuote) {
    return (
      <div className="bg-cream min-h-screen flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-card rounded-2xl border-2 border-amber-200 p-7 text-center shadow-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-50 flex items-center justify-center text-3xl">
            ⏳
          </div>
          <h2 className="text-xl font-black text-dark mb-2">لديك عرض بانتظار موافقتك</h2>
          <p className="text-sm text-muted leading-relaxed mb-1">
            لا يمكنك تقديم طلب جديد ولديك عرض قائم لم يُتّخذ بشأنه إجراء بعد.
          </p>
          <p className="text-sm text-muted leading-relaxed mb-6">
            يُرجى مراجعة عرضك الحالي واتخاذ الإجراء المناسب — بالموافقة أو الرفض أو طلب التفاوض — ثم يمكنك تقديم طلب جديد.
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={() => router.push(`/dashboard/${pendingQuote.id}`)} className="w-full" size="lg">
              مراجعة العرض القائم
            </Button>
            <Button variant="outline" onClick={() => router.push('/dashboard')} className="w-full">
              الذهاب إلى لوحة التحكم
            </Button>
          </div>
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
    if (v === 'campaign') { setCategory(null); setSubOption(null); setCompetitionSelection(null) }
  }
  const selectClientType = (v: ClientType) => {
    if (clientType !== v) {
      setCategory(null); setSubOption(null); setCompetitionSelection(null)
      setCampaignPosts(prev => prev.map(p => ({ ...p, category: '', subOption: null })))
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

  // ── العرض ───────────────────────────────────────────────────────
  return (
    <div className="bg-cream min-h-screen pb-28">
      <div className="max-w-2xl mx-auto w-full px-4 pt-6">
        <div className="text-center mb-5">
          <h1 className="text-2xl md:text-3xl font-black text-dark mb-1">طلب نشر جديد</h1>
          <p className="text-sm text-muted">عبّئ بياناتك بسرعة — وبمجرد الإرسال يظهر سعرك ويصلك العرض</p>
        </div>

        {/* شريط التقدّم */}
        <div className="mb-5">
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
                <label className={fieldLabel}>نوع الطلب *</label>
                <div className="grid grid-cols-2 gap-3">
                  {REQUEST_TYPE_OPTIONS.map(o => {
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

              <div>
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
                <p className="text-xs text-amber-600 mt-2">⚠️ يجب اختيار الصفة الصحيحة تجنباً لإلغاء الطلب</p>
              </div>

              {/* بيانات الجهة — لغير الأفراد (شركة / حكومة / جمعية / وكالة) */}
              {clientType && clientType !== 'individual' && (
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
            {/* شروط قبول الخبر — قاعدة عامة + شرط الفئة (للمنشور المفرد) — تُدار من لوحة الأدمن */}
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] leading-6 text-red-600">
              <p className="font-bold mb-1">⚠️ شروط قبول الخبر:</p>
              <ul className="list-disc pr-4 space-y-0.5">
                {siteContent.news_conditions_general.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
                {requestType === 'single' && category && siteContent.category_conditions[category] && (
                  <li><span className="font-bold">حسب الفئة:</span> {siteContent.category_conditions[category]}</li>
                )}
              </ul>
              {siteContent.news_conditions_footer && (
                <p className="font-bold mt-1">{siteContent.news_conditions_footer}</p>
              )}
            </div>

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
              <RStep3Details data={details} onChange={setDetails} />
            )}

            <div className="flex justify-end pt-4">
              <Button size="sm" onClick={() => setOpenSection(showPackages ? 2 : 3)} disabled={!contentComplete}>
                التالي ←
              </Button>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {PACKAGES.map(pkg => {
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
                  return (
                    <button
                      type="button"
                      key={pkg.id}
                      onClick={() => setSelectedPackage(pkg.id)}
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
                        {pkg.features.map((f, i) => {
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
                <Button size="sm" onClick={() => setOpenSection(3)} disabled={!packagesComplete}>
                  التالي ←
                </Button>
              </div>
            </FormSection>
          )}

          {/* بيانات التواصل — للزائر غير المسجَّل فقط (يُنشأ حسابه تلقائياً عند الإرسال) */}
          {!isLoggedIn && (
            <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
              <h3 className="font-bold text-dark">👤 بياناتك للتواصل</h3>
              <p className="text-xs text-muted -mt-1">يُنشأ حسابك تلقائياً بهذه البيانات لمتابعة طلبك وإشعارك بالعرض والدفع.</p>
              <input value={contact.fullName} onChange={e => setContact(p => ({ ...p, fullName: e.target.value }))}
                placeholder="الاسم الكامل *" className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm" />
              <input value={contact.phone} onChange={e => setContact(p => ({ ...p, phone: e.target.value }))}
                placeholder="رقم الجوال *" inputMode="tel" className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm" />
              <input value={contact.email} onChange={e => setContact(p => ({ ...p, email: e.target.value }))}
                placeholder="البريد الإلكتروني *" type="email" inputMode="email"
                className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm" />
              <input value={contact.city} onChange={e => setContact(p => ({ ...p, city: e.target.value }))}
                placeholder="المدينة (اختياري)" className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm" />
            </div>
          )}

        </div>
      </div>

      {/* شريط الإرسال الثابت */}
      <div className="fixed bottom-0 inset-x-0 bg-card/95 backdrop-blur-md border-t border-border px-4 py-3">
        <div className="max-w-2xl mx-auto">
          {!canSubmit && missingHint() && (
            <p className="text-xs text-muted text-center mb-2">⬑ {missingHint()}</p>
          )}
          {/* الموافقة على الشروط ضمنية بالإرسال — مع رابط لعرضها */}
          <p className="text-[11px] text-muted text-center mb-2 leading-relaxed">
            بالضغط على الزر أدناه فإنك توافق على{' '}
            <button
              type="button"
              onClick={() => setShowTerms(true)}
              className="text-green font-medium underline hover:text-green/80"
            >
              الشروط والأحكام وسياسة الخصوصية
            </button>
          </p>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            loading={submitting}
            className="w-full"
          >
            {submitting
              ? (clientType === 'individual' ? 'جارٍ التجهيز...' : 'جارٍ إرسال طلبك...')
              : (clientType === 'individual' ? '💳 المتابعة إلى الدفع' : 'إرسال الطلب للمراجعة')}
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

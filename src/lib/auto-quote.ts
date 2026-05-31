// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTO-QUOTE ENGINE — جدول الأسعار المعتمد
// السعر = الأساسي + الإضافات
// لا حاجة لـ AI — التسعير مبني على الفئة + الفئة الفرعية + نوع العميل
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { EXTRAS } from '@/lib/constants'

// لا يوجد ضريبة قيمة مضافة في هذا النظام
export const AQ_VAT = 0

// ─── معامل القنوات ───
// السعر ثابت بغضّ النظر عن عدد القنوات: المعامل = 1 دائماً مهما تعددت القنوات.
// (CHANNEL_RATE = 0 ⇒ لا توجد زيادة على القنوات الإضافية)
export const CHANNEL_RATE = 0

export function channelMultiplier(channelCount: number | null | undefined): number {
  const n = Math.max(1, Math.floor(channelCount || 1))
  return 1 + CHANNEL_RATE * (n - 1)
}

// ─── أسعار الخدمات الإضافية (مصدر الحقيقة: constants.ts → EXTRAS) ───
// يُشتق تلقائياً من EXTRAS لضمان التزامن دائماً مع القائمة الرئيسية
export const AQ_EXTRAS_PRICES: Record<string, number> = Object.fromEntries(
  EXTRAS.map(e => [e.id, e.price])
)

export const AQ_EXTRAS_NAMES: Record<string, string> = {
  bilingual:    'صياغة المحتوى باللغتين',
  mention:      'منشن لحساب المستخدم',
  story:        'ستوري انستغرام وتيك توك',
  encyclopedia: 'إضافة لقاعدة بيانات أول سعودي First1saudi.net',
  pin6:         'تثبيت 6 ساعات في X و LinkedIn',
  pin12:        'تثبيت 12 ساعة في X و LinkedIn',
  repost:       'رتويت للمنشور بعد يوم أو يومين',
  campaign:     'حملة ترويجية متكاملة',
  video:        'تصميم مقطع فيديو شخصي موشن جرافيك',
  report:       'تقرير الأداء',
  infographic:  'تصميم إنفوجرافيك',
}

export const AQ_EXTRAS_ICONS: Record<string, string> = {
  bilingual:    '✍️',
  mention:      '🔔',
  story:        '📱',
  encyclopedia: '📖',
  pin6:         '📌',
  pin12:        '📍',
  repost:       '🔄',
  campaign:     '📣',
  video:        '🎬',
  report:       '📊',
  infographic:  '🎨',
}

// قائمة الإضافات المتاحة للعميل (مرتبة حسب الأهمية)
export const AQ_EXTRAS_LIST = [
  'bilingual', 'mention', 'story', 'repost',
  'video', 'infographic', 'campaign',
  'pin6', 'pin12', 'encyclopedia', 'report',
]

// ─── جدول الأسعار الأساسية (بدون VAT) ───
// individual = فرد | business = شركة | government = حكومة | charity = خيرية

type ClientType = 'individual' | 'business' | 'government' | 'charity' | 'agency'
type ClientPrices = Partial<Record<ClientType, number>>

// وكالة الدعاية والإعلان: السعر = سعر الفرد × 3
export const AGENCY_MULTIPLIER = 3

// الفئات البسيطة (بدون فئات فرعية تؤثر على السعر)
const SIMPLE_BASE: Record<string, ClientPrices> = {
  books:       { individual: 699,  business: 2000 },
  research:    { individual: 799,  business: 2500 },
  certs:       { individual: 1300 },
  graduation:  { individual: 799  },
  appointment: { individual: 899,  business: 2500, government: 5000 },
  award:       { individual: 599,  business: 2000 },
  cv:          { individual: 799  },
  product:     { business: 2500 },
  charity:     { charity: 999 },
  government:  { government: 4500 },
}

// مسابقات: نوع المسابقة × المركز
const COMPETITION_BASE: Record<string, Record<string, number>> = {
  international: {
    first:         499,
    second:        699,
    third:         699,
    top_10:        599,
    top_50:        499,
    participation: 499,
  },
  local: {
    first:         599,
    second:        549,
    third:         549,
    top_10:        499,
    top_50:        499,
    participation: 499,
  },
  hackathon: {
    first:         599,
    second:        549,
    third:         549,
    finalist:      499,
    participation: 499,
  },
}

// اختراعات
const INVENTION_BASE: Record<string, number> = {
  with_patent: 499,
  no_patent:   699,
}

// ─── Types ───

export interface AQInput {
  category: string
  subOption?: string | { subcategory: string; position: string } | null
  clientType?: string | null
  selectedExtras: string[]
  channelCount?: number      // عدد القنوات المختارة (افتراضي 1)
}

export interface AQResult {
  singleChannelBase: number  // السعر الأساسي لقناة واحدة (قبل معامل القنوات)
  channelCount: number
  channelMultiplier: number
  channelSurcharge: number   // الزيادة الناتجة عن القنوات الإضافية
  basePrice: number          // الأساسي بعد معامل القنوات (= singleChannelBase + channelSurcharge)
  extrasBreakdown: { id: string; name: string; price: number }[]
  extrasTotal: number
  subtotal: number
  vatAmount: number
  total: number
}

// ─── مساعد: تحليل sub_option من قاعدة البيانات ───
// sub_option يُخزَّن كـ JSON string في DB للمسابقات — يجب تحويله قبل الإرسال لـ calculateAutoQuote
export function parseSubOption(
  raw: string | object | null | undefined
): AQInput['subOption'] {
  if (!raw) return null
  if (typeof raw === 'object') return raw as { subcategory: string; position: string }
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as { subcategory: string; position: string }
    }
    return parsed as string
  } catch {
    return raw  // إذا لم يكن JSON صالحاً → استخدمه كـ string عادي
  }
}

// ─── حملة: ثوابت وأنواع ─────────────────────────────────────────

export const CAMPAIGN_DISCOUNT_PCT = 30

export interface CampaignPostInput {
  category: string
  subOption?: AQInput['subOption']
  clientType?: string | null
}

export interface CampaignQuoteResult {
  posts: Array<{ index: number; category: string; basePrice: number; singleChannelBase: number }>
  channelCount: number
  channelMultiplier: number
  channelSurcharge: number       // إجمالي زيادة القنوات عبر كل المنشورات
  singleChannelSubtotal: number  // مجموع المنشورات لقناة واحدة (قبل معامل القنوات)
  postsSubtotal: number          // مجموع المنشورات بعد معامل القنوات
  discountAmount: number
  discountPct: number
  afterDiscount: number
  extrasBreakdown: { id: string; name: string; price: number }[]
  extrasTotal: number
  total: number
}

export function calculateCampaignQuote(
  posts: CampaignPostInput[],
  selectedExtras: string[],
  discountPct: number = CAMPAIGN_DISCOUNT_PCT,
  channelCount: number = 1,
): CampaignQuoteResult {
  const postBreakdown = posts.map((p, i) => {
    const result = calculateAutoQuote({
      category: p.category,   // fallback 499 من calculateAutoQuote إذا كانت الفئة غير معروفة
      subOption: p.subOption,
      clientType: p.clientType,
      selectedExtras: [],
      channelCount,
    })
    return {
      index: i,
      category: p.category,
      basePrice: result.basePrice,
      singleChannelBase: result.singleChannelBase,
    }
  })

  const singleChannelSubtotal = postBreakdown.reduce((s, p) => s + p.singleChannelBase, 0)
  const postsSubtotal = postBreakdown.reduce((s, p) => s + p.basePrice, 0)
  const channelSurcharge = postsSubtotal - singleChannelSubtotal
  const discountAmount = Math.round(postsSubtotal * discountPct / 100)
  const afterDiscount = postsSubtotal - discountAmount

  const extrasBreakdown = selectedExtras
    .filter(id => AQ_EXTRAS_PRICES[id] !== undefined)
    .map(id => ({ id, name: AQ_EXTRAS_NAMES[id] ?? id, price: AQ_EXTRAS_PRICES[id] }))

  const extrasTotal = extrasBreakdown.reduce((s, e) => s + e.price, 0)
  const total = afterDiscount + extrasTotal

  return {
    posts: postBreakdown,
    channelCount: Math.max(1, Math.floor(channelCount || 1)),
    channelMultiplier: channelMultiplier(channelCount),
    channelSurcharge,
    singleChannelSubtotal,
    postsSubtotal,
    discountAmount,
    discountPct,
    afterDiscount,
    extrasBreakdown,
    extrasTotal,
    total,
  }
}

// ─── الدالة الرئيسية للاحتساب ───

export function calculateAutoQuote(input: AQInput): AQResult {
  const ct = (input.clientType ?? 'individual') as ClientType
  let singleChannelBase = 0

  if (input.category === 'competitions') {
    if (
      typeof input.subOption === 'object' &&
      input.subOption !== null &&
      'subcategory' in input.subOption &&
      'position' in input.subOption
    ) {
      singleChannelBase =
        COMPETITION_BASE[input.subOption.subcategory]?.[input.subOption.position] ?? 499
    } else {
      singleChannelBase = 499
    }
  } else if (input.category === 'inventions') {
    const so = typeof input.subOption === 'string' ? input.subOption : ''
    singleChannelBase = INVENTION_BASE[so] ?? 699
  } else {
    const prices = SIMPLE_BASE[input.category]
    // الوكالة تستخدم سعر الفرد كأساس (ثم يُضرب ×3 بالأسفل)
    const baseCt = ct === 'agency' ? 'individual' : ct
    singleChannelBase = prices?.[baseCt] ?? prices?.individual ?? 499
  }

  // وكالة الدعاية والإعلان: السعر = سعر الفرد × 3
  if (ct === 'agency') singleChannelBase = singleChannelBase * AGENCY_MULTIPLIER

  // تطبيق معامل القنوات على السعر الأساسي فقط (الإضافات لا تتأثر)
  const channelCount = Math.max(1, Math.floor(input.channelCount || 1))
  const channelMult = channelMultiplier(channelCount)
  const basePrice = Math.round(singleChannelBase * channelMult)
  const channelSurcharge = basePrice - singleChannelBase

  const extrasBreakdown = input.selectedExtras
    .filter(id => AQ_EXTRAS_PRICES[id] !== undefined)
    .map(id => ({ id, name: AQ_EXTRAS_NAMES[id] ?? id, price: AQ_EXTRAS_PRICES[id] }))

  const extrasTotal = extrasBreakdown.reduce((s, e) => s + e.price, 0)
  const subtotal = basePrice + extrasTotal
  const vatAmount = Math.round(subtotal * AQ_VAT)
  const total = subtotal + vatAmount

  return {
    singleChannelBase,
    channelCount,
    channelMultiplier: channelMult,
    channelSurcharge,
    basePrice,
    extrasBreakdown,
    extrasTotal,
    subtotal,
    vatAmount,
    total,
  }
}

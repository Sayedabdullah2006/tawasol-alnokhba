// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PRICING ENGINE — مصدر الحقيقة الوحيد
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { calculateAutoQuote } from './auto-quote'

export const BASE_PRICES: Record<string, number> = {
  inventions: 3000,
  competitions: 3000,
  books: 1200,
  events: 2500,
  certs: 800,
  graduation: 600,
  appointment: 1500,
  award: 2000,
  cv: 900,
  product: 3000,
  research: 500,
  charity: 400,
  government: 4500,
}

export const SCOPE_MULTIPLIERS: Record<string, number> = {
  single: 1.0,
  all: 1.5,
}

export const IMAGE_MULTIPLIERS: Record<string, number> = {
  one: 1.0,
  multi: 1.2,
}

export const EXTRAS_PRICES: Record<string, number> = {
  bilingual: 300,
  mention: 200,
  story: 150,
  pin6: 100,
  pin12: 200,
  repost: 150,
  campaign: 1000,
  video: 400,
  report: 800,
  plan: 1500,
  website: 5000,
  media: 10000,
  infographic: 300,
}

// Percentage reach boost each extra adds on top of the base reach.
// Internal services (reports, plans, website) add 0% — they don't expand audience.
export const EXTRAS_REACH_BOOST: Record<string, number> = {
  bilingual: 0.15,
  mention: 0.20,
  story: 0.30,
  pin6: 0.10,
  pin12: 0.15,
  repost: 0.25,
  campaign: 0.50,
  video: 0.40,
  report: 0,
  plan: 0,
  website: 0,
  media: 1.00,
  infographic: 0.10,
}

export const EXTRAS_NAMES: Record<string, string> = {
  bilingual: 'صياغة المحتوى باللغتين',
  mention: 'منشن لحساب المستخدم',
  story: 'ستوري انستغرام وتيك توك',
  pin6: 'تثبيت 6 ساعات في X و LinkedIn',
  pin12: 'تثبيت 12 ساعة في X و LinkedIn',
  repost: 'رتويت للمنشور بعد يوم أو يومين',
  campaign: 'حملة ترويجية متكاملة',
  video: 'تصميم مقطع فيديو شخصي موشن جرافيك',
  report: 'تقرير الأداء',
  plan: 'خطة تسويقية شاملة',
  website: 'تصميم موقع إلكتروني',
  media: 'تغطية إعلامية',
  infographic: 'تصميم انفوجرافيك',
}

const DISCOUNT_TABLE: Record<number, number> = {
  1: 0,
  2: 5,
  3: 10,
  4: 15,
  5: 20,
  6: 25,
  7: 30,
  8: 35,
  9: 40,
  10: 45,
}
export const MAX_DISCOUNT = 50

export const getDiscountPct = (numPosts: number): number => {
  if (numPosts <= 0) return 0
  if (numPosts >= 11) return MAX_DISCOUNT
  return DISCOUNT_TABLE[numPosts] ?? 0
}

export const VAT_RATE = 0.15

// ─── Types ───

export interface PriceInput {
  category: string
  subOption?: string | { subcategory: string; position: string } | null
  scope: 'single' | 'all'
  images: 'one' | 'multi'
  extras: string[]
  numPosts: number
  influencerPriceMultiplier?: number
  clientType?: 'individual' | 'business' | 'government' | 'charity'
  customPricing?: {
    base_prices: Record<string, Record<string, number>>
    extras_prices: Record<string, Record<string, number>>
  }
}

export interface PriceBreakdown {
  category: string
  subOption: string | { subcategory: string; position: string } | null
  isFree: boolean
  isHalfOff: boolean
  basePrice: number
  afterScope: number
  afterImages: number
  baseAfterSpecial: number
  extrasDetail: { id: string; name: string; price: number }[]
  extrasTotal: number
  perPostPrice: number
  numPosts: number
  subtotalBeforeDiscount: number
  discountPct: number
  discountAmount: number
  subtotalAfterDiscount: number
  vatAmount: number
  totalFinal: number
  perPostFinal: number
  scopeMultiplier: number
  imageMultiplier: number
}

// ─── Main calculation ───

// ─── Reach calculation ───

export interface Influencer {
  x_followers?: number | null
  ig_followers?: number | null
  li_followers?: number | null
  tk_followers?: number | null
}

export interface ReachInput {
  influencer: Influencer
  scope: 'single' | 'all'
  extras: string[]
}

// Base reach = followers on the chosen scope.
// Each selected extra multiplies the base by (1 + sum of boosts).
export function calculateReach(input: ReachInput): number {
  const inf = input.influencer
  const base = input.scope === 'single'
    ? (inf.x_followers ?? 0)
    : (inf.x_followers ?? 0) + (inf.ig_followers ?? 0) + (inf.li_followers ?? 0) + (inf.tk_followers ?? 0)

  const boost = input.extras.reduce((sum, id) => sum + (EXTRAS_REACH_BOOST[id] ?? 0), 0)
  return Math.round(base * (1 + boost))
}

// ⚠️ مصدر الأسعار الوحيد المعتمد = محرك auto-quote (calculateAutoQuote).
// تفوّض هذه الدالة الحساب إليه (الأسعار حسب الفئة × نوع العميل، بلا ضريبة ولا
// معاملات نطاق/صور) وتُعيد النتيجة بنفس شكل PriceBreakdown ليبقى كل المستهلكين
// (مُنشئ عرض الأدمن، حاسبة الأسعار) يعملون دون تغيير ومع أسعار موحّدة معتمدة.
export function calculatePrice(input: PriceInput): PriceBreakdown {
  if (input.numPosts < 1) {
    throw new Error('عدد المنشورات يجب أن يكون 1 على الأقل')
  }

  const clientType = input.clientType ?? 'individual'
  const multiplier = input.influencerPriceMultiplier ?? 1.0

  // الأسعار المعتمدة من auto-quote (تشمل المعالجة الخاصة للمسابقات/الاختراعات والوكالة)
  const aq = calculateAutoQuote({
    category: input.category,
    subOption: input.subOption ?? null,
    clientType,
    selectedExtras: input.extras,
    channelCount: 1, // لا معامل قنوات في النظام المعتمد
  })

  const basePrice = aq.singleChannelBase * multiplier
  const isFree = basePrice === 0

  // لا معاملات نطاق/صور — موحّدة مع auto-quote
  const scopeMultiplier = 1
  const imageMultiplier = 1
  const afterScope = basePrice
  const afterImages = basePrice
  const baseAfterSpecial = basePrice

  // الإضافات بأسعارها المعتمدة (من constants عبر auto-quote)
  const extrasDetail = aq.extrasBreakdown.map(e => ({
    id: e.id,
    name: EXTRAS_NAMES[e.id] ?? e.name,
    price: e.price * multiplier,
  }))
  const extrasTotal = extrasDetail.reduce((sum, e) => sum + e.price, 0)

  const perPostPrice = baseAfterSpecial + extrasTotal
  const subtotalBeforeDiscount = perPostPrice * input.numPosts

  // خصم الكمية يبقى لتعدد المنشورات
  const discountPct = getDiscountPct(input.numPosts)
  const discountAmount = subtotalBeforeDiscount * (discountPct / 100)
  const subtotalAfterDiscount = subtotalBeforeDiscount - discountAmount

  // لا ضريبة (مطابقةً لـ auto-quote: AQ_VAT = 0)
  const vatAmount = 0
  const totalFinal = subtotalAfterDiscount

  return {
    category: input.category,
    subOption: input.subOption ?? null,
    isFree,
    isHalfOff: false,
    basePrice,
    afterScope,
    afterImages,
    baseAfterSpecial,
    extrasDetail,
    extrasTotal,
    perPostPrice,
    numPosts: input.numPosts,
    subtotalBeforeDiscount,
    discountPct,
    discountAmount,
    subtotalAfterDiscount,
    vatAmount,
    totalFinal,
    perPostFinal: input.numPosts > 0 ? totalFinal / input.numPosts : 0,
    scopeMultiplier,
    imageMultiplier,
  }
}

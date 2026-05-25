// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTO-QUOTE ENGINE — جدول الأسعار المعتمد
// السعر = الأساسي + الإضافات + VAT 15%
// لا حاجة لـ AI — التسعير مبني على الفئة + الفئة الفرعية + نوع العميل
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// لا يوجد ضريبة قيمة مضافة في هذا النظام
export const AQ_VAT = 0

// ─── أسعار الخدمات الإضافية (بدون VAT) ───
export const AQ_EXTRAS_PRICES: Record<string, number> = {
  bilingual:    300,
  mention:      200,
  story:        150,
  encyclopedia: 500,
  pin6:         100,
  pin12:        200,
  repost:       150,
  campaign:    1000,
  video:        400,
  report:       800,
  infographic:  300,
}

export const AQ_EXTRAS_NAMES: Record<string, string> = {
  bilingual:    'صياغة المحتوى باللغتين',
  mention:      'منشن في القناة',
  story:        'ستوري في القناة',
  encyclopedia: 'إضافة للموسوعة الرقمية',
  pin6:         'تثبيت 6 أشهر',
  pin12:        'تثبيت 12 شهر',
  repost:       'إعادة نشر',
  campaign:     'حملة ترويجية متكاملة',
  video:        'فيديو جاهز',
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

type ClientType = 'individual' | 'business' | 'government' | 'charity'
type ClientPrices = Partial<Record<ClientType, number>>

// الفئات البسيطة (بدون فئات فرعية تؤثر على السعر)
const SIMPLE_BASE: Record<string, ClientPrices> = {
  books:       { individual: 699,  business: 2000 },
  research:    { individual: 799,  business: 2500 },
  certs:       { individual: 1300 },
  graduation:  { individual: 799  },
  appointment: { individual: 899,  business: 2500, government: 5000 },
  award:       { individual: 599,  business: 2000 },
  cv:          { individual: 799  },
  product:     { individual: 799,  business: 2500 },
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
}

export interface AQResult {
  basePrice: number
  extrasBreakdown: { id: string; name: string; price: number }[]
  extrasTotal: number
  subtotal: number
  vatAmount: number
  total: number
}

// ─── الدالة الرئيسية للاحتساب ───

export function calculateAutoQuote(input: AQInput): AQResult {
  const ct = (input.clientType ?? 'individual') as ClientType
  let basePrice = 0

  if (input.category === 'competitions') {
    if (
      typeof input.subOption === 'object' &&
      input.subOption !== null &&
      'subcategory' in input.subOption &&
      'position' in input.subOption
    ) {
      basePrice =
        COMPETITION_BASE[input.subOption.subcategory]?.[input.subOption.position] ?? 499
    } else {
      basePrice = 499
    }
  } else if (input.category === 'inventions') {
    const so = typeof input.subOption === 'string' ? input.subOption : ''
    basePrice = INVENTION_BASE[so] ?? 699
  } else {
    const prices = SIMPLE_BASE[input.category]
    basePrice = prices?.[ct] ?? prices?.individual ?? 499
  }

  const extrasBreakdown = input.selectedExtras
    .filter(id => AQ_EXTRAS_PRICES[id] !== undefined)
    .map(id => ({ id, name: AQ_EXTRAS_NAMES[id] ?? id, price: AQ_EXTRAS_PRICES[id] }))

  const extrasTotal = extrasBreakdown.reduce((s, e) => s + e.price, 0)
  const subtotal = basePrice + extrasTotal
  const vatAmount = Math.round(subtotal * AQ_VAT)
  const total = subtotal + vatAmount

  return { basePrice, extrasBreakdown, extrasTotal, subtotal, vatAmount, total }
}

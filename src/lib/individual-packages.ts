/** Versioned catalog for new single-person/single-news orders. Legacy ids stay immutable. */
export const PACKAGE_VERSION = '2026-11-04.v2'
export const NEWS_CHANNELS = ['x', 'li', 'ig', 'tk'] as const
export type NewsChannel = typeof NEWS_CHANNELS[number]
export type IndividualPackageId = 'v2_basic' | 'v2_reach' | 'v2_presence' | 'v2_elite' | 'v2_career'
export interface IndividualPackage {
  id: IndividualPackageId
  name: string
  blurb: string
  surcharge: number
  fixedPrice?: number
  channelCount: number
  channels?: readonly NewsChannel[]
  features: string[]
  includedExtras: string[]
  allChannels: boolean
  sponsoredCampaignBudget: number
  highlighted?: boolean
  badge?: string
  // Compatibility with the legacy campaign presentation. Never used to price v2.
  priceMultiplier: number
}
const common = ['صياغة احترافية وتصميم خاص', 'إشارة لحساب العميل بموافقته', 'روابط النشر بعد التنفيذ']
const presence = [
  'النشر في X وLinkedIn وInstagram وTikTok', ...common,
  'فيديو تعريفي واحد حتى دقيقة من مواد العميل لـTikTok وYouTube والموقع',
  'صفحة شخصية موحدة لمدة سنة وتحديث واحد خلال أول 30 يومًا',
  'نشر الخبر وأرشفته في الموقع', 'إعادة نشر واحدة بعد 24–48 ساعة', 'جولتا تعديل قبل الاعتماد',
]
export const SINGLE_PACKAGES: IndividualPackage[] = [
  { id: 'v2_basic', name: 'الأساسية', blurb: 'خبرك في القناة التي تختارها', surcharge: 0, channelCount: 1,
    features: ['قناة واحدة يختارها العميل', ...common, 'TikTok: منشور صور دون إنتاج فيديو', 'جولة تعديل واحدة'],
    includedExtras: ['mention'], allChannels: false, sponsoredCampaignBudget: 0, priceMultiplier: 1 },
  { id: 'v2_reach', name: 'الانتشار', blurb: 'خبرك عبر قناتين تختارهما', surcharge: 400, channelCount: 2,
    features: ['قناتان يختارهما العميل', ...common, 'تكييف النص والتصميم للقناتين', 'نشر الخبر وأرشفته في الموقع',
      'فيديو مبسط حتى 30 ثانية من مواد العميل عند اختيار TikTok', 'جولتا تعديل'],
    includedExtras: ['mention'], allChannels: false, sponsoredCampaignBudget: 0, priceMultiplier: 1 },
  { id: 'v2_presence', name: 'الظهور المتكامل', blurb: 'خبر وحضور تعريفي يمكن مشاركته', surcharge: 1400,
    channelCount: 4, channels: NEWS_CHANNELS, allChannels: true, sponsoredCampaignBudget: 250,
    features: [...presence, 'تثبيت X لمدة 6 ساعات', 'حملة ممولة بميزانية 250 ريال مشمولة وتقرير مختصر'],
    includedExtras: ['mention', 'video', 'pin6', 'repost', 'campaign', 'report'], highlighted: true, priceMultiplier: 1 },
  { id: 'v2_elite', name: 'النخبة', blurb: 'عرض أعمق لقصتك وإنجازك', surcharge: 2800,
    channelCount: 4, channels: NEWS_CHANNELS, allChannels: true, sponsoredCampaignBudget: 500,
    features: [...presence, 'تثبيت X لمدة 12 ساعة وإبراز بالموقع 7 أيام', 'كاروسيل حتى 5 شرائح',
      'مقابلة عن بُعد حتى 20 دقيقة عبر TikTok أو مساحة X', 'مقتطفان حتى 45 ثانية لكل منهما',
      'حملة ممولة بميزانية إجمالية 500 ريال مشمولة وتقرير تفصيلي'],
    includedExtras: ['mention', 'video', 'pin6', 'pin12', 'repost', 'campaign', 'report'], priceMultiplier: 1 },
  { id: 'v2_career', name: 'الحضور المهني', blurb: 'ملفك وقصتك المهنية؛ لا نضمن وظيفة', surcharge: 1000,
    fixedPrice: 1799, channelCount: 2, channels: ['x', 'li'], allChannels: false, sponsoredCampaignBudget: 200,
    features: ['جلسة جمع معلومات حتى 30 دقيقة', 'سيرة بلغة واحدة Word وPDF', 'نصوص تحسين LinkedIn وإرشادات التحديث',
      'بطاقة وقصة مهنية منشورة في X وLinkedIn', 'صفحة شخصية لسنة وتحديث واحد خلال أول 30 يومًا',
      'فيديو تعريفي حتى دقيقة من مواد العميل', 'إعادة نشر واحدة وجولتا تعديل وتقرير مختصر',
      'حملة ممولة بميزانية 200 ريال مشمولة', 'إرشاد لاستكمال ملفات التوظيف دون تقديم على وظائف أو ضمان توظيف'],
    includedExtras: ['mention', 'video', 'repost', 'campaign', 'report', 'infographic'], priceMultiplier: 1 },
]
export function getIndividualPackage(id: string) {
  return SINGLE_PACKAGES.find(p => p.id === id)
}
export function packagePrice(base: number, pkg: IndividualPackage) {
  if (!Number.isSafeInteger(base) || base < 0) throw new Error('INVALID_BASE_PRICE')
  return pkg.fixedPrice ?? base + pkg.surcharge
}
export function packagesForCategory(category: string) {
  return SINGLE_PACKAGES.filter(p => p.id !== 'v2_career' || category === 'cv')
}
export function resolvePackageChannels(pkg: IndividualPackage, selected: string[], available: string[]): string[] {
  const result = pkg.channels ? [...pkg.channels] : [...selected]
  if (new Set(result).size !== result.length || result.length !== pkg.channelCount ||
      result.some(ch => !NEWS_CHANNELS.includes(ch as NewsChannel) || !available.includes(ch))) {
    throw new Error('INVALID_PACKAGE_CHANNELS')
  }
  return result
}
/** Advertising is included once and is never discounted. All API money is integer halalas. */
export function priceIndividualPackage(base: number, pkg: IndividualPackage, extras: { id: string; price: number }[] = [], discountPct = 0) {
  if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100) throw new Error('INVALID_DISCOUNT')
  const chargedExtras = [...new Map(extras.filter(e => !pkg.includedExtras.includes(e.id)).map(e => [e.id, e])).values()]
  if (chargedExtras.some(e => !Number.isSafeInteger(e.price) || e.price < 0)) throw new Error('INVALID_EXTRA')
  const subtotal = (packagePrice(base, pkg) + chargedExtras.reduce((s, e) => s + e.price, 0)) * 100
  const advertising = pkg.sponsoredCampaignBudget * 100
  const discount = Math.round((subtotal - advertising) * discountPct / 100)
  return { currency: 'SAR' as const, unit: 'halala' as const, base: base * 100, surcharge: pkg.surcharge * 100,
    advertising, extras: chargedExtras.map(e => ({ id: e.id, price: e.price * 100 })), subtotal, discount, discount_pct: discountPct, vat: 0,
    tax_policy: 'existing_no_added_vat' as const, total: subtotal - discount }
}

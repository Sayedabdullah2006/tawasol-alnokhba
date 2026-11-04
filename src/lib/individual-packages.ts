import { packageBenefits, type PackageBenefit } from './individual-package-benefits'
/** Versioned catalog for new single-person/single-news orders. Legacy ids stay immutable. */
export const PACKAGE_VERSION = '2026-11-04.v3'
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
  benefits: PackageBenefit[]
  requiredCategory?: string
  features: string[]
  includedExtras: string[]
  allChannels: boolean
  sponsoredCampaignBudget: number
  highlighted?: boolean
  badge?: string
  // Compatibility with the legacy campaign presentation. Never used to price v2.
  priceMultiplier: number
}
const configurations = [
  { id: 'v2_basic', name: 'الأساسية', blurb: 'نشر خبر واحد في قناة واحدة', surcharge: 0, channelCount: 1,
    includedExtras: [], allChannels: false, sponsoredCampaignBudget: 0, priceMultiplier: 1 },
  { id: 'v2_reach', name: 'الانتشار', blurb: 'نشر خبر واحد في قناتين', surcharge: 400, channelCount: 2,
    includedExtras: [], allChannels: false, sponsoredCampaignBudget: 0, priceMultiplier: 1 },
  { id: 'v2_presence', name: 'الظهور المتكامل', blurb: 'خبر وحكاية وإبراز في غلاف الموقع', surcharge: 1400,
    channelCount: 4, channels: NEWS_CHANNELS, allChannels: true, sponsoredCampaignBudget: 0,
    includedExtras: ['mention', 'pin6', 'repost'], highlighted: true, priceMultiplier: 1 },
  { id: 'v2_elite', name: 'النخبة', blurb: 'قصة وشخصية وإنتاج مرئي ومقابلة مباشرة', surcharge: 2800,
    channelCount: 4, channels: NEWS_CHANNELS, allChannels: true, sponsoredCampaignBudget: 300,
    includedExtras: ['mention', 'video', 'pin6', 'pin12', 'repost', 'campaign', 'report'], priceMultiplier: 1 },
  { id: 'v2_career', name: 'الحضور المهني', blurb: 'تجهيز ملفك المهني ونشره دون ضمان التوظيف', surcharge: 1000,
    fixedPrice: 1799, channelCount: 2, channels: ['x', 'li'], allChannels: false, sponsoredCampaignBudget: 400,
    requiredCategory: 'cv',
    includedExtras: ['mention', 'video', 'repost', 'campaign', 'report'], priceMultiplier: 1 },
] satisfies Omit<IndividualPackage, 'features' | 'benefits'>[]
export const SINGLE_PACKAGES: IndividualPackage[] = configurations.map((pkg, index) => {
  const benefits = packageBenefits(index)
  return { ...pkg, benefits, features: benefits.filter(b => b.included).map(b => `${b.label}: ${b.value}`) }
})
export function getIndividualPackage(id: string) {
  return SINGLE_PACKAGES.find(p => p.id === id)
}
export function packagePrice(base: number, pkg: IndividualPackage) {
  if (!Number.isSafeInteger(base) || base < 0) throw new Error('INVALID_BASE_PRICE')
  return pkg.fixedPrice ?? base + pkg.surcharge
}
/** Show all five choices; career selection explicitly switches the form to cv. */
export function packagesForCategory() {
  return SINGLE_PACKAGES
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

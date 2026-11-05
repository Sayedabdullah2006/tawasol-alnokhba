import type { PackageBenefit } from './individual-package-benefits'
/** Versioned catalog for new single-person/single-news orders. Legacy ids stay immutable. */
export const NEWS_CHANNELS = ['x', 'li', 'ig', 'tk'] as const
export type NewsChannel = typeof NEWS_CHANNELS[number]
export type IndividualPackageId = 'v2_basic' | 'v2_reach' | 'v2_presence' | 'v2_elite' | 'v2_career'
export interface IndividualPackage {
  id: IndividualPackageId
  name: string
  blurb: string
  surcharge: number
  fixedPrice?: number
  /** Complete package prices for selected news categories; all other categories use the normal rule. */
  categoryPrices?: Record<string, number>
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
export function getIndividualPackage(id: string, packages: IndividualPackage[]) {
  return packages.find(p => p.id === id)
}
export function packagePrice(base: number, pkg: IndividualPackage, category?: string | null) {
  if (!Number.isFinite(base) || base < 0 || Math.abs(base * 100 - Math.round(base * 100)) > .00001) throw new Error('INVALID_BASE_PRICE')
  return pkg.fixedPrice ?? (category ? pkg.categoryPrices?.[category] : undefined) ?? base + pkg.surcharge
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
export function priceIndividualPackage(base: number, pkg: IndividualPackage, extras: { id: string; price: number; name?: string }[] = [], discountPct = 0, category?: string | null) {
  if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100) throw new Error('INVALID_DISCOUNT')
  const chargedExtras = [...new Map(extras.filter(e => !pkg.includedExtras.includes(e.id)).map(e => [e.id, e])).values()]
  if (chargedExtras.some(e => !Number.isFinite(e.price) || e.price < 0 || Math.abs(e.price * 100 - Math.round(e.price * 100)) > .00001)) throw new Error('INVALID_EXTRA')
  const packageTotal = packagePrice(base, pkg, category)
  const subtotal = Math.round((packageTotal + chargedExtras.reduce((s, e) => s + e.price, 0)) * 100)
  const advertising = Math.round(pkg.sponsoredCampaignBudget * 100)
  const discount = Math.round((subtotal - advertising) * discountPct / 100)
  return { currency: 'SAR' as const, unit: 'halala' as const, base: Math.round(base * 100), surcharge: Math.round((pkg.fixedPrice == null ? packageTotal - base : pkg.surcharge) * 100),
    advertising, extras: chargedExtras.map(e => ({ id: e.id, price: Math.round(e.price * 100), ...(e.name?{name:e.name}:{}) })), subtotal, discount, discount_pct: discountPct, vat: 0,
    tax_policy: 'existing_no_added_vat' as const, total: subtotal - discount }
}

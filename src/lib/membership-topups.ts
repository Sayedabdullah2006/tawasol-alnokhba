import { MEMBERSHIP_UNIT_REFERENCE_PRICES, type MembershipBenefitType } from '@/lib/memberships'

export type MembershipTopupItemType = 'publication_credit' | MembershipBenefitType

export type MembershipTopupCatalogItem = {
  type: MembershipTopupItemType
  label: string
  shortLabel: string
  description: string
  unitPrice: number
  maxQuantity: number
  unitBudget: number
}

export const MEMBERSHIP_TOPUP_CATALOG: MembershipTopupCatalogItem[] = [
  {
    type: 'publication_credit',
    label: 'رصيد نشر إضافي',
    shortLabel: 'طلب نشر',
    description: 'إضافة طلب نشر كامل إلى رصيد العضوية، صالح حتى تاريخ انتهائها.',
    unitPrice: MEMBERSHIP_UNIT_REFERENCE_PRICES.publication_credit,
    maxQuantity: 12,
    unitBudget: 0,
  },
  {
    type: 'reshare_quote',
    label: 'إعادة نشر أو اقتباس',
    shortLabel: 'إعادة نشر/اقتباس',
    description: 'وحدة تعزيز واحدة تختار تنفيذها كإعادة نشر أو اقتباس بعد يوم أو يومين.',
    unitPrice: MEMBERSHIP_UNIT_REFERENCE_PRICES.reshare_quote,
    maxQuantity: 20,
    unitBudget: 0,
  },
  {
    type: 'pin',
    label: 'تثبيت منشور 6 ساعات',
    shortLabel: 'تثبيت 6 ساعات',
    description: 'وحدة تثبيت لمنشور واحد لمدة ست ساعات بعد نشره.',
    unitPrice: MEMBERSHIP_UNIT_REFERENCE_PRICES.pin,
    maxQuantity: 12,
    unitBudget: 0,
  },
  {
    type: 'paid_campaign',
    label: 'حملة ممولة إضافية',
    shortLabel: 'حملة ممولة',
    description: 'حملة ممولة لمنشور أو منشورين، تشمل ميزانية إعلانية تصل إلى 300 ر.س.',
    unitPrice: MEMBERSHIP_UNIT_REFERENCE_PRICES.paid_campaign,
    maxQuantity: 6,
    unitBudget: 300,
  },
]

export function getMembershipTopupItem(type: string) {
  return MEMBERSHIP_TOPUP_CATALOG.find(item => item.type === type) ?? null
}

export function calculateMembershipTopup(type: string, quantity: number) {
  const item = getMembershipTopupItem(type)
  if (!item || !Number.isInteger(quantity) || quantity < 1 || quantity > item.maxQuantity) return null
  const total = item.unitPrice * quantity
  return { item, quantity, total }
}

export function formatMembershipTopupNumber(value: number | string) {
  return `TOP-${String(value).padStart(5, '0')}`
}

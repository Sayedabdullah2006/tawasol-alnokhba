import type { PackageBenefit } from '../individual-package-benefits'

/** Fulfillment uses the purchased snapshot, including old snapshots without benefits. */
export function initialPartnerDeliverables(pkg: { features: string[]; benefits?: PackageBenefit[] }) {
  const labels = pkg.benefits
    ? pkg.benefits.filter(b => b.included).flatMap(b => (b.quantity ?? (b.id === 'job_ads' ? 5 : 1)) > 1
      ? Array.from({ length: b.quantity ?? 5 }, (_, i) => `${b.id === 'job_ads' ? 'إعلان التوظيف' : b.label} ${i + 1} من ${b.quantity ?? 5}`)
      : [`${b.label}: ${b.value}`])
    : pkg.features
  return labels.map(label => ({ label, status: 'pending', url: '' }))
}

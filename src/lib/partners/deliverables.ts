import type { PackageBenefit } from '../individual-package-benefits'

/** Fulfillment uses the purchased snapshot, including old snapshots without benefits. */
export function initialPartnerDeliverables(pkg: { features: string[]; benefits?: PackageBenefit[] }) {
  const labels = pkg.benefits
    ? pkg.benefits.filter(b => b.included).flatMap(b => b.id === 'job_ads'
      ? Array.from({ length: 5 }, (_, i) => `إعلان التوظيف ${i + 1} من 5`)
      : [`${b.label}: ${b.value}`])
    : pkg.features
  return labels.map(label => ({ label, status: 'pending', url: '' }))
}

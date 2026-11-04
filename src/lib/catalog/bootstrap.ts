/** Bootstrap data used only to seed the first database release. */
import {packageBenefits} from '../individual-package-benefits'
import {NEWS_CHANNELS,type IndividualPackage} from '../individual-packages'
export const INITIAL_PACKAGE_VERSION='2026-11-04.v3'
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
export const INITIAL_SINGLE_PACKAGES: IndividualPackage[] = configurations.map((pkg, index) => {
  const benefits = packageBenefits(index)
  return { ...pkg, benefits, features: benefits.filter(b => b.included).map(b => `${b.label}: ${b.value}`) }
})

import type { PackageBenefit } from '../individual-package-benefits'

/** Fulfillment uses the purchased snapshot, including old snapshots without benefits. */
export function initialPartnerDeliverables(pkg: { features: string[]; benefits?: PackageBenefit[] }, channels: string[] = [], extras: {id: string}[] = []) {
  const names: Record<string,string> = {x:'X',li:'LinkedIn',ig:'Instagram',tk:'TikTok'}
  const artifacts: Record<string,string> = {self_recorded_video:'الفيديو المسجل',produced_video:'الفيديو التعريفي',story_page:'صفحة الخبر',personal_page:'صفحة التعريف',carousel:'منشور الكاروسيل',live_interview:'المقابلة',news_cover:'إبراز الخبر في الموقع',character_cover:'إبراز الشخصية في الموقع',campaign_report:'تقرير الحملة',ats_cv:'ملف السيرة الذاتية',linkedin:'إرشادات ملف لينكدإن'}
  const labels = [...new Set(channels)].filter(channel=>names[channel]).map(channel=>'رابط النشر في '+names[channel])
  if (!labels.length) labels.push('رابط النشر')
  for (const benefit of pkg.benefits ?? []) {
    if (!benefit.included) continue
    if (benefit.id === 'job_ads') {
      const count = Math.max(1,Math.min(20,Number.isInteger(benefit.quantity)?benefit.quantity!:5))
      labels.push(...Array.from({length:count},(_,i)=>`إعلان التوظيف ${i+1} من ${count}`))
    } else if (artifacts[benefit.id]) labels.push(artifacts[benefit.id])
  }
  const extraArtifacts: Record<string,string> = {story:'رابط الستوري',repost:'رابط إعادة النشر',video:'ملف الفيديو',report:'تقرير الأداء',infographic:'ملف الإنفوجرافيك'}
  for(const extra of extras)if(extraArtifacts[extra.id])labels.push(extraArtifacts[extra.id])
  // Features describe the contract; they are never URL-based deliverables.
  return [...new Set(labels)].map(label => ({ label, status: 'pending', url: '' }))
}

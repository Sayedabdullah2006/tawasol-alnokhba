/**
 * المصدر الثاني: قائمة "السعوديات الأوائل" من manhom.com.
 *
 * manhom.com محمي بـ Cloudflare (لا REST API مفتوح)، والقائمة ثابتة (تُحدّث سنوياً)،
 * لذلك كُشطت مرة واحدة وخُزّنت في جدول manhom_people. هنا نقرأها فقط — لا اتصال بالموقع
 * في وقت التشغيل ولا اعتماد على Firecrawl في الإنتاج.
 *
 * نُعيد كائنات بشكل NewsPost لإعادة استخدام نفس خط الاستوديو.
 */
import { createServiceRoleClient } from './supabase-server'
import type { NewsPost } from './first1-news'

export async function fetchManhomCandidates(): Promise<NewsPost[]> {
  const sc = await createServiceRoleClient()
  const { data } = await sc
    .from('manhom_people')
    .select('id, name, position, image_url')
    .eq('is_active', true)
  if (!data) return []
  // مهم: لا نعرض أي رابط للمصدر — المحتوى يُعاد نشره تحت هوية First1Saudi.
  return data.map(p => ({
    id: Number(p.id),
    url: '',
    title: p.name as string,
    content: p.position as string,
    categoryIds: [],
    categoryNames: ['السعوديات الأوائل'],
    publishedAt: '',
    featuredMediaId: 0,
    bodyImages: [],
    imageUrl: p.image_url as string,
    imageSource: 'featured' as const,
  }))
}

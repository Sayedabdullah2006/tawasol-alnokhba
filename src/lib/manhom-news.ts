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
import { generateImageWithGemini } from './gemini'
import type { NewsPost } from './first1-news'

const COLORIZE_PROMPT =
  'Colorize this grayscale portrait photograph with natural, realistic, lifelike colors. ' +
  'Keep the EXACT same person: identical face, facial features, expression, hair/veil, clothing shape, pose and framing. ' +
  'Change ONLY grayscale to color — do not alter identity, do not beautify, do not add or remove anything. ' +
  'Use natural skin tones and realistic clothing/veil colors with a clean neutral background. ' +
  'Photorealistic, high resolution, no stylization. Output only the colorized portrait.'

/**
 * يضمن وجود نسخة ملوّنة من صورة السيدة (صور المصدر رمادية).
 * يلوّنها مرة واحدة عبر Gemini ويخزّنها (cache)، ثم يعيد رابطها. عند أي فشل
 * يعيد الصورة الرمادية الأصلية حتى لا تتعطّل العملية.
 */
export async function ensureColorImage(personId: number, bwUrl: string): Promise<string> {
  const sc = await createServiceRoleClient()
  const { data: existing } = await sc
    .from('manhom_people')
    .select('image_url_color')
    .eq('id', personId)
    .single()
  if (existing?.image_url_color) return existing.image_url_color

  try {
    const { b64, mimeType } = await generateImageWithGemini(COLORIZE_PROMPT, [bwUrl])
    const buf = Buffer.from(b64, 'base64')
    const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png'
    const path = `manhom-color-${personId}-${Date.now()}.${ext}`
    const { error } = await sc.storage.from('content-images').upload(path, buf, { contentType: mimeType })
    if (error) return bwUrl
    const url = sc.storage.from('content-images').getPublicUrl(path).data.publicUrl
    await sc.from('manhom_people').update({ image_url_color: url }).eq('id', personId)
    return url
  } catch {
    return bwUrl
  }
}

export async function fetchManhomCandidates(): Promise<NewsPost[]> {
  const sc = await createServiceRoleClient()
  const { data } = await sc
    .from('manhom_people')
    .select('id, name, position, image_url, image_url_color, bio, achievements')
    .eq('is_active', true)
  if (!data) return []
  // مهم: لا نعرض أي رابط للمصدر — المحتوى يُعاد نشره تحت هوية First1Saudi.
  return data.map(p => {
    const achievements: string[] = Array.isArray(p.achievements) ? (p.achievements as string[]) : []
    const content = [
      p.position as string,
      p.bio ? `\n${p.bio}` : '',
      achievements.length ? `\n\nأبرز الإنجازات:\n- ${achievements.join('\n- ')}` : '',
    ].join('')
    return {
      id: Number(p.id),
      url: '',
      title: p.name as string,
      content,
      categoryIds: [],
      categoryNames: ['السعوديات الأوائل'],
      publishedAt: '',
      featuredMediaId: 0,
      bodyImages: [],
      imageUrl: (p.image_url_color as string) || (p.image_url as string),
      imageSource: 'featured' as const,
    }
  })
}

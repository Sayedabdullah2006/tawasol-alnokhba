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
import { generateImageWithOpenAI } from './image-generation'
import type { NewsPost } from './first1-news'

const COLORIZE_PROMPT =
  'Colorize this grayscale portrait photograph with natural, realistic, lifelike colors. ' +
  'Keep the EXACT same person: identical face, facial features, expression, hair/veil, clothing shape, pose and framing. ' +
  'Change ONLY grayscale to color — do not alter identity, do not beautify, do not add or remove anything. ' +
  'Use natural skin tones and realistic clothing/veil colors with a clean neutral background. ' +
  'Photorealistic, high resolution, no stylization. Output only the colorized portrait.'

/**
 * يضمن وجود نسخة ملوّنة من صورة السيدة (صور المصدر رمادية).
 * يلوّنها مرة واحدة عبر OpenAI Images ويخزّنها (cache)، ثم يعيد رابطها. عند أي فشل
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
    const { b64, mimeType } = await generateImageWithOpenAI(COLORIZE_PROMPT, [bwUrl], { aspectRatio: '1:1' })
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

// توجيه الاستوديو لسيدة رائدة — نفس أسلوب منشورات الإنجازات، لا بطاقة حقول.
export const MANHOM_NOTE =
  'عامِل هذا كخبر إنجاز عن سيدة سعودية رائدة، بنفس أسلوب وتخطيط بقية منشورات الإنجازات حرفياً (لِيبل علوي + اسم كبير + سطر إنجاز + نقاط حقائق بأيقونات). ' +
  'استخرج إنجازاتها الواردة (الجوائز، الأرقام، كونها "أول"، المناصب المرموقة) واجعلها نقاط key_facts الحقيقية. ' +
  '‼️ ممنوع منعاً باتاً: لا تُصمّم "بطاقة تعريف" بحقول، ولا تكتب أي مسمّى حقل مثل ("الاسم الوارد"، "الاسم"، "المنصب الحالي"، "المنصب"، "الجهة"، "النبذة")، ' +
  'ولا تكتب أي عبارة تشير إلى قائمة أو مصدر مثل ("تُعرض ضمن السعوديات الأوائل" أو "ضمن قائمة" أو "من قائمة"). ' +
  'النص المرئي فقط: اللِّيبل (جهتها/مجالها) + الاسم + سطر الإنجاز + نقاط الإنجازات — لا شيء غير ذلك.'

interface ManhomRow {
  id: number
  name: string
  position: string
  image_url: string
  image_url_color: string | null
  bio: string | null
  achievements: unknown
}

function rowToPost(p: ManhomRow): NewsPost {
  const achievements: string[] = Array.isArray(p.achievements) ? (p.achievements as string[]) : []
  const content = [
    p.position,
    p.bio ? `\n${p.bio}` : '',
    achievements.length ? `\n\nأبرز الإنجازات:\n- ${achievements.join('\n- ')}` : '',
  ].join('')
  return {
    id: Number(p.id),
    url: '', // مهم: لا رابط للمصدر — يُعاد نشره تحت هوية First1Saudi
    title: p.name,
    content,
    categoryIds: [],
    categoryNames: ['السعوديات الأوائل'],
    publishedAt: '',
    featuredMediaId: 0,
    bodyImages: [],
    imageUrl: p.image_url_color || p.image_url,
    imageSource: 'featured' as const,
  }
}

export async function fetchManhomCandidates(): Promise<NewsPost[]> {
  const sc = await createServiceRoleClient()
  const { data } = await sc
    .from('manhom_people')
    .select('id, name, position, image_url, image_url_color, bio, achievements')
    .eq('is_active', true)
  if (!data) return []
  return (data as ManhomRow[]).map(rowToPost)
}

/** يجلب سيدة واحدة بمعرّفها (لإعادة توليد التصميم). */
export async function fetchManhomPerson(id: number): Promise<NewsPost | null> {
  const sc = await createServiceRoleClient()
  const { data } = await sc
    .from('manhom_people')
    .select('id, name, position, image_url, image_url_color, bio, achievements')
    .eq('id', id)
    .single()
  return data ? rowToPost(data as ManhomRow) : null
}

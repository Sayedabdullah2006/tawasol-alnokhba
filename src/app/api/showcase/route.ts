/**
 * Showcase API — مجلة المبدعين والأوائل في السعودية.
 *
 * يجمّع المحتوى والتصاميم المولّدة فعلياً من مصدرين حقيقيين ويوحّدها:
 *   1) خطة النشر اليومية (social_schedule) — الأخبار/الأوائل المولّدة يومياً.
 *   2) تصاميم العملاء المعتمدة (publish_requests حالتها completed) من استوديو الذكاء الاصطناعي.
 *
 * الأقسام تُشتق ديناميكياً من تصنيفات (category) المحتوى الفعلي — لا قوائم ثابتة.
 * (الاستوديو المستقل عديم الحالة فلا سجلات مخزّنة منه لعرضها.)
 *
 * عام للقراءة فقط؛ يُرجع حقولاً منسّقة آمنة فقط (لا بيانات تواصل حساسة).
 */
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { CATEGORIES } from '@/lib/constants'

export const dynamic = 'force-dynamic'

export interface ShowcaseItem {
  id: string
  source: 'daily' | 'client'
  name: string          // اسم المبدع / عنوان الإنجاز
  title: string         // العنوان الرئيسي
  category: string      // الفئة (عربية — مشتقّة ديناميكياً)
  tags: string[]        // وسوم الخبرة (للعرض عند المرور)
  bio: string           // نبذة مختصرة
  story: string         // القصة الكاملة
  cover: string         // التصميم الرئيسي
  gallery: string[]     // كل التصاميم/الصور
  tweets: string | null
  createdAt: string
}

const catNameAr = (id: string | null | undefined) =>
  CATEGORIES.find(c => c.id === id)?.nameAr ?? (id ? String(id) : 'منوّعات')

function excerpt(s: string | null | undefined, n = 180): string {
  if (!s) return ''
  const clean = s.replace(/\s+/g, ' ').trim()
  return clean.length > n ? `${clean.slice(0, n).trim()}…` : clean
}

// يستخرج روابط الصور من عمود ai_designs (عناصر {title, imageUrl|url, brief}).
function imagesFromAiDesigns(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((d) => (d && typeof d === 'object' ? ((d as Record<string, unknown>).imageUrl ?? (d as Record<string, unknown>).url) : ''))
    .filter((u): u is string => typeof u === 'string' && !!u)
}

export async function GET() {
  const sc = await createServiceRoleClient()
  const items: ShowcaseItem[] = []

  // ── المصدر 1: خطة النشر اليومية ──
  const { data: daily } = await sc
    .from('social_schedule')
    .select('id, post_title, category, source, source_content, source_image_url, design_image_url, tweets, batch_date, created_at')
    .not('design_image_url', 'is', null)
    .order('batch_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300)

  for (const r of daily ?? []) {
    const cover = (r.design_image_url as string) || ''
    if (!cover) continue
    const gallery = [cover, r.source_image_url as string | null].filter((u): u is string => !!u)
    const category = (r.category && String(r.category).trim()) || 'منوّعات'
    items.push({
      id: `daily-${r.id}`,
      source: 'daily',
      name: (r.post_title as string)?.trim() || 'إنجاز سعودي',
      title: (r.post_title as string)?.trim() || '',
      category,
      tags: [category].filter(Boolean),
      bio: excerpt(r.source_content as string),
      story: ((r.source_content as string) ?? '').trim(),
      cover,
      gallery,
      tweets: (r.tweets as string) ?? null,
      createdAt: (r.created_at as string) ?? (r.batch_date as string) ?? '',
    })
  }

  // ── المصدر 2: تصاميم العملاء المعتمدة (مكتملة) ──
  const { data: clients } = await sc
    .from('publish_requests')
    .select('id, title, content, category, client_name, status, proposed_images, ai_designs, ai_tweets, ai_generated_at, created_at')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(200)

  for (const r of clients ?? []) {
    const aiImgs = imagesFromAiDesigns(r.ai_designs)
    const proposed = Array.isArray(r.proposed_images)
      ? (r.proposed_images as unknown[]).filter((u): u is string => typeof u === 'string' && !!u)
      : []
    const gallery = (aiImgs.length ? aiImgs : proposed).slice(0, 12)
    if (!gallery.length) continue
    const tw = r.ai_tweets
    const tweetsRaw =
      tw && typeof tw === 'object' && 'raw' in tw ? String((tw as Record<string, unknown>).raw ?? '') : null
    const category = catNameAr(r.category as string)
    items.push({
      id: `client-${r.id}`,
      source: 'client',
      name: (r.client_name as string)?.trim() || (r.title as string) || 'مبدع سعودي',
      title: (r.title as string)?.trim() || '',
      category,
      tags: [category].filter(Boolean),
      bio: excerpt(r.content as string),
      story: ((r.content as string) ?? '').trim(),
      cover: gallery[0],
      gallery,
      tweets: tweetsRaw,
      createdAt: (r.ai_generated_at as string) ?? (r.created_at as string) ?? '',
    })
  }

  // ترتيب عام بالأحدث
  items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

  // ── تجميع ديناميكي حسب الفئة (أقسام مشتقّة من المحتوى الفعلي) ──
  const groupsMap = new Map<string, ShowcaseItem[]>()
  for (const it of items) {
    const key = it.category || 'منوّعات'
    if (!groupsMap.has(key)) groupsMap.set(key, [])
    groupsMap.get(key)!.push(it)
  }
  const categories = [...groupsMap.entries()]
    .map(([name, list]) => ({ name, count: list.length, cover: list[0]?.cover ?? '' }))
    .sort((a, b) => b.count - a.count)

  const featured = items[0] ?? null

  return NextResponse.json({ items, categories, featured, total: items.length })
}

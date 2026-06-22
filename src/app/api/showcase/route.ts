/**
 * Showcase API — مجلة المبدعين والأوائل في السعودية.
 *
 * يجمّع المحتوى من مصدرين:
 *   1) خطة النشر اليومية (social_schedule) — الأخبار/الأوائل المولّدة يومياً.
 *   2) التصاميم المميّزة المختارة يدوياً (showcase_designs) — تصميم واحد مختار
 *      من استوديو الطلبات أو من الاستوديو المستقل (لا تُعرض كل تصاميم الطلب).
 *
 * الأقسام تُشتق ديناميكياً من تصنيفات (category) المحتوى الفعلي — لا قوائم ثابتة.
 * عام للقراءة فقط؛ يُرجع حقولاً منسّقة آمنة فقط.
 */
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export interface ShowcaseItem {
  id: string
  source: 'daily' | 'featured'
  name: string          // اسم المبدع / عنوان الإنجاز
  title: string         // العنوان الرئيسي
  category: string      // الفئة (عربية — مشتقّة ديناميكياً)
  tags: string[]        // وسوم الخبرة (للعرض عند المرور)
  bio: string           // نبذة مختصرة
  story: string         // القصة الكاملة
  cover: string         // التصميم الرئيسي
  gallery: string[]     // الصور المعروضة
  tweets: string | null
  createdAt: string
}

function excerpt(s: string | null | undefined, n = 180): string {
  if (!s) return ''
  const clean = s.replace(/\s+/g, ' ').trim()
  return clean.length > n ? `${clean.slice(0, n).trim()}…` : clean
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

  // ── المصدر 2: التصاميم المميّزة المختارة (تصميم واحد لكل عنصر) ──
  const { data: featuredRows } = await sc
    .from('showcase_designs')
    .select('id, name, title, category, story, cover, tweets, created_at')
    .order('created_at', { ascending: false })
    .limit(300)

  for (const r of featuredRows ?? []) {
    const cover = (r.cover as string) || ''
    if (!cover) continue
    const category = (r.category && String(r.category).trim()) || 'منوّعات'
    items.push({
      id: `featured-${r.id}`,
      source: 'featured',
      name: (r.name as string)?.trim() || 'مبدع سعودي',
      title: (r.title as string)?.trim() || '',
      category,
      tags: [category].filter(Boolean),
      bio: excerpt(r.story as string),
      story: ((r.story as string) ?? '').trim(),
      cover,
      gallery: [cover], // تصميم واحد مميّز فقط
      tweets: (r.tweets as string) ?? null,
      createdAt: (r.created_at as string) ?? '',
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

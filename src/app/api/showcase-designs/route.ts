import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'

// قائمة التصاميم تتغيّر مع كل اعتماد جديد — لا نخزّن الاستجابة مؤقتاً لفترة طويلة
export const dynamic = 'force-dynamic'

// يعيد روابط صور التصاميم المعتمد محتواها من العملاء فقط — لعرضها في الصفحة الرئيسية.
// لا يكشف أي بيانات عميل (اسم/بريد/جوال) — صور التصاميم فقط.
export async function GET() {
  try {
    const sc = await createServiceRoleClient()

    const { data } = await sc
      .from('publish_requests')
      .select('proposed_images, content_approved_at')
      .not('content_approved_at', 'is', null)
      .not('proposed_images', 'is', null)
      .order('content_approved_at', { ascending: false })
      .limit(40)

    // تجميع كل روابط الصور من التصاميم المعتمدة (بدون تكرار)
    const images: string[] = []
    const seen = new Set<string>()
    for (const row of data ?? []) {
      const imgs = Array.isArray(row.proposed_images) ? row.proposed_images : []
      for (const url of imgs) {
        if (typeof url === 'string' && url && !seen.has(url)) {
          seen.add(url)
          images.push(url)
        }
      }
    }

    return NextResponse.json({ images })
  } catch {
    return NextResponse.json({ images: [] })
  }
}

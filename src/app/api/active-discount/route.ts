import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'

// كود الخصم الساري يتغيّر، فلا يجب تخزين الاستجابة مؤقتاً
export const dynamic = 'force-dynamic'

// يرجع أحدث كود خصم ساري المفعول (مفعّل، لم تنتهِ صلاحيته، لم تُستنفد استخداماته)
// لعرضه للعميل في نافذة منبثقة. يعيد { code: null } إن لم يوجد.
export async function GET() {
  try {
    const sc = await createServiceRoleClient()
    const nowIso = new Date().toISOString()

    const { data } = await sc
      .from('discount_codes')
      .select('id, code, occasion, discount_pct, expires_at, max_uses, used_count')
      .eq('is_active', true)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(10)

    // استبعاد الأكواد المستنفدة (max_uses غير قابل للمقارنة المباشرة مع عمود آخر)
    const valid = (data ?? []).find(
      dc => dc.max_uses === null || dc.used_count < dc.max_uses
    )

    if (!valid) return NextResponse.json({ code: null })

    return NextResponse.json({
      code: {
        id:           valid.id,
        code:         valid.code,
        occasion:     valid.occasion ?? null,
        discount_pct: Number(valid.discount_pct),
        expires_at:   valid.expires_at,
      },
    })
  } catch {
    return NextResponse.json({ code: null })
  }
}

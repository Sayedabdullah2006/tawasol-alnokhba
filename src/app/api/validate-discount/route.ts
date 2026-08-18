import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { parseRecoveryToken, verifyLocalRecoverySecret } from '@/lib/request-recovery'

export async function POST(request: Request) {
  try {
    const { code, recovery_token: recoveryToken } = await request.json()
    if (!code?.trim()) {
      return NextResponse.json({ valid: false, error: 'أدخل الكود' })
    }

    const serviceClient = await createServiceRoleClient()
    const { data: dc } = await serviceClient
      .from('discount_codes')
      .select('id, code, occasion, discount_pct, max_discount_amount, recovery_draft_id, expires_at, max_uses, used_count, is_active')
      .eq('code', code.trim().toUpperCase())
      .single()

    if (!dc) return NextResponse.json({ valid: false, error: 'الكود غير صحيح' })
    if (!dc.is_active) return NextResponse.json({ valid: false, error: 'الكود غير مفعّل' })
    if (new Date(dc.expires_at) < new Date()) return NextResponse.json({ valid: false, error: 'انتهت صلاحية الكود' })
    if (dc.max_uses !== null && dc.used_count >= dc.max_uses) {
      return NextResponse.json({ valid: false, error: 'تم استنفاد استخدامات الكود' })
    }
    if (dc.recovery_draft_id) {
      const parsed = typeof recoveryToken === 'string' ? parseRecoveryToken(recoveryToken) : null
      const { data: draft } = parsed?.id === dc.recovery_draft_id
        ? await serviceClient
            .from('request_recovery_drafts')
            .select('access_token_hash, status, offer_code, offer_expires_at')
            .eq('id', dc.recovery_draft_id)
            .maybeSingle()
        : { data: null }
      if (!draft || !parsed) {
        return NextResponse.json({ valid: false, error: 'هذا العرض مرتبط بمسودة طلب محددة' })
      }
      const tokenValid = parsed.emailSigned
        || (!!parsed.localSecret && verifyLocalRecoverySecret(parsed.localSecret, draft.access_token_hash))
      if (!tokenValid || draft.status !== 'active' || draft.offer_code !== dc.code || !draft.offer_expires_at || new Date(draft.offer_expires_at) <= new Date()) {
        return NextResponse.json({ valid: false, error: 'هذا العرض مرتبط بمسودة طلب محددة' })
      }
    }

    return NextResponse.json({
      valid: true,
      id: dc.id,
      code: dc.code,
      discount_pct: Number(dc.discount_pct),
      max_discount_amount: dc.max_discount_amount == null ? null : Number(dc.max_discount_amount),
      occasion: dc.occasion ?? null,
    })
  } catch {
    return NextResponse.json({ valid: false, error: 'حدث خطأ' }, { status: 500 })
  }
}

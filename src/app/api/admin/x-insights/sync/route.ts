import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { syncCurrentXInsights } from '@/lib/x-insights'
import { xConfigured } from '@/lib/x-oauth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function isAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin'
}

export async function POST() {
  if (!await isAdmin()) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  if (!xConfigured()) {
    return NextResponse.json({
      error: 'إعدادات X غير مكتملة في بيئة التشغيل. يلزم تمرير X_CLIENT_ID وX_CLIENT_SECRET ونفس X_TOKEN_ENCRYPTION_KEY المستخدم عند ربط الحساب.',
    }, { status: 503 })
  }
  try {
    return NextResponse.json(await syncCurrentXInsights())
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const safeMessage = message.includes('X_TOKEN_ENCRYPTION_KEY')
      ? 'مفتاح تشفير X في بيئة التشغيل غير صالح. يجب أن يكون نفس المفتاح المستخدم عند ربط الحساب، بصيغة 64 خانة hexadecimal.'
      : message || 'تعذّرت مزامنة تحليلات X'
    return NextResponse.json({ error: safeMessage }, { status: 500 })
  }
}

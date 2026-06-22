/** اختبار الاتصال: قائمة الحسابات المربوطة في Post-Pulse. لا ينشر شيئاً. أدمن فقط. */
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { listAccounts, isConnected } from '@/lib/postpulse'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  if (!(await isConnected())) {
    return NextResponse.json({ connected: false, error: 'غير مربوط بعد' }, { status: 409 })
  }
  try {
    const accounts = await listAccounts()
    return NextResponse.json({ connected: true, accounts })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'خطأ' }, { status: 502 })
  }
}

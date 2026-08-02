import { NextResponse } from 'next/server'
import { ensureDailyFirst1Education } from '@/lib/first1-education'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  try {
    return NextResponse.json({ success: true, ...(await ensureDailyFirst1Education()) })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'تعذّر إنشاء المحتوى التثقيفي' }, { status: 500 })
  }
}

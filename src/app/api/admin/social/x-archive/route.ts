import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getFirst1XArchiveStatus, importFirst1XArchiveBatch } from '@/lib/first1-x-archive'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin'
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  return NextResponse.json(await getFirst1XArchiveStatus())
}

export async function POST() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  try {
    return NextResponse.json({ success: true, ...(await importFirst1XArchiveBatch()) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذّر استيراد أرشيف X' }, { status: 500 })
  }
}

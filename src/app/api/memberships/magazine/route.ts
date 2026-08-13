import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { loadMemberMagazineItems } from '@/lib/member-magazine'

export const dynamic = 'force-dynamic'

async function getOwnedMagazine() {
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'غير مصرح' }, { status: 401 }) }

  const service = await createServiceRoleClient()
  const { data: membership } = await service
    .from('memberships')
    .select('id, user_id, client_name, plan_id, created_at, membership_plans(name_ar)')
    .eq('user_id', user.id)
    .in('status', ['active', 'paused', 'expired'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!membership) return { error: NextResponse.json({ error: 'لا توجد عضوية مؤهلة للمجلة' }, { status: 404 }) }

  let { data: magazine } = await service
    .from('membership_magazines')
    .select('*')
    .eq('membership_id', membership.id)
    .maybeSingle()

  if (!magazine) {
    const inserted = await service
      .from('membership_magazines')
      .insert({ membership_id: membership.id, user_id: user.id, display_name: membership.client_name })
      .select('*')
      .single()
    magazine = inserted.data
  }
  if (!magazine) return { error: NextResponse.json({ error: 'تعذّر تجهيز المجلة' }, { status: 500 }) }

  const relation = membership.membership_plans as unknown as { name_ar?: string } | null
  return { service, membership, magazine, planName: relation?.name_ar ?? 'عضوية تواصل النخبة' }
}

export async function GET() {
  const owned = await getOwnedMagazine()
  if ('error' in owned) return owned.error
  const items = await loadMemberMagazineItems(owned.membership.id)
  return NextResponse.json({
    magazine: {
      id: owned.magazine.id,
      displayName: owned.magazine.display_name,
      bio: owned.magazine.bio ?? '',
      shareToken: owned.magazine.share_token,
      isPublic: owned.magazine.is_public,
      planName: owned.planName,
      planId: owned.membership.plan_id,
    },
    items,
  })
}

export async function PATCH(request: Request) {
  const owned = await getOwnedMagazine()
  if ('error' in owned) return owned.error
  const body = await request.json().catch(() => ({}))
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
  const bio = typeof body.bio === 'string' ? body.bio.trim() : ''
  if (displayName.length < 2 || displayName.length > 120) {
    return NextResponse.json({ error: 'اسم المجلة يجب أن يكون بين حرفين و120 حرفاً' }, { status: 400 })
  }
  if (bio.length > 500) return NextResponse.json({ error: 'النبذة طويلة جداً' }, { status: 400 })

  const { data, error } = await owned.service
    .from('membership_magazines')
    .update({ display_name: displayName, bio: bio || null, is_public: body.isPublic !== false, updated_at: new Date().toISOString() })
    .eq('id', owned.magazine.id)
    .eq('user_id', owned.membership.user_id)
    .select('display_name, bio, share_token, is_public')
    .single()
  if (error) return NextResponse.json({ error: 'تعذّر حفظ إعدادات المجلة' }, { status: 500 })
  return NextResponse.json({ success: true, magazine: data })
}

export async function POST(request: Request) {
  const owned = await getOwnedMagazine()
  if ('error' in owned) return owned.error
  const body = await request.json().catch(() => ({}))
  if (body.action !== 'renew-link') return NextResponse.json({ error: 'إجراء غير صالح' }, { status: 400 })

  const { data, error } = await owned.service
    .from('membership_magazines')
    .update({ share_token: crypto.randomUUID(), is_public: true, updated_at: new Date().toISOString() })
    .eq('id', owned.magazine.id)
    .eq('user_id', owned.membership.user_id)
    .select('share_token, is_public')
    .single()
  if (error) return NextResponse.json({ error: 'تعذّر إنشاء رابط جديد' }, { status: 500 })
  return NextResponse.json({ success: true, shareToken: data.share_token, isPublic: data.is_public })
}

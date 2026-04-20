import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'

// GET — list all users
export async function GET() {
  try {
    const userClient = await createServerSupabaseClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const { data: profile } = await userClient.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

    const serviceClient = await createServiceRoleClient()

    // Get all auth users
    const { data: authData } = await serviceClient.auth.admin.listUsers()
    const authUsers = authData?.users ?? []

    // Get all profiles
    const { data: profiles } = await serviceClient.from('profiles').select('*')

    // Get request counts per user
    const { data: requests } = await serviceClient
      .from('publish_requests')
      .select('user_id, id')

    const requestCounts: Record<string, number> = {}
    requests?.forEach(r => {
      if (r.user_id) requestCounts[r.user_id] = (requestCounts[r.user_id] ?? 0) + 1
    })

    // Merge data
    const users = authUsers.map(au => {
      const prof = profiles?.find(p => p.id === au.id)
      return {
        id: au.id,
        email: au.email,
        full_name: prof?.full_name ?? '',
        phone: prof?.phone ?? '',
        city: prof?.city ?? '',
        role: prof?.role ?? 'client',
        is_banned: au.banned_until ? new Date(au.banned_until) > new Date() : false,
        banned_until: au.banned_until,
        requests_count: requestCounts[au.id] ?? 0,
        created_at: au.created_at,
        last_sign_in: au.last_sign_in_at,
      }
    })

    return NextResponse.json({ users })
  } catch (err) {
    console.error('List users error:', err)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

// PATCH — ban/unban user
export async function PATCH(request: Request) {
  try {
    const userClient = await createServerSupabaseClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    const { data: profile } = await userClient.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

    const body = await request.json()
    const { userId, action } = body as { userId: string; action: string; newPassword?: string }

    const serviceClient = await createServiceRoleClient()

    if (action === 'set-password') {
      const newPassword = (body.newPassword ?? '').toString()
      if (newPassword.length < 8) {
        return NextResponse.json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' }, { status: 400 })
      }
      const { error } = await serviceClient.auth.admin.updateUserById(userId, { password: newPassword })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // Prevent admin from banning themselves
    if (userId === user.id) {
      return NextResponse.json({ error: 'لا يمكنك إيقاف حسابك' }, { status: 400 })
    }

    if (action === 'ban') {
      const { error } = await serviceClient.auth.admin.updateUserById(userId, {
        ban_duration: '876000h', // ~100 years
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else if (action === 'unban') {
      const { error } = await serviceClient.auth.admin.updateUserById(userId, {
        ban_duration: 'none',
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Ban/unban error:', err)
    return NextResponse.json({ error: 'حدث خطأ' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { generateRequestNumber } from '@/lib/utils'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const serviceClient = await createServiceRoleClient()

    let userId: string | null = null
    try {
      const userClient = await createServerSupabaseClient()
      const { data: { user } } = await userClient.auth.getUser()
      if (user) userId = user.id
    } catch {
      // not logged in
    }

    if (!userId) {
      try {
        const { data: users } = await serviceClient.auth.admin.listUsers()
        const existing = users?.users?.find(u => u.email === body.client_email)

        if (existing) {
          userId = existing.id
        } else {
          const tempPassword = Math.random().toString(36).slice(-10) + 'A1!'
          const { data: newUser } = await serviceClient.auth.admin.createUser({
            email: body.client_email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { full_name: body.client_name },
          })
          if (newUser?.user) {
            userId = newUser.user.id
            await serviceClient.from('profiles').upsert({
              id: newUser.user.id,
              full_name: body.client_name,
              phone: body.client_phone,
              city: body.client_city,
              x_handle: body.x_handle,
            })
          }
        }
      } catch (e) {
        console.error('User lookup/creation error:', e)
      }
    }

    const channels: string[] = Array.isArray(body.channels) ? body.channels : []
    const scope = channels.length > 1 ? 'all' : 'single'

    const { data, error } = await serviceClient
      .from('publish_requests')
      .insert({
        user_id: userId,
        influencer_id: body.influencer_id,
        client_type: body.client_type,
        category: body.category,
        sub_option: body.sub_option,
        channels,
        scope,
        images: 'one',
        extras: [],
        num_posts: 1,
        title: body.title,
        content: body.content,
        link: body.link,
        hashtags: body.hashtags,
        preferred_date: body.preferred_date,
        client_name: body.client_name,
        client_phone: body.client_phone,
        client_email: body.client_email,
        client_city: body.client_city,
        x_handle: body.x_handle,
        status: 'pending',
      })
      .select('request_number')
      .single()

    if (error) {
      console.error('Insert error:', error)
      return NextResponse.json({ error: 'فشل حفظ الطلب' }, { status: 500 })
    }

    return NextResponse.json({ requestNumber: generateRequestNumber(data.request_number) })
  } catch (err) {
    console.error('Submit error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server'
import { normalizeImageUrls, normalizeSupportingDocuments } from '@/lib/request-attachments'

/**
 * يحفظ حالة الاستوديو (التصاميم المولّدة + صور المصدر المرفوعة) حتى تبقى بعد إعادة التحميل.
 * - حملة (postIndex): تُحفظ داخل ai_posts[postIndex].designs / .uploaded_images
 * - طلب مفرد: تُحفظ في الأعمدة ai_designs / ai_uploaded_images
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

    const body = await request.json()
    const { requestId, designs, uploadedImages, selectedImages } = body
    const hasPostIndex = typeof body.postIndex === 'number' && Number.isInteger(body.postIndex) && body.postIndex >= 0
    const postIndex: number | null = hasPostIndex ? body.postIndex : null

    if (!requestId) return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })

    const service = await createServiceRoleClient()
    const { data: reqRow } = await service
      .from('publish_requests')
      .select('ai_posts, ai_designs, ai_uploaded_images, content_images, supporting_documents, campaign_posts')
      .eq('id', requestId)
      .single()
    if (!reqRow) return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 })

    if (postIndex !== null) {
      const aiPosts: Record<string, Record<string, unknown>> =
        reqRow.ai_posts && typeof reqRow.ai_posts === 'object' ? { ...reqRow.ai_posts } as Record<string, Record<string, unknown>> : {}
      const entry: Record<string, unknown> = { ...(aiPosts[postIndex] ?? {}) }
      const post = Array.isArray(reqRow.campaign_posts) ? reqRow.campaign_posts[postIndex] : null
      const supportingUrls = new Set(normalizeSupportingDocuments(post?.supporting_documents).map(document => document.url))
      if (Array.isArray(designs)) entry.designs = designs
      if (Array.isArray(uploadedImages)) entry.uploaded_images = normalizeImageUrls(uploadedImages).filter(url => !supportingUrls.has(url))
      if (Array.isArray(selectedImages)) {
        const allowed = new Set([
          ...normalizeImageUrls(post?.images),
          ...normalizeImageUrls(entry.uploaded_images ?? entry.uploadedImages),
        ].filter(url => !supportingUrls.has(url)))
        entry.selected_images = normalizeImageUrls(selectedImages).filter(url => allowed.has(url))
      }
      aiPosts[postIndex] = entry
      const { error } = await service.from('publish_requests').update({ ai_posts: aiPosts }).eq('id', requestId)
      if (error) throw new Error(error.message)
    } else {
      const upd: Record<string, unknown> = {}
      const supportingUrls = new Set(normalizeSupportingDocuments(reqRow.supporting_documents).map(document => document.url))
      if (Array.isArray(designs)) upd.ai_designs = designs
      if (Array.isArray(uploadedImages)) upd.ai_uploaded_images = normalizeImageUrls(uploadedImages).filter(url => !supportingUrls.has(url))
      if (Object.keys(upd).length) {
        const { error } = await service.from('publish_requests').update(upd).eq('id', requestId)
        if (error) throw new Error(error.message)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Save studio state error:', err)
    return NextResponse.json({ error: 'حدث خطأ في الخادم' }, { status: 500 })
  }
}

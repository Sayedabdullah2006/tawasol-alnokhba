/**
 * إعداد أعمدة المحتوى المقترح في قاعدة البيانات
 * يجب تشغيلها مرة واحدة للتأكد من وجود الأعمدة المطلوبة
 */

import { createServiceRoleClient } from './supabase-server'

export async function setupContentColumns() {
  console.log('[SETUP] 🔧 بدء إعداد أعمدة المحتوى...')

  try {
    const supabase = await createServiceRoleClient()

    // التحقق من structure الجدول الحالي
    const { data: columns, error: columnsError } = await supabase
      .rpc('get_table_columns', { table_name: 'publish_requests' })

    if (columnsError) {
      console.log('[SETUP] ℹ️ لا يمكن فحص الأعمدة، سنحاول إضافتها مباشرة')
    }

    // محاولة إضافة الأعمدة (ستفشل إذا كانت موجودة بالفعل)
    const alterQueries = [
      "ALTER TABLE publish_requests ADD COLUMN IF NOT EXISTS proposed_content TEXT;",
      "ALTER TABLE publish_requests ADD COLUMN IF NOT EXISTS proposed_images JSONB DEFAULT '[]'::jsonb;",
      "ALTER TABLE publish_requests ADD COLUMN IF NOT EXISTS content_sent_at TIMESTAMPTZ;"
    ]

    for (const query of alterQueries) {
      try {
        const { error } = await supabase.rpc('execute_sql', { query })
        if (error) {
          console.log('[SETUP] ⚠️ SQL Query failed (قد يكون العمود موجود):', error.message)
        }
      } catch (err) {
        console.log('[SETUP] ⚠️ SQL Error (قد يكون العمود موجود):', err)
      }
    }

    // اختبار إدراج/قراءة بيانات تجريبية
    const testId = crypto.randomUUID()
    try {
      const { error: insertError } = await supabase
        .from('publish_requests')
        .insert({
          id: testId,
          request_number: 99999,
          client_name: 'Test',
          client_email: 'test@example.com',
          client_phone: '0500000000',
          title: 'Test Request',
          content: 'Test content',
          category: 'achievements',
          channels: ['x'],
          proposed_content: 'Test proposed content',
          proposed_images: ['https://example.com/test.jpg'],
          content_sent_at: new Date().toISOString()
        })

      if (!insertError) {
        // قراءة البيانات للتأكد
        const { data: testData, error: readError } = await supabase
          .from('publish_requests')
          .select('proposed_content, proposed_images, content_sent_at')
          .eq('id', testId)
          .single()

        if (!readError && testData) {
          console.log('[SETUP] ✅ اختبار الأعمدة نجح:', {
            hasProposedContent: !!testData.proposed_content,
            proposedImagesType: typeof testData.proposed_images,
            proposedImagesArray: Array.isArray(testData.proposed_images),
            hasContentSentAt: !!testData.content_sent_at
          })
        }

        // حذف البيانات التجريبية
        await supabase
          .from('publish_requests')
          .delete()
          .eq('id', testId)

        console.log('[SETUP] ✅ تم إعداد أعمدة المحتوى بنجاح')
        return { success: true }
      } else {
        console.error('[SETUP] ❌ فشل اختبار الإدراج:', insertError)
        return { success: false, error: insertError.message }
      }

    } catch (testError) {
      console.error('[SETUP] ❌ خطأ في اختبار الأعمدة:', testError)
      return { success: false, error: testError instanceof Error ? testError.message : 'خطأ غير معروف' }
    }

  } catch (error) {
    console.error('[SETUP] ❌ خطأ عام في الإعداد:', error)
    return { success: false, error: error instanceof Error ? error.message : 'خطأ غير معروف' }
  }
}
/**
 * API للتحقق من إعداد المحتوى وإصلاح المشاكل
 */

import { NextRequest, NextResponse } from 'next/server'
import { setupContentColumns } from '@/lib/setup-content-columns'

export async function POST(request: NextRequest) {
  try {
    console.log('[SETUP_API] 🚀 بدء إعداد المحتوى...')

    const result = await setupContentColumns()

    if (result.success) {
      console.log('[SETUP_API] ✅ تم الإعداد بنجاح')
      return NextResponse.json({
        success: true,
        message: 'تم إعداد أعمدة المحتوى بنجاح'
      })
    } else {
      console.log('[SETUP_API] ❌ فشل الإعداد:', result.error)
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 })
    }

  } catch (error) {
    console.error('[SETUP_API] 💥 خطأ في API:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'خطأ غير معروف'
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'استخدم POST لتشغيل إعداد المحتوى',
    endpoints: {
      setup: 'POST /api/debug/setup-content',
      description: 'يتحقق من وجود أعمدة المحتوى ويضيفها إذا لزم الأمر'
    }
  })
}
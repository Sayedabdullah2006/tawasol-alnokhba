// API endpoint عام لتشغيل التذكيرات اليومية
// يمكن استدعاؤه من خدمات cron خارجية مثل cron-job.org

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'

// API key بسيط للحماية من الاستدعاءات غير المصرحة
const CRON_API_KEY = process.env.CRON_API_KEY || 'nukhba-daily-reminders-2024'

export async function GET(request: NextRequest) {
  return handleRequest(request)
}

export async function POST(request: NextRequest) {
  return handleRequest(request)
}

async function handleRequest(request: NextRequest) {
  try {
    console.log('[CRON] Daily reminders cron job called at:', new Date().toISOString())

    // التحقق من API key
    const authKey = request.headers.get('x-api-key') ||
                    request.nextUrl.searchParams.get('key') ||
                    request.headers.get('authorization')?.replace('Bearer ', '')

    if (authKey !== CRON_API_KEY) {
      console.warn('[CRON] Unauthorized access attempt from:', request.ip)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // استدعاء دالة التذكيرات في Supabase
    const supabase = await createServiceRoleClient()

    console.log('[CRON] Calling daily-reminders function...')

    const { data, error } = await supabase.functions.invoke('daily-reminders', {
      body: {
        source: 'cron-api',
        timestamp: new Date().toISOString()
      }
    })

    if (error) {
      console.error('[CRON] Function invoke error:', error)
      return NextResponse.json({
        success: false,
        error: 'Failed to invoke reminders function',
        details: error.message
      }, { status: 500 })
    }

    console.log('[CRON] Daily reminders function completed successfully')
    console.log('[CRON] Result:', data)

    // إرجاع النتيجة
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      source: 'cron-api',
      result: data,
      message: 'Daily reminders job completed successfully'
    })

  } catch (error) {
    console.error('[CRON] Daily reminders cron error:', error)

    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// إضافة معلومات عن الـ endpoint للمطورين
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({
    name: 'Daily Reminders Cron Endpoint',
    description: 'Endpoint لتشغيل التذكيرات اليومية تلقائياً',
    methods: ['GET', 'POST'],
    authentication: 'API Key via header x-api-key or query param key',
    usage: {
      curl: 'curl -X GET "https://nukhba.media/api/cron/daily-reminders?key=YOUR_API_KEY"',
      cronService: 'Configure cron-job.org to call this endpoint daily at 9:00 AM',
      headers: {
        'x-api-key': 'YOUR_API_KEY',
        'Content-Type': 'application/json'
      }
    },
    schedule: {
      recommended: 'Daily at 9:00 AM UTC+3 (Saudi Arabia time)',
      format: '0 6 * * *', // 6 AM UTC = 9 AM UTC+3
      url: 'https://nukhba.media/api/cron/daily-reminders'
    },
    reminderTypes: [
      'quoted: بعد يومين من العرض، ثم كل 3 أيام',
      'approved: بعد يوم من الموافقة، ثم كل يومين',
      'content_review: بعد 3 أيام من المحتوى، ثم كل 4 أيام'
    ]
  })
}
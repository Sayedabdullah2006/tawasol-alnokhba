import { NextRequest, NextResponse } from 'next/server'
import { ensureDailyFirst1Education, rebalanceScheduledFirst1Education } from '@/lib/first1-education'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_API_KEY = process.env.CRON_API_KEY || 'nukhba-daily-reminders-2024'

export async function POST(request: NextRequest) {
  const key = request.headers.get('x-api-key') || request.nextUrl.searchParams.get('key') || request.headers.get('authorization')?.replace('Bearer ', '')
  if (key !== CRON_API_KEY) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    if (request.nextUrl.searchParams.get('rebalance') === '1') {
      return NextResponse.json({ success: true, ...(await rebalanceScheduledFirst1Education()) })
    }
    const result = await ensureDailyFirst1Education()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'تعذّر إنشاء المحتوى التثقيفي' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}

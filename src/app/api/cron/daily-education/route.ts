import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const CRON_API_KEY = process.env.CRON_API_KEY || 'nukhba-daily-reminders-2024'

export async function POST(request: NextRequest) {
  const key = request.headers.get('x-api-key') || request.nextUrl.searchParams.get('key') || request.headers.get('authorization')?.replace('Bearer ', '')
  if (key !== CRON_API_KEY) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({
    success: true,
    disabled: true,
    message: 'تم تعطيل التوليد والجدولة التلقائية للمحتوى التثقيفي.',
  })
}

export async function GET(request: NextRequest) {
  return POST(request)
}

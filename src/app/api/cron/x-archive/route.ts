import { NextRequest, NextResponse } from 'next/server'
import { importNextFirst1XArchiveWindow } from '@/lib/first1-x-archive'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const CRON_API_KEY = process.env.CRON_API_KEY || 'nukhba-daily-reminders-2024'

export async function POST(request: NextRequest) {
  const key = request.headers.get('x-api-key') || request.nextUrl.searchParams.get('key')
  if (key !== CRON_API_KEY) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ success: true, ...(await importNextFirst1XArchiveWindow()) })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'تعذّر استيراد أرشيف X' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}

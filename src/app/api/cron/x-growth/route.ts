import { NextRequest, NextResponse } from 'next/server'
import { syncCurrentXInsights } from '@/lib/x-insights'
import { xConfigured } from '@/lib/x-oauth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function run(request: NextRequest) {
  const expectedKey = process.env.CRON_API_KEY
  const suppliedKey = request.headers.get('x-api-key')
  if (!expectedKey) return NextResponse.json({ error: 'CRON_API_KEY غير مهيأ' }, { status: 503 })
  if (suppliedKey !== expectedKey) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
  if (!xConfigured()) return NextResponse.json({ error: 'إعدادات X غير مكتملة' }, { status: 503 })
  try {
    return NextResponse.json({ success: true, ...(await syncCurrentXInsights()) })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'تعذّر تحديث نمو X' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return run(request)
}

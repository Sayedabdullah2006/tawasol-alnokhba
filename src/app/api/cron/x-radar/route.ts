import { NextRequest, NextResponse } from 'next/server'
import { scanXRadar } from '@/lib/x-radar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_API_KEY = process.env.CRON_API_KEY || 'nukhba-daily-reminders-2024'

async function handle(request: NextRequest) {
  const key = request.headers.get('x-api-key')
    || request.headers.get('authorization')?.replace('Bearer ', '')
    || request.nextUrl.searchParams.get('key')
  if (key !== CRON_API_KEY) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    return NextResponse.json(await scanXRadar('scheduled'))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'X radar scan failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) { return handle(request) }
export async function POST(request: NextRequest) { return handle(request) }

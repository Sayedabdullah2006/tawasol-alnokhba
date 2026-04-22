// جدولة داخلية بدون خدمات خارجية
// NextJS API route يتحقق من الوقت ويشغل التذكيرات

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'

// آخر مرة تم تشغيل التذكيرات (in-memory - سيتم reset عند إعادة تشغيل الخادم)
let lastReminderRun: Date | null = null

// الوقت المحدد للتشغيل اليومي (6 AM UTC = 9 AM Saudi Arabia)
const DAILY_RUN_HOUR_UTC = 6

export async function GET(request: NextRequest) {
  try {
    const now = new Date()
    const currentHour = now.getUTCHours()

    console.log(`[SCHEDULER] Called at ${now.toISOString()}, hour: ${currentHour}`)

    // تحقق من الوقت المحدد
    if (currentHour !== DAILY_RUN_HOUR_UTC) {
      return NextResponse.json({
        message: `Not time for reminders. Current hour: ${currentHour}, Target hour: ${DAILY_RUN_HOUR_UTC} UTC`,
        nextRunTime: getNextRunTime(),
        currentTime: now.toISOString()
      })
    }

    // تحقق من عدم التشغيل اليوم بالفعل
    if (lastReminderRun) {
      const daysSinceLastRun = Math.floor(
        (now.getTime() - lastReminderRun.getTime()) / (1000 * 60 * 60 * 24)
      )

      if (daysSinceLastRun === 0) {
        return NextResponse.json({
          message: 'Reminders already ran today',
          lastRun: lastReminderRun.toISOString(),
          nextRun: getNextRunTime()
        })
      }
    }

    console.log('[SCHEDULER] Time to run daily reminders!')

    // تشغيل التذكيرات
    const supabase = await createServiceRoleClient()

    const { data, error } = await supabase.functions.invoke('daily-reminders', {
      body: {
        source: 'internal-scheduler',
        timestamp: now.toISOString()
      }
    })

    if (error) {
      throw new Error(`Failed to run reminders: ${error.message}`)
    }

    // تحديث آخر تشغيل
    lastReminderRun = now

    console.log('[SCHEDULER] Daily reminders completed successfully')

    return NextResponse.json({
      success: true,
      message: 'Daily reminders executed successfully',
      executedAt: now.toISOString(),
      nextRun: getNextRunTime(),
      result: data
    })

  } catch (error) {
    console.error('[SCHEDULER] Error:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// حساب موعد التشغيل التالي
function getNextRunTime(): string {
  const tomorrow = new Date()
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  tomorrow.setUTCHours(DAILY_RUN_HOUR_UTC, 0, 0, 0)
  return tomorrow.toISOString()
}

// للتشغيل اليدوي
export async function POST(request: NextRequest) {
  try {
    console.log('[SCHEDULER] Manual trigger requested')

    const supabase = await createServiceRoleClient()

    const { data, error } = await supabase.functions.invoke('daily-reminders', {
      body: {
        source: 'manual-scheduler',
        timestamp: new Date().toISOString()
      }
    })

    if (error) {
      throw new Error(`Manual reminder failed: ${error.message}`)
    }

    lastReminderRun = new Date()

    return NextResponse.json({
      success: true,
      message: 'Manual reminders executed successfully',
      executedAt: new Date().toISOString(),
      result: data
    })

  } catch (error) {
    console.error('[SCHEDULER] Manual trigger error:', error)

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
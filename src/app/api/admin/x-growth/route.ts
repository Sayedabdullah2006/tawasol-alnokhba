import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin-auth'
import {
  createGrowthExperiment,
  optimizeXDraft,
  regenerateWeeklyPlan,
  updateConversationStatus,
  updateGrowthExperimentStatus,
  type GrowthConversation,
  type GrowthExperiment,
} from '@/lib/x-growth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type RequestBody =
  | { action: 'optimize'; draft: string }
  | { action: 'plan' }
  | {
      action: 'experiment'
      name: string
      hypothesis: string
      primaryMetric: GrowthExperiment['primary_metric']
      variantA: string
      variantB: string
    }
  | { action: 'conversation'; postId: string; status: GrowthConversation['status'] }
  | { action: 'experimentStatus'; id: string; status: GrowthExperiment['status'] }

export async function POST(request: Request) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })

  let body: RequestBody
  try {
    body = await request.json() as RequestBody
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 })
  }

  try {
    if (body.action === 'optimize') {
      return NextResponse.json({ analysis: await optimizeXDraft(body.draft, user.id) })
    }
    if (body.action === 'plan') {
      return NextResponse.json({ plan: await regenerateWeeklyPlan(user.id) })
    }
    if (body.action === 'experiment') {
      return NextResponse.json({ experiment: await createGrowthExperiment(body, user.id) })
    }
    if (body.action === 'conversation') {
      const allowed: GrowthConversation['status'][] = ['open', 'reviewed', 'replied', 'dismissed']
      if (!allowed.includes(body.status)) return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 })
      return NextResponse.json(await updateConversationStatus(body.postId, body.status))
    }
    if (body.action === 'experimentStatus') {
      const allowed: GrowthExperiment['status'][] = ['draft', 'running', 'completed', 'cancelled']
      if (!allowed.includes(body.status)) return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 })
      return NextResponse.json({ experiment: await updateGrowthExperimentStatus(body.id, body.status) })
    }
    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذّر تنفيذ الإجراء' }, { status: 500 })
  }
}

import { createServiceRoleClient } from '@/lib/supabase-server'

export type GenerationScope = 'standalone' | 'request' | 'inso' | 'social'

export async function startGenerationJob(args: {
  ownerId: string
  scope: GenerationScope
  operation: string
  targetId?: string | null
}) {
  const service = await createServiceRoleClient()
  const { data, error } = await service.from('generation_jobs').insert({
    owner_id: args.ownerId,
    scope: args.scope,
    operation: args.operation,
    target_id: args.targetId ?? null,
  }).select('id').single()
  if (error) throw error
  return data.id as string
}

export async function completeGenerationJob(id: string | null, result?: Record<string, unknown>) {
  if (!id) return
  const service = await createServiceRoleClient()
  await service.from('generation_jobs').update({
    status: 'completed', result: result ?? null, completed_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'running')
}

export async function failGenerationJob(id: string | null, error: unknown) {
  if (!id) return
  const service = await createServiceRoleClient()
  const message = error instanceof Error ? error.message : 'تعذّر إكمال التوليد'
  await service.from('generation_jobs').update({
    status: 'failed', error_message: message, completed_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'running')
}

export async function throwIfGenerationCancelled(id: string | null) {
  if (!id) return
  const service = await createServiceRoleClient()
  const { data } = await service.from('generation_jobs').select('status').eq('id', id).single()
  if (data?.status === 'cancelled') throw new Error('تم إلغاء طلب التوليد')
}

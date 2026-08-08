'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

type PostState = 'idle' | 'running' | 'done' | 'failed'

export default function CampaignAutoGenerator({ request, onFinished }: { request: any; onFinished: () => void }) {
  const { showToast } = useToast()
  const posts = Array.isArray(request?.campaign_posts) ? request.campaign_posts : []
  const [running, setRunning] = useState(false)
  const [states, setStates] = useState<Record<number, { state: PostState; message?: string }>>({})
  if (request?.request_type !== 'campaign' || !posts.length) return null

  const setPostState = (index: number, state: PostState, message?: string) =>
    setStates(previous => ({ ...previous, [index]: { state, message } }))

  const call = async (body: Record<string, unknown>) => {
    const response = await fetch('/api/admin/ai-generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error ?? 'تعذّر تنفيذ خطوة التوليد')
    return data
  }

  const generatePost = async (post: any, postIndex: number) => {
    const sourceImages = Array.isArray(post?.images)
      ? post.images.filter((url: unknown): url is string => typeof url === 'string' && url.length > 0).slice(0, 5)
      : []
    if (!sourceImages.length) throw new Error('لا توجد صورة مصدر لهذا الخبر')

    setPostState(postIndex, 'running', 'تحليل الخبر…')
    const base = { requestId: request.id, postIndex, sourceImages }
    const analysisResult = await call({ ...base, step: 'analyze' })
    setPostState(postIndex, 'running', 'صياغة المحتوى…')
    await call({ ...base, step: 'tweets' })
    setPostState(postIndex, 'running', 'اقتراح اتجاهات التصميم…')
    const conceptsResult = await call({ ...base, step: 'concepts' })
    const concepts = Array.isArray(conceptsResult.concepts) ? conceptsResult.concepts : []
    if (!concepts.length) throw new Error('لم تُقترح اتجاهات تصميم لهذا الخبر')

    const designs: Array<{ title: string; imageUrl: string; brief: string }> = []
    for (let index = 0; index < concepts.length; index += 1) {
      const concept = concepts[index] ?? {}
      setPostState(postIndex, 'running', `توليد التصميم ${index + 1}/${concepts.length}…`)
      const brief = String(concept.brief ?? concept.title ?? '')
      const imageResult = await call({ ...base, step: 'image', chosenConcept: brief })
      if (typeof imageResult.imageUrl === 'string') {
        designs.push({ title: String(concept.title ?? `اتجاه ${index + 1}`), imageUrl: imageResult.imageUrl, brief })
        await fetch('/api/admin/save-studio-state', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: request.id, postIndex, designs }),
        })
      }
    }
    if (!designs.length) throw new Error('لم يكتمل أي تصميم لهذا الخبر')
    void analysisResult
  }

  const start = async () => {
    if (!confirm(`سيجري توليد النص وثلاثة تصاميم لكل منشورات الحملة (${posts.length}) بالتتابع. هل تبدأ الآن؟`)) return
    setRunning(true)
    setStates(Object.fromEntries(posts.map((_: any, index: number) => [index, { state: 'idle' as PostState }])))
    let completed = 0
    for (let index = 0; index < posts.length; index += 1) {
      try {
        await generatePost(posts[index], index)
        setPostState(index, 'done', 'جاهز')
        completed += 1
      } catch (error) {
        setPostState(index, 'failed', error instanceof Error ? error.message : 'فشل التوليد')
      }
    }
    setRunning(false)
    onFinished()
    showToast(`اكتمل توليد ${completed} من ${posts.length} منشورات الحملة`)
  }

  return (
    <div className="bg-green/5 border border-green/25 rounded-2xl p-5 space-y-3" dir="rtl">
      <div>
        <h4 className="font-bold text-dark">⚡ توليد الحملة تلقائياً</h4>
        <p className="text-sm text-muted mt-1">يولد كل خبر بالتتابع: تحليل، نص مختلف، ثم 3 تصاميم. تُمرر عناوين ومضامين بقية الحملة للنموذج حتى لا تتكرر المعلومة أو زاوية الخبر.</p>
      </div>
      <div className="space-y-1.5">
        {posts.map((post: any, index: number) => {
          const entry = states[index]
          const icon = entry?.state === 'done' ? '✓' : entry?.state === 'failed' ? '!' : entry?.state === 'running' ? '…' : '•'
          const color = entry?.state === 'done' ? 'text-green' : entry?.state === 'failed' ? 'text-red-600' : entry?.state === 'running' ? 'text-blue-600' : 'text-muted'
          return <div key={index} className="flex items-center gap-2 text-xs"><span className={`w-5 text-center font-bold ${color}`}>{icon}</span><span className="min-w-0 flex-1 truncate">{index + 1}. {post?.title || `منشور ${index + 1}`}</span><span className={`${color} whitespace-nowrap`}>{entry?.message ?? 'بانتظار البدء'}</span></div>
        })}
      </div>
      <Button onClick={start} loading={running} disabled={running} className="w-full">⚡ توليد النصوص والتصاميم للحملة</Button>
    </div>
  )
}

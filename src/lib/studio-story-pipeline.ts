export interface LinkConcept { title?: string; brief?: string; imagePrompt?: string; mood?: string }
export interface LinkDesign { title: string; imageUrl: string; brief: string; preparedPrompt?: string; conceptIndex: number }
export interface LinkStory {
  id: string; title: string; content: string; images: string[]; selectedImages: string[]; sourceUrl: string
  selected: boolean; analysis?: unknown; tweets?: string; selectedTweet?: string; selectedDesignUrl?: string; concepts?: LinkConcept[]; designs: LinkDesign[]; status?: string; error?: string
}
export interface StoryResponse { analysis?: unknown; tweets?: string; concepts?: LinkConcept[]; imageUrl?: string }

/** Each request carries this story's input and local analysis; retries retain completed steps. */
export async function runStoryPipeline(
  story: LinkStory,
  request: (payload: Record<string, unknown>) => Promise<StoryResponse>,
  update: (story: LinkStory) => void,
  stopped: () => boolean,
  target: 'tweets' | 'designs' = 'designs',
): Promise<LinkStory> {
  let current: LinkStory = { ...story, error: undefined }
  const base = { title: story.title, content: story.content, sourceImages: story.selectedImages, extraInfo: `رابط المصدر: ${story.sourceUrl}`, hasVideo: false }
  const stage = (status: string) => {
    if (stopped()) return false
    current = { ...current, status }; update(current); return true
  }
  try {
    if (!current.analysis) {
      if (!stage('جارٍ التحليل')) return current
      const data = await request({ ...base, step: 'analyze' })
      if (!data.analysis) throw new Error('لم يصل تحليل الخبر')
      current = { ...current, analysis: data.analysis }; update(current)
    }
    if (!current.tweets) {
      if (!stage('جارٍ توليد النصوص')) return current
      const data = await request({ ...base, step: 'tweets', analysis: current.analysis })
      if (!data.tweets) throw new Error('لم تصل نصوص الخبر')
      current = { ...current, tweets: data.tweets }; update(current)
    }
    if (target === 'tweets') {
      current = { ...current, status: current.designs.length === 3 ? 'مكتمل' : 'التغريدات جاهزة' }; update(current)
      return current
    }
    if (!current.concepts?.length) {
      if (!stage('جارٍ توليد الاتجاهات')) return current
      const data = await request({ ...base, step: 'concepts', analysis: current.analysis })
      if (data.concepts?.length !== 3) throw new Error('لم تصل الاتجاهات الثلاثة؛ حاول الاستكمال')
      current = { ...current, concepts: data.concepts }; update(current)
    }
    const concepts = current.concepts ?? []
    for (const [index, concept] of concepts.entries()) {
      if (current.designs.some(d => d.conceptIndex === index)) continue
      if (!stage(`جارٍ تصميم الاتجاه ${index + 1} من ${concepts.length}`)) return current
      const brief = concept.brief || concept.imagePrompt || concept.title || ''
      if (!brief) throw new Error('اتجاه التصميم فارغ')
      const data = await request({ ...base, step: 'image', analysis: current.analysis, chosenConcept: brief, preparedPrompt: concept.imagePrompt })
      if (!data.imageUrl) throw new Error('لم يصل التصميم؛ حاول الاستكمال')
      current = { ...current, designs: [...current.designs, { title: concept.title || `اتجاه ${index + 1}`, imageUrl: data.imageUrl, brief, preparedPrompt: concept.imagePrompt, conceptIndex: index }] }
      update(current)
    }
    current = { ...current, status: 'مكتمل' }; update(current)
  } catch (error) {
    current = { ...current, status: 'تعذّر الإكمال', error: error instanceof Error ? error.message : 'فشل الطلب' }; update(current)
  }
  return current
}

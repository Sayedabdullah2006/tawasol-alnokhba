import './register-ts-imports.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { extractArticle, materializeStories, isPublicIPv4, publicArticleUrl } from '../src/lib/studio-link-source.ts'
import { runStoryPipeline } from '../src/lib/studio-story-pipeline.ts'

const paragraph = 'حصل الباحث على جائزة علمية عن تطوير تقنية لمعالجة المياه، بعد عمله في البحث العلمي ضمن فريق متخصص في حلول الاستدامة.'
const html = `<html><head><title>قصص النجاح</title></head><body><nav><p>خبر التنقل</p></nav><h1>قصص النجاح</h1><article><div class="field--name-body"><h2>الباحث الأول</h2><p>${paragraph}</p><img src="/first.jpg" alt="الباحث الأول"><h2>الباحث الثاني</h2><p>${paragraph.replace('معالجة المياه', 'توليد الطاقة')}</p><img data-src="/second.jpg"><div class="related"><p>خبر مقترح لا يخص المقال</p></div><p><a href="/other">اقرأ أيضاً: خبر آخر</a></p></div></article><footer><p>معلومات التواصل</p></footer></body></html>`

test('extracts ordered source paragraphs and images, excluding surrounding recommendations', () => {
  const source = extractArticle(html, 'https://example.com/news')
  assert.equal(source.title, 'قصص النجاح')
  assert.deepEqual(source.blocks.map(b => b.text), ['الباحث الأول', paragraph, 'الباحث الأول', 'الباحث الثاني', paragraph.replace('معالجة المياه', 'توليد الطاقة'), 'صورة في المقال'])
  assert.equal(source.blocks[2].image, 'https://example.com/first.jpg')
})
test('materializes independent stories from original text without transferring the other photo', () => {
  const source = extractArticle(html, 'https://example.com/news')
  const stories = materializeStories(source, { stories: [{ title: 'الأول', blockIds: [3, 2, 1] }, { title: 'الثاني', blockIds: [4, 5, 6] }] })
  assert.equal(stories.length, 2)
  assert.equal(stories[0].content, `الباحث الأول\n\n${paragraph}`)
  assert.deepEqual(stories[0].images, ['https://example.com/first.jpg'])
  assert.deepEqual(stories[1].images, ['https://example.com/second.jpg'])
})
test('a single event retains all its paragraphs as one story', () => {
  const source = extractArticle(html, 'https://example.com/news')
  const result = materializeStories(source, { stories: [{ title: 'حدث مشترك', blockIds: source.blocks.map(b => b.id) }] })
  assert.equal(result.length, 1)
  assert.ok(result[0].content.includes('توليد الطاقة'))
})
test('rejects invented blocks and duplicate assignment instead of mixing stories', () => {
  const source = extractArticle(html, 'https://example.com/news')
  assert.throws(() => materializeStories(source, { stories: [{ title: 'خبر', blockIds: [99] }] }), /غير موجودة/)
  assert.throws(() => materializeStories(source, { stories: [{ title: 'خبر', blockIds: [1, 2] }, { title: 'آخر', blockIds: [2] }] }), /تداخل/)
  assert.throws(() => extractArticle('<article><p>قصير</p></article>', 'https://example.com'), /كافٍ/)
})
test('rejects private addresses and non-web credentialed URLs', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.31.1.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '::1', '0.0.0.0']) assert.equal(isPublicIPv4(ip), false, ip)
  assert.equal(isPublicIPv4('8.8.8.8'), true)
  await assert.rejects(publicArticleUrl('https://127.0.0.1/private'), /موقع عام/)
  await assert.rejects(publicArticleUrl('file:///etc/passwd'), /رابط/)
  await assert.rejects(publicArticleUrl('https://user:password@example.com'), /رابط/)
})

const story = name => ({ id: name, title: name, content: `تفاصيل ${name}`, images: [], selectedImages: [`https://example.com/${name}.jpg`], sourceUrl: 'https://example.com/news', selected: true, designs: [] })
const reply = payload => {
  if (payload.step === 'analyze') return { analysis: { name: payload.title } }
  if (payload.step === 'tweets') return { tweets: `نص ${payload.title}` }
  if (payload.step === 'concepts') return { concepts: [1, 2, 3].map(n => ({ title: `اتجاه ${n}`, brief: `تفاصيل الاتجاه ${n}`, imagePrompt: `برومبت ${n}` })) }
  return { imageUrl: `https://example.com/${payload.title}/${payload.preparedPrompt}.jpg` }
}
test('each news pipeline uses its own analysis, text and source pictures for all three designs', async () => {
  const requests = []
  const request = async payload => { requests.push(payload); return reply(payload) }
  const first = await runStoryPipeline(story('الأول'), request, () => {}, () => false)
  const second = await runStoryPipeline(story('الثاني'), request, () => {}, () => false)
  assert.equal(first.designs.length, 3); assert.equal(second.designs.length, 3)
  for (const payload of requests) {
    assert.equal(payload.content, `تفاصيل ${payload.title}`)
    assert.deepEqual(payload.sourceImages, [`https://example.com/${payload.title}.jpg`])
    if (payload.step !== 'analyze') assert.equal(payload.analysis.name, payload.title)
  }
})
test('resumes a failed design without repeating successful steps or images', async () => {
  let imageCalls = 0
  const partial = await runStoryPipeline(story('الأول'), async payload => {
    if (payload.step === 'image' && ++imageCalls === 2) throw new Error('شبكة')
    return reply(payload)
  }, () => {}, () => false)
  assert.equal(partial.designs.length, 1); assert.equal(partial.error, 'شبكة')
  const resumedRequests = []
  const completed = await runStoryPipeline(partial, async payload => { resumedRequests.push(payload); return reply(payload) }, () => {}, () => false)
  assert.equal(completed.designs.length, 3)
  assert.deepEqual(resumedRequests.map(p => p.step), ['image', 'image'])
  assert.equal(completed.error, undefined)
})
test('stops at a request boundary while retaining the just completed analysis', async () => {
  let stop = false; const requests = []
  const result = await runStoryPipeline(story('الأول'), async payload => { requests.push(payload); stop = true; return reply(payload) }, () => {}, () => stop)
  assert.equal(requests.length, 1)
  assert.equal(result.analysis.name, 'الأول')
  assert.equal(result.designs.length, 0)
})

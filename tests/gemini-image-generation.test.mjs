import './register-ts-imports.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGeminiImagePayload, extractGeminiImage, designImageProvider, geminiImageAspectRatio, generateImageWithGemini } from '../src/lib/gemini-image-generation.ts'
const { generateImageFromPartsWithOpenAI } = await import('../src/lib/image-generation.ts')

const image = { mimeType: 'image/png', data: 'aW1hZ2U=' }
const result = { candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: image }] } }] }
function configure(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const old = process.env[key]
    if (value === undefined) delete process.env[key]; else process.env[key] = value
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old })
  }
}
test('provider is explicit and reversible', () => {
  assert.equal(designImageProvider({}), 'openai')
  assert.equal(designImageProvider({ DESIGN_IMAGE_PROVIDER: 'gemini' }), 'gemini')
  assert.throws(() => designImageProvider({ DESIGN_IMAGE_PROVIDER: 'other' }))
})
test('sends source parts in order and preserves dimensions without web search', () => {
  const refs = [image, { mimeType: 'image/jpeg', data: 'c2Vjb25k' }]
  const payload = buildGeminiImagePayload('نص معتمد', refs, { aspectRatio: '16:9' })
  assert.deepEqual(payload.contents[0].parts.slice(1).map(p => p.inlineData), refs)
  assert.deepEqual(payload.generationConfig.imageConfig, { aspectRatio: '16:9', imageSize: '2K' })
  assert.equal(payload.generationConfig.responseFormat, undefined)
  assert.equal(payload.tools, undefined)
  assert.equal(geminiImageAspectRatio({ size: '1080x1350' }), '4:5')
  assert.equal(geminiImageAspectRatio({ size: '1088x1920' }), '9:16')
  assert.throws(() => buildGeminiImagePayload('', Array(15).fill(image), {}), /14/)
})
test('skips thought images and blocked candidates', () => {
  const response = { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ inlineData: image }] } }, { finishReason: 'STOP', content: { parts: [{ thought: true, inlineData: { ...image, data: 'ZHJhZnQ=' } }, { inlineData: image }] } }] }
  assert.deepEqual(extractGeminiImage(response), { b64: image.data, mimeType: image.mimeType })
  assert.throws(() => extractGeminiImage({ promptFeedback: { blockReason: 'SAFETY' } }), /رفض Gemini/)
  assert.throws(() => extractGeminiImage({ candidates: [{ content: { parts: [{ text: 'no image' }] } }] }), /صورة نهائية/)
})
test('shared entry routes to Nano Banana 2.1 with all editorial protections', async t => {
  configure(t, { DESIGN_IMAGE_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key', GEMINI_IMAGE_MODEL: undefined, GEMINI_IMAGE_SIZE: undefined })
  let body
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-nano-banana-2.1:generateContent')
    assert.equal(opts.headers['x-goog-api-key'], 'test-key')
    body = JSON.parse(opts.body)
    return Response.json(result)
  })
  assert.deepEqual(await generateImageFromPartsWithOpenAI('اسم الخبر وعبارته', [image], { aspectRatio: '4:5' }), { b64: image.data, mimeType: image.mimeType })
  const prompt = body.contents[0].parts[0].text
  for (const rule of ['FIRST1SAUDI', 'ABSOLUTE PHOTO FIDELITY', 'NO SOURCE PHOTO', 'FINAL ARTWORK TEXT RULE']) assert.ok(prompt.includes(rule))
  assert.equal(body.contents[0].parts[1].inlineData.data, image.data)
})
test('bad key fails once without exposing provider debug or silently switching', async t => {
  configure(t, { GEMINI_API_KEY: 'test-secret' })
  let calls = 0
  await assert.rejects(generateImageWithGemini('خبر', [], {}, async () => { calls++; return new Response('secret provider debug', { status: 403 }) }), error => !error.message.includes('test-secret') && !error.message.includes('debug') && /المفتاح/.test(error.message))
  assert.equal(calls, 1)
})
test('utility transforms keep their original provider', async t => {
  configure(t, { DESIGN_IMAGE_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key', OPENAI_API_KEY: undefined })
  await assert.rejects(generateImageFromPartsWithOpenAI('utility', [], { applyEditorialBaseline: false }), /OPENAI_API_KEY/)
})
test('API validation failures retain the reason while redacting credentials and image data', async t => {
  configure(t, { GEMINI_API_KEY: 'test-secret' })
  await assert.rejects(generateImageWithGemini('خبر', [], { retries: 0 }, async () => Response.json({ error: { message: `Invalid generationConfig: test-secret ${'A'.repeat(100)}` } }, { status: 400 })), error => error.message.includes('Invalid generationConfig') && !error.message.includes('test-secret') && !error.message.includes('A'.repeat(100)))
})
test('retries transient failure then accepts final image', async t => {
  configure(t, { GEMINI_API_KEY: 'test-key' })
  let calls = 0
  const actual = await generateImageWithGemini('خبر', [], { retries: 1 }, async () => ++calls === 1 ? new Response('', { status: 503 }) : Response.json(result))
  assert.equal(calls, 2); assert.equal(actual.b64, image.data)
})

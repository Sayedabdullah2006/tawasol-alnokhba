import assert from 'node:assert/strict'
import { test } from 'node:test'
import './register-ts-imports.mjs'

const { validateContent, validateText, ValidationException } = await import('../src/lib/validation.ts')
const { contentReadyForReview } = await import('../src/lib/email-templates.ts')

test('client review accepts long Arabic copy without truncation', () => {
  const content = 'قصة إنجاز سعودي موثّق، وتفاصيل الرحلة كاملة.\n\n'.repeat(3000)
  assert.ok(content.length > 100_000)
  assert.equal(validateContent(`  ${content}  `), content.trim())
})

test('client review accepts emoji sequences, punctuation, links and contact details', () => {
  const examples = [
    '👩🏽‍⚕️🌊🤿🇸🇦✨🎉'.repeat(1000),
    'أول سعودية تحصل على تصنيف «فني طب الغواصين» DMT من DAN Europe… 👇👇👇',
    'مُسعِفةٌ سعودية — إنجاز دولي…\nhttps://first1saudi.com/story?name=maha&lang=ar',
    'التواصل: editor@example.com أو +966501234567',
    'تهانينااااااااااااااااااااااااااااااااااا 🎉',
    'نعم',
    '🎉',
  ]
  for (const content of examples) assert.equal(validateContent(content), content)
})

test('client review still rejects missing, blank and non-string content', () => {
  for (const content of [undefined, null, '', ' \n\t ', 42, false, {}, [], ['نص']]) {
    assert.throws(() => validateContent(content), ValidationException)
  }
})

test('review content policy does not relax validation for other fields', () => {
  assert.throws(() => validateText('https://example.com', 'سبب الرفض'), ValidationException)
  assert.throws(() => validateText('أ'.repeat(1001), 'سبب الرفض'), ValidationException)
})

test('review email preserves long copy and emojis while rendering markup as literal text', () => {
  const content = `${'تفاصيل الإنجاز 👩🏽‍⚕️🌊🤿🇸🇦✨\n'.repeat(3000)}<script>alert("x")</script>\n<b>نص حرفي</b> & نهاية`
  const { html } = contentReadyForReview({
    email: 'client@example.com', requestNumber: 'ATH-0001', clientName: 'العميل',
    proposedContent: validateContent(content), proposedImages: [],
  })
  assert.ok(html.includes('تفاصيل الإنجاز 👩🏽‍⚕️🌊🤿🇸🇦✨\n'.repeat(3000)))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(html.includes('&lt;b&gt;نص حرفي&lt;/b&gt; &amp; نهاية'))
  assert.ok(!html.includes('<script>'))
  assert.ok(!html.includes('<b>نص حرفي</b>'))
})

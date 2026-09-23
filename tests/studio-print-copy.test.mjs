import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildGreetingPosterPrompt, greetingCopyFromNewsText } from '../src/lib/studio-print-copy.ts'

test('congratulatory copy preserves the user message and excludes design instructions', () => {
  const copy = greetingCopyFromNewsText(`العنوان: اليوم الوطني السعودي ٩٦
المحتوى: أسمى التهاني والتبريكات لمقام خادم الحرمين الشريفين الملك سلمان بن عبدالعزيز آل سعود وسمو ولي عهده الأمين الأمير محمد بن سلمان بن عبدالعزيز آل سعود والشعب السعودي الكريم بمناسبة اليوم الوطني السعودي.

كل يوم ووطنا في عزة ورفعة ونصر.

معلومات إضافية من الأدمن (راعِها في التحليل والاتجاهات والتصميم):
أظهر شعار عزّنا بطبعنا. النص الختامي: لا تطبع هذه التعليمات.`)
  assert.equal(copy?.kind, 'greeting')
  assert.equal(copy?.message, 'أسمى التهاني والتبريكات لمقام خادم الحرمين الشريفين الملك سلمان بن عبدالعزيز آل سعود وسمو ولي عهده الأمين الأمير محمد بن سلمان بن عبدالعزيز آل سعود والشعب السعودي الكريم بمناسبة اليوم الوطني السعودي.')
  assert.equal(copy?.closing, 'كل يوم ووطنا في عزة ورفعة ونصر.')
  assert.equal(copy?.slogan, 'عزّنا بطبعنا')
  assert.equal(JSON.stringify(copy).includes('النص الختامي:'), false)
})

test('campaign metadata does not enter the printed greeting', () => {
  const copy = greetingCopyFromNewsText('العنوان: مناسبة وطنية\nالمحتوى: نهنئ الشعب السعودي بمناسبة اليوم الوطني.\n\nاسم صاحب الإنجاز (معلومة موثقة من الطلب، استخدمه حرفياً في حقل name ولا تُسقطه): شخص آخر')
  assert.equal(copy?.message, 'نهنئ الشعب السعودي بمناسبة اليوم الوطني.')
  assert.equal(copy?.closing, undefined)
})

test('ordinary news does not enter greeting mode', () => {
  assert.equal(greetingCopyFromNewsText('العنوان: إنجاز علمي\nالمحتوى: فاز الباحث بجائزة دولية في العلوم.'), null)
})

test('greeting prompt isolates approved copy from analytical direction', () => {
  const prompt = buildGreetingPosterPrompt({
    kind: 'greeting',
    message: 'أسمى التهاني والتبريكات للشعب السعودي بمناسبة اليوم الوطني.',
    closing: 'كل يوم ووطننا في عزة ورفعة ونصر.',
    slogan: 'عزّنا بطبعنا',
  }, { direction: 'المناسبة: اليوم الوطني؛ التهنئة موجهة إلى الشعب', note: 'النص الختامي: وصف تخطيط فقط' })
  assert.match(prompt, /"أسمى التهاني والتبريكات للشعب السعودي بمناسبة اليوم الوطني\."/)
  assert.match(prompt, /"كل يوم ووطننا في عزة ورفعة ونصر\."/)
  assert.match(prompt, /"عزّنا بطبعنا"/)
  assert.match(prompt, /@First1Saudi/)
  assert.match(prompt, /must not appear on the artwork/)
  assert.doesNotMatch(prompt, /NAME:|HEADLINE:|FACT:/)
})

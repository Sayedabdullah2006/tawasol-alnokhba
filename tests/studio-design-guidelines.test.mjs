import assert from 'node:assert/strict'
import { test } from 'node:test'
import './register-ts-imports.mjs'

const { buildCompactImagePrompt, videoLayoutFor } = await import('../src/lib/studio-image-prompt.ts')
const { STUDIO_DESIGN_DIRECTIONS, studioFooterHeight } = await import('../src/lib/studio-design-guidelines.ts')

test('engagement poster reads full name, one achievement and one useful metric in order', () => {
  const name = 'الدكتور عبدالعزيز بن محمد بن عبدالله آل سعود'
  const news = 'ينال براءة اختراع في الذكاء الاصطناعي'
  const fact = '3 براءات اختراع'
  const prompt = buildCompactImagePrompt({
    analysis: { news_type: 'patent-innovation', name, poster_headline: news, subtitle: 'تفصيل لا يطبع', standout_metric: fact, info_labels: ['2020', 'مكتب البراءات الأمريكي'] },
    chosenConcept: 'تكوين تحريري يدمج الصورة الأصلية',
  })
  assert.equal(prompt.split(`"${name}"`).length - 1, 1)
  assert.ok(prompt.indexOf(`"${name}"`) < prompt.indexOf(`"${news}"`))
  assert.ok(prompt.indexOf(`"${news}"`) < prompt.indexOf(`"${fact}"`))
  assert.equal((prompt.match(/ONE PROMINENT VERIFIED METRIC \(/g) ?? []).length, 1)
  assert.doesNotMatch(prompt, /"تفصيل لا يطبع"|"2020"|"مكتب البراءات الأمريكي"/)
  assert.match(prompt, /at least 60%/)
  for (const color of ['#15432F', '#D2D869', '#FCFAF3']) assert.ok(prompt.includes(color))
  assert.doesNotMatch(prompt, /#0A3A2A|#D4AF37|HEADER PLAQUE:|NAMES BOX/)
  assert.match(prompt, /No background-only or pasted-person workflow/)
  assert.match(prompt, /Do not shorten, rewrite or paraphrase/)
  assert.match(prompt, /y=1205\.\.1350/)
  assert.match(prompt, /Instagram\/X\/LinkedIn\/Facebook\/TikTok/)
  assert.match(prompt, /First1Saudi/)
})

test('legacy analysis uses its actual achievement and only available facts', () => {
  const prompt = buildCompactImagePrompt({ analysis: { name: 'سارة عبدالله', achievement_core: 'فازت بجائزة علمية دولية', key_facts: ['جائزة علمية'] }, chosenConcept: '' })
  assert.equal((prompt.match(/ONE PROMINENT VERIFIED METRIC \(/g) ?? []).length, 0)
  assert.match(prompt, /never fill gaps by inventing facts/)
  assert.match(prompt, /Classify from the verified achievement/)
})

test('a deliberately empty metric does not fall back to an irrelevant historical date', () => {
  const prompt = buildCompactImagePrompt({ analysis: { name: 'سارة عبدالله', poster_headline: 'تفوز بجائزة علمية', standout_metric: '', key_facts: ['تأسست الجامعة عام 1903'] }, chosenConcept: '' })
  assert.doesNotMatch(prompt, /ONE PROMINENT VERIFIED METRIC \(|"تأسست الجامعة عام 1903"/)
})

test('review bundle cannot be published as a single post while an approved main post remains valid', async () => {
  const { isStudioReviewBundle } = await import('../src/lib/studio-review-bundle.ts')
  assert.equal(isStudioReviewBundle('التغريدة الرئيسية:\nإنجاز علمي\nالرد الأول (مع الرابط):\nالحكاية هنا\n3 بدائل للخطاف:\nبديل'), true)
  assert.equal(isStudioReviewBundle('إنجاز علمي في أكسفورد\n🔹 حقيقة مسندة\nما المجال الذي يهمك؟\n#أكسفورد'), false)
})

test('full multi-person names are never truncated and honorific is not repeated', () => {
  const name = Array.from({ length: 12 }, (_, i) => `الباحث ${i + 1} عبدالله محمد عبدالعزيز`).join('، ')
  assert.ok(buildCompactImagePrompt({ analysis: { name }, chosenConcept: '' }).includes(`"${name}"`))
  const withTitle = buildCompactImagePrompt({ analysis: { name: 'الدكتورة سارة عبدالله', honorific: 'الدكتورة' }, chosenConcept: '' })
  assert.ok(withTitle.includes('"الدكتورة سارة عبدالله"'))
  assert.ok(!withTitle.includes('الدكتورة الدكتورة'))
})

test('greeting bypasses news facts while preserving exact approved copy', () => {
  const prompt = buildCompactImagePrompt({
    analysis: { name: 'لا يُطبع', key_facts: ['لا تُطبع'], poster_copy: { kind: 'greeting', message: 'نهنئ الشعب السعودي بمناسبة اليوم الوطني.' } }, chosenConcept: '',
  })
  assert.doesNotMatch(prompt, /TOP FULL NAME \(|SUPPORTING INFOGRAPHIC FACT/)
  assert.match(prompt, /"نهنئ الشعب السعودي بمناسبة اليوم الوطني\."/)
  assert.match(prompt, /Integrate the actual source photo/)
  assert.match(prompt, /identity-logo\.svg/)
})

test('fallback directions are flexible and video windows remain below news and above footer', () => {
  assert.equal(STUDIO_DESIGN_DIRECTIONS.length, 3)
  assert.ok(!STUDIO_DESIGN_DIRECTIONS.some(d => /الاحتفالي الكلاسيكي|الدرامي الحماسي|الأنيق المختصر/.test(d.title)))
  assert.match(videoLayoutFor('portrait'), /405×720/)
  assert.match(videoLayoutFor('portrait'), /y=420\.\.1140/)
  assert.match(videoLayoutFor('landscape'), /960×540/)
  assert.match(videoLayoutFor('landscape'), /full name then the complete news/)
  assert.equal(studioFooterHeight(1080, 1350), 145)
  assert.equal(studioFooterHeight(1600, 900), 144)
})

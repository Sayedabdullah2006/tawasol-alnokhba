import assert from 'node:assert/strict'
import { test } from 'node:test'
import './register-ts-imports.mjs'

const { buildCompactImagePrompt, videoLayoutFor } = await import('../src/lib/studio-image-prompt.ts')
const { STUDIO_DESIGN_DIRECTIONS } = await import('../src/lib/studio-design-guidelines.ts')

test('patent copy uses full names, four facts and protected digital-logo space', () => {
  const name = 'الدكتور عبدالعزيز بن محمد بن عبدالله آل سعود'
  const prompt = buildCompactImagePrompt({
    analysis: {
      news_type: 'patent-innovation', name, headline: 'براءة اختراع تقنية',
      subtitle: 'ابتكار في الذكاء الاصطناعي', subtitle_en: 'Artificial intelligence innovation',
      info_labels: ['الذكاء الاصطناعي', 'مكتب البراءات', 'جامعة سعودية', 'تحسين الكفاءة'],
    },
    chosenConcept: 'اتجاه قديم: ألوان بيضاء وتيل وفوتر سوشال',
  })
  assert.equal(prompt.split(`"${name}"`).length - 1, 1)
  assert.equal((prompt.match(/INFO LABEL \(/g) ?? []).length, 4)
  assert.match(prompt, /#0A3A2A/)
  assert.match(prompt, /#D4AF37/)
  assert.match(prompt, /never for patents, appointments/)
  assert.match(prompt, /NEVER generate brand\/event logos, social-media icons, handles/)
  assert.match(prompt, /area below it through the bottom edge with NO text/)
  assert.match(prompt, /even if an old concept or optional template asks otherwise/)
  assert.match(prompt, /SINGLE SMALL ENGLISH SUBTITLE: "Artificial intelligence innovation"/)
})

test('old analysis remains usable without inventing missing facts', () => {
  const prompt = buildCompactImagePrompt({ analysis: { name: 'سارة عبدالله', achievement_core: 'فازت بجائزة علمية دولية', key_facts: ['جائزة علمية'] }, chosenConcept: '' })
  assert.equal((prompt.match(/INFO LABEL \(/g) ?? []).length, 1)
  assert.match(prompt, /Classify from the verified achievement/)
  assert.match(prompt, /never fill gaps by inventing facts/)
})

test('full multi-person names are not truncated to the old 160-character limit', () => {
  const name = Array.from({ length: 12 }, (_, i) => `الباحث ${i + 1} عبدالله محمد عبدالعزيز`).join('، ')
  const prompt = buildCompactImagePrompt({ analysis: { name, headline: 'إنجاز علمي سعودي' }, chosenConcept: '' })
  assert.ok(prompt.includes(`"${name}"`))
})

test('greeting bypasses news plaque and facts while keeping brand/logo rules', () => {
  const prompt = buildCompactImagePrompt({
    analysis: { name: 'لا يُطبع', key_facts: ['لا تُطبع'], poster_copy: { kind: 'greeting', message: 'نهنئ الشعب السعودي بمناسبة اليوم الوطني.' } },
    chosenConcept: 'الأنيق المختصر',
  })
  assert.doesNotMatch(prompt, /HEADER PLAQUE:|NAMES BOX|INFO LABEL/)
  assert.match(prompt, /"نهنئ الشعب السعودي بمناسبة اليوم الوطني\."/)
  assert.match(prompt, /never add a slogan or any words underneath it/)
})

test('no reference uses symbols; portrait video ends above the reserved logo area', () => {
  const prompt = buildCompactImagePrompt({ analysis: {}, chosenConcept: '', hasVideo: true, videoOrientation: 'portrait' })
  assert.match(prompt, /NEVER a fake human face/)
  assert.match(prompt, /lower edge above the bottom 220-pixel/)
  assert.match(videoLayoutFor('landscape'), /16:9 video window/)
  assert.deepEqual(STUDIO_DESIGN_DIRECTIONS.map(item => item.title), ['الاحتفالي الكلاسيكي', 'الدرامي الحماسي', 'الأنيق المختصر'])
})

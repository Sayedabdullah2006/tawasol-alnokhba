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
      info_phrases: ['سُجل في مكتب البراءات', 'طورته جامعة سعودية', 'يسهم في تحسين الكفاءة', 'نتيجة بحث تقني موثق'],
    },
    chosenConcept: 'اتجاه قديم: ألوان بيضاء وتيل وفوتر سوشال',
  })
  assert.equal(prompt.split(`"${name}"`).length - 1, 1)
  assert.equal((prompt.match(/INFO PHRASE \(/g) ?? []).length, 4)
  assert.match(prompt, /#0A3A2A/)
  assert.match(prompt, /#D4AF37/)
  assert.match(prompt, /never for patents, appointments/)
  assert.match(prompt, /NEVER generate brand\/event logos, URLs or watermarks/)
  assert.match(prompt, /area below it through the bottom edge with NO text/)
  assert.match(prompt, /even if an old concept or optional template asks otherwise/)
  assert.match(prompt, /SINGLE SMALL ENGLISH SUBTITLE: "Artificial intelligence innovation"/)
})

test('old analysis remains usable without inventing missing facts', () => {
  const prompt = buildCompactImagePrompt({ analysis: { name: 'سارة عبدالله', achievement_core: 'فازت بجائزة علمية دولية', key_facts: ['جائزة علمية'] }, chosenConcept: '' })
  assert.equal((prompt.match(/INFO PHRASE \(/g) ?? []).length, 1)
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
  assert.doesNotMatch(prompt, /PRIMARY NAME|CONNECTED ACHIEVEMENT|INFO PHRASE/)
  assert.match(prompt, /"نهنئ الشعب السعودي بمناسبة اليوم الوطني\."/)
  assert.match(prompt, /never add a slogan or any words underneath it/)
})

test('no reference uses text and icons only; portrait video ends above the reserved logo area', () => {
  const prompt = buildCompactImagePrompt({ analysis: {}, chosenConcept: 'صورة مختبر واقعي وباحث أمامه', sourceImageCount: 0, hasVideo: true, videoOrientation: 'portrait' })
  assert.match(prompt, /NEVER a fake human face/)
  assert.match(prompt, /ACTUAL SOURCE PHOTO COUNT: 0/)
  assert.match(prompt, /no invented person, portrait, silhouette, stock photo, realistic scene/)
  assert.match(prompt, /overrides all photographic or scenic creative directions/)
  assert.doesNotMatch(prompt, /professional symbolic field illustration/)
  assert.match(prompt, /lower edge above the bottom 220-pixel/)
  assert.match(videoLayoutFor('landscape'), /16:9 video window/)
  assert.deepEqual(STUDIO_DESIGN_DIRECTIONS.map(item => item.title), ['الاحتفالي الكلاسيكي', 'الدرامي الحماسي', 'الأنيق المختصر'])
})

test('real source photographs and greetings retain the appropriate no-photo policy', () => {
  const withPhoto = buildCompactImagePrompt({ analysis: { name: 'الباحث' }, chosenConcept: '', sourceImageCount: 1 })
  assert.doesNotMatch(withPhoto, /ACTUAL SOURCE PHOTO COUNT: 0/)
  assert.match(withPhoto, /intact documentary photograph/)
  const greeting = buildCompactImagePrompt({ analysis: { poster_copy: { kind: 'greeting', message: 'مبارك الإنجاز' } }, chosenConcept: 'صورة شخص', sourceImageCount: 0 })
  assert.match(greeting, /ACTUAL SOURCE PHOTO COUNT: 0/)
})

test('new fidelity and emblem exclusions reach news, greeting and video prompts', () => {
  const inputs = [
    { analysis: { news_type: 'competition win', headline: 'الميدالية الذهبية' }, chosenConcept: 'ضع كأساً بيد البطل وميدالية على صدره' },
    { analysis: { poster_copy: { kind: 'greeting', message: 'نهنئ الشعب السعودي بمناسبة اليوم الوطني.' } }, chosenConcept: '' },
    { analysis: { news_type: 'scientific discovery' }, chosenConcept: '', hasVideo: true, videoOrientation: 'portrait' },
  ]
  for (const input of inputs) {
    const prompt = buildCompactImagePrompt(input)
    assert.match(prompt, /HIGHEST PRIORITY, overriding every other instruction/)
    assert.match(prompt, /NEVER add medals, trophies or any objects to the people/)
    assert.match(prompt, /never remove or change existing objects on them/)
    assert.match(prompt, /crossed swords and palm tree \/ السيفين والنخلة/)
    assert.match(prompt, /Do not draw this area as a visible box or card/)
    assert.match(prompt, /generate the design WITHOUT Arabic story text/)
  }
})

test('competition badges stay separate from unchanged centered photo cutouts', () => {
  const prompt = buildCompactImagePrompt({ analysis: { news_type: 'competition win', headline: 'المركز الأول' }, chosenConcept: 'الدرامي الحماسي' })
  assert.match(prompt, /outside the reference photos and never attached to a person/)
  assert.match(prompt, /never interrupt the name\/sentence pair/)
  assert.match(prompt, /Do not generate a design before its news type is clear/)
  assert.match(prompt, /Arabic copy is limited to the primary name/)
})

test('top label follows the story instead of a fixed achievement phrase', () => {
  for (const header_label of ['تتويج عالمي', 'ابتكار سعودي', 'جائزة دولية']) {
    const prompt = buildCompactImagePrompt({ analysis: { header_label, headline: 'المركز الأول' }, chosenConcept: '' })
    assert.match(prompt, new RegExp(`STORY-SPECIFIC HEADER .*"${header_label}"`))
    assert.doesNotMatch(prompt, /HEADER PLAQUE: "إنجاز سعودي"/)
  }
  const old = buildCompactImagePrompt({ analysis: { context_label: 'بطولة العالم' }, chosenConcept: '' })
  assert.match(old, /STORY-SPECIFIC HEADER .*"بطولة العالم"/)
  const empty = buildCompactImagePrompt({ analysis: {}, chosenConcept: '' })
  assert.doesNotMatch(empty, /STORY-SPECIFIC HEADER \(/)
})

test('AI generates the curved social footer while only original logos are digital', () => {
  const prompt = buildCompactImagePrompt({ analysis: { header_label: 'ابتكار سعودي' }, chosenConcept: '' })
  assert.match(prompt, /MANDATORY GENERATED FOOTER/)
  assert.match(prompt, /X, Instagram, LinkedIn, Facebook, TikTok/)
  assert.match(prompt, /exact bold white account text "@First1Saudi"/)
  assert.match(prompt, /Never omit any icon, the handle or the curve/)
  assert.match(prompt, /ONLY original logos are composited digitally/)
  assert.match(prompt, /NO separate rectangle, rounded card/)
  assert.doesNotMatch(prompt, /NEVER generate.*social-media icons|footer is added digitally|social icons and @First1Saudi are composited digitally/)
})

test('three directions require visibly different background brightness', () => {
  const prompt = buildCompactImagePrompt({ analysis: { headline: 'ابتكار سعودي' }, chosenConcept: 'الأنيق المختصر' })
  assert.match(prompt, /BACKGROUND VARIETY IS MANDATORY/)
  assert.match(prompt, /clearly LIGHT ivory, warm-white or very pale-emerald dominant background/)
  assert.match(prompt, /Do not output all three on dark backgrounds/)
  assert.match(prompt, /deep emerald on light surfaces/)
  assert.doesNotMatch(prompt, /white only for names|white may only be a small supporting detail/)
  assert.match(STUDIO_DESIGN_DIRECTIONS[0].brief, /زمردي متوسط أو أخضر فاتح/)
  assert.match(STUDIO_DESIGN_DIRECTIONS[1].brief, /خلفية زمردية داكنة/)
  assert.match(STUDIO_DESIGN_DIRECTIONS[2].brief, /خلفية فاتحة سائدة/)
})

test('name is dominant and its grammatical achievement follows before secondary context', () => {
  const prompt = buildCompactImagePrompt({ analysis: {
    name: 'د. بشرى عبدالله الحجيلي', achievement_sentence: 'تحصل على الدكتوراه بتقدير ممتاز مرتفع',
    headline: 'ريادة حضرية سعودية', header_label: 'إنجاز أكاديمي',
    info_phrases: ['بحث في إعادة تأهيل الأحياء', 'دراسة تطبيقية على ينبع البحر'],
  }, chosenConcept: '' })
  const name = prompt.indexOf('PRIMARY NAME (')
  const sentence = prompt.indexOf('CONNECTED ACHIEVEMENT (')
  const context = prompt.indexOf('STORY-SPECIFIC HEADER (')
  assert.ok(name >= 0 && name < sentence && sentence < context)
  assert.ok(prompt.includes('"تحصل على الدكتوراه بتقدير ممتاز مرتفع"'))
  assert.doesNotMatch(prompt.slice(prompt.indexOf('Visible copy and placements')), /"ريادة حضرية سعودية"|NAMES BOX|1–3-word info labels/)
  assert.match(prompt, /INFO PHRASE .*"بحث في إعادة تأهيل الأحياء"/)
})

test('repeated information is removed from subtitle and icon copy', () => {
  const prompt = buildCompactImagePrompt({ analysis: {
    name: 'سارة عبدالله', achievement_sentence: 'تحصل على الدكتوراه بتقدير ممتاز مرتفع',
    subtitle: 'بتقدير ممتاز مرتفع',
    info_phrases: ['بتقدير ممتاز مرتفع', 'بحث في إعادة تأهيل الأحياء', 'بَحْث في إعادة تأهيل الأحياء', 'دراسة تطبيقية على ينبع البحر'],
  }, chosenConcept: '' })
  assert.doesNotMatch(prompt, /ARABIC SUBTITLE:/)
  assert.equal((prompt.match(/INFO PHRASE \(/g) ?? []).length, 2)
  assert.match(prompt, /GLOBAL FACT UNIQUENESS/)
  assert.match(prompt, /do not repeat facts even in different wording/)
})

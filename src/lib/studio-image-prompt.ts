import { STUDIO_BRAND_RULES, STUDIO_NEWS_LAYOUT_RULES, STUDIO_LOGO_RESERVATION } from './studio-design-guidelines'
import { buildGreetingPosterPrompt, greetingCopyFromNewsText, type StudioGreetingCopy } from './studio-print-copy'

export type VideoOrientation = 'landscape' | 'portrait'

export function videoLayoutFor(orientation: VideoOrientation = 'landscape'): string {
  if (orientation === 'portrait') {
    return '=== VIDEO LAYOUT OVERRIDE — PORTRAIT 9:16 (highest priority) ===\n' +
      'This post contains a vertical video. On the 1080×1350 portrait canvas, reserve one large empty 9:16 video window, approximately 56% of canvas width and 80% of its height, with its lower edge above the bottom 220-pixel digital-asset pocket, aligned to the right side. Keep this video window visibly dominant with a slim gold outline, subtle play icon on the outer border, and a continuous integrated background; it must be empty inside with no person, image, words, numbers, or icons. Arrange the Arabic headline, factual callouts, and any reference photo in a clear vertical information column on the left, without covering the video window. Do not convert the 9:16 window into a horizontal frame or place a video inside it.'
  }
  return '=== VIDEO LAYOUT OVERRIDE — LANDSCAPE 16:9 (highest priority) ===\n' +
    'This post contains a horizontal video. On the 1080×1350 portrait canvas, reserve one large empty 16:9 video window spanning almost the full width across the upper half. Keep it visibly dominant with a slim gold outline, subtle play icon on the outer border, and a continuous integrated background; it must be empty inside with no person, image, words, numbers, or icons. Place the Arabic headline, factual callouts, and any reference photo below or around the video window without covering it. Do not convert the 16:9 window into a vertical frame or place a video inside it.'
}


function textValue(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : ''
}

function textList(value: unknown, limit: number, maxLength: number): string[] {
  return Array.isArray(value)
    ? value.map(item => textValue(item, maxLength)).filter(Boolean).slice(0, limit)
    : []
}

/** Compare display copy without changing its original Arabic spelling. */
function copyKey(value: string): string {
  return value.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase()
}

/** Remove exact repeated copy and facts already stated verbatim in a larger block. */
function uniqueCopy(seen: string[], candidate: string): string {
  const key = copyKey(candidate)
  if (!key) return ''
  const contained = key.split(' ').length >= 2 && key.length >= 12
  if (seen.some(previous => previous === key || (contained && ` ${previous} `.includes(` ${key} `)))) return ''
  seen.push(key)
  return candidate
}

/** يستبعد لغة التحليل الداخلية كي لا تُطبع على التصميم كأنها جزء من الخبر. */
function finalPrintCopy(value: unknown, maxLength: number): string {
  const source = textValue(value, maxLength)
  if (!source) return ''
  if (/^(?:المناسبة|التهنئة\s*موجّهة\s*إلى|النص\s*الختامي|الشعار\s*الرسمي\s*المطلوب\s*إبرازه|التصميم\s*مخصّص|وصف\s*الصورة)\s*[:：]/i.test(source)) return ''
  if (/^(?:التصميم\s*مخصّص|الصورة\s*المرفقة|يظهر\s*التصميم|تظهر\s*الصورة)/i.test(source)) return ''
  return source
    .replace(/^(?:الخبر\s*(?:الحالي|المذكور)?\s*)?(?:يذكر|يتحدث\s*عن|يتناول|يركز\s*على|يستعرض|يشير\s*إلى|يوضح|يسلط\s*الضوء\s*على)\s*[:،-]?\s*/i, '')
    .replace(/^(?:هذا\s*(?:الخبر|المحتوى)|المحتوى)\s*(?:يتحدث\s*عن|يتناول|يستعرض|يركز\s*على)\s*[:،-]?\s*/i, '')
    .replace(/^(?:في\s*الخبر\s*(?:الحالي|المذكور))\s*[:،-]?\s*/i, '')
    .trim()
}

/**
 * موجّه صورة قصير يُنشأ لحظة التوليد؛ لا يعيد إدخال برومبتات تاريخية مطوّلة
 * قد تطلب تعديل وجه أو هوية الشخص فتتوقف عند فحص أمان الصور.
 */
export function buildCompactImagePrompt(args: {
  analysis: unknown
  chosenConcept: string
  sourceText?: string
  note?: string
  extra?: string
  hasVideo?: boolean
  videoOrientation?: VideoOrientation
  templateDirective?: string
}): string {
  const record = args.analysis && typeof args.analysis === 'object'
    ? args.analysis as Record<string, unknown>
    : {}
  const posterCopy = args.sourceText
    ? greetingCopyFromNewsText(args.sourceText) ?? undefined
    : record.poster_copy as StudioGreetingCopy | undefined
  if (posterCopy?.kind === 'greeting' && posterCopy.message) {
    return buildGreetingPosterPrompt(posterCopy, {
      direction: textValue(args.chosenConcept, 1100),
      note: textValue(args.note, 500),
      templateDirective: args.templateDirective,
      videoDirective: args.hasVideo ? videoLayoutFor(args.videoOrientation) : undefined,
    })
  }
  const name = finalPrintCopy(record.name, Number.MAX_SAFE_INTEGER)
  const achievement = finalPrintCopy(record.achievement_sentence, 360) || finalPrintCopy(record.achievement_core, 360) || finalPrintCopy(record.headline, 160)
  const seen = [name, achievement].filter(Boolean).map(copyKey)
  const subtitle = uniqueCopy(seen, finalPrintCopy(record.subtitle, 220))
  const subtitleEn = textValue(record.subtitle_en, 180)
  const label = uniqueCopy(seen, finalPrintCopy(record.header_label, 120) || finalPrintCopy(record.context_label, 120))
  const phrases = textList(record.info_phrases, 4, 220)
  const legacyFacts = [...textList(record.key_facts, 4, 220), ...textList(record.awards, 1, 220)]
  const facts = (phrases.length ? phrases : legacyFacts.length ? legacyFacts : textList(record.info_labels, 4, 220))
    .map(fact => uniqueCopy(seen, finalPrintCopy(fact, 220)))
    .filter(Boolean)
  const direction = textValue(args.chosenConcept, 1100)
  const note = textValue(args.note, 500)
  const extra = textValue(args.extra, 500)
  const displayContent = [
    name ? `PRIMARY NAME (largest text, full name exactly once, first in reading order): "${name}"` : '',
    achievement ? `CONNECTED ACHIEVEMENT (immediately below the name; adapt legacy copy into a factual grammatical continuation without repeating the name): "${achievement}"` : '',
    label ? `STORY-SPECIFIC HEADER (secondary context only, never larger than or before the primary name): "${label}"` : '',
    subtitle ? `ARABIC SUBTITLE: "${subtitle}"` : '',
    subtitleEn ? `SINGLE SMALL ENGLISH SUBTITLE: "${subtitleEn}"` : '',
    ...facts.slice(0, 4).map(fact => `INFO PHRASE (under its topic icon; a meaningful achievement detail, not a bare word; expand legacy labels only from verified context): "${fact}"`),
  ].filter(Boolean).join('\n')

  return [
    'Create a premium 1080×1350 portrait 4:5 Arabic achievement poster for First1Saudi.',
    STUDIO_BRAND_RULES,
    STUDIO_NEWS_LAYOUT_RULES,
    STUDIO_LOGO_RESERVATION,
    `News category: ${textValue(record.news_type, 80) || 'Classify from the verified achievement below; do not assume a competition.'}`,
    'Use each supplied reference image as an intact documentary photograph. Do not redraw, replace, alter, or synthesize people, clothing, faces, or poses. Build the composition around the real photographs.',
    `Creative direction: ${direction || 'Classic Celebration with the established achievement hierarchy.'}`,
    'Choose a story-specific top label only from the approved copy below. If none is supplied, omit the label instead of printing the same generic إنجاز سعودي on every design.',
    `Visible copy and placements (name first, then its connected achievement sentence; turn legacy fact labels into meaningful phrases without inventing relationships, never shorten full names):\n${displayContent || 'Create a concise Arabic headline from the verified source.'}`,
    'Set the quoted Arabic as finished news copy: direct, human, clear, and declarative. Never print field labels, analysis summaries, source-image descriptions, or explanatory metadata.',
    'Use strict RTL hierarchy: the full name is the dominant headline, its factual achievement sentence follows immediately, then up to four meaningful fact phrases under their icons. Prefer concise 3–7-word phrases over isolated keywords. Each fact must add new information not stated in the achievement sentence, context, tag or another icon; do not repeat facts even in different wording. Omit redundant blocks instead of filling space. Do not invent missing facts or relationships.',
    args.templateDirective ?? '',
    args.hasVideo ? videoLayoutFor(args.videoOrientation) : '',
    note ? `Apply this additional visual direction: ${note}` : '',
    extra ? `Additional verified context: ${extra}` : '',
    'Avoid flags, politics, weapons, military content, danger symbols, and violence.',
    'FINAL PRIORITY: absolute unchanged photographic fidelity overrides every instruction; never add medals, trophies or objects to people. Preserve full verified names; apply the shared name-first reading order and emerald/gold hierarchy and digital-logo exclusions and mandatory generated social footer even if an old concept or optional template asks otherwise.',
  ].filter(Boolean).join('\n\n')
}

import { STUDIO_BRAND_RULES, STUDIO_NEWS_LAYOUT_RULES, STUDIO_LOGO_RESERVATION, STUDIO_FACT_RULES, FACE_LOCK, PRINT_BOUNDARY, STUDIO_NO_SOURCE_IMAGE_RULES } from './studio-design-guidelines'
import { buildGreetingPosterPrompt, greetingCopyFromNewsText, type StudioGreetingCopy } from './studio-print-copy'

export type VideoOrientation = 'landscape' | 'portrait'

export function videoLayoutFor(orientation: VideoOrientation = 'landscape'): string {
  if (orientation === 'portrait') {
    return 'VIDEO LAYOUT — PORTRAIT 9:16: Keep the full name and complete news together at the top. Reserve one empty 405×720 vertical video window at x=619..1024, y=420..1140 on the 1080×1350 canvas, ending above the digital footer y=1205. Its interior has no person, photo, text, numbers or icons. Use a thin forest/citron outline and optional play mark on the outer border only. Integrate any actual reference photo and supporting icon facts in the left column without covering the window or changing the person. Never draw the video or convert it to 16:9.'
  }
  return 'VIDEO LAYOUT — LANDSCAPE 16:9: Keep the full name then the complete news together above the video. Reserve one empty 960×540 horizontal 16:9 video window at x=60..1020, y=430..970. Its interior has no person, photo, text, numbers or icons. A thin forest/citron outline and optional play mark belong on the outer border only. Supporting icon facts follow below the window and end before the digital footer y=1205. Do not cover the window or convert it to 9:16.'
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
  sourceImageCount?: number
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
    const prompt = buildGreetingPosterPrompt(posterCopy, {
      direction: textValue(args.chosenConcept, 1100),
      note: textValue(args.note, 500),
      templateDirective: args.templateDirective,
      videoDirective: args.hasVideo ? videoLayoutFor(args.videoOrientation) : undefined,
    })
    return `${prompt}\n\n${sourcePhotoRequirement(args.sourceImageCount)}`.trim()
  }
  const name = finalPrintCopy(record.name, Number.MAX_SAFE_INTEGER)
  const honorific = finalPrintCopy(record.honorific, 200)
  const displayName = name && honorific && !name.startsWith(honorific) ? `${honorific} ${name}` : name
  const achievement = finalPrintCopy(record.poster_headline, Number.MAX_SAFE_INTEGER) || finalPrintCopy(record.achievement_core, Number.MAX_SAFE_INTEGER) || finalPrintCopy(record.headline, Number.MAX_SAFE_INTEGER)
  const label = finalPrintCopy(record.context_label, 120)
  const metricCandidates = 'standout_metric' in record
    ? [record.standout_metric]
    : [...textList(record.info_labels, 4, 220), ...textList(record.key_facts, 4, 220)]
  const metric = metricCandidates.map(value => finalPrintCopy(value, 220))
    .find(value => /[\p{N}]/u.test(value) && value !== name && !achievement.includes(value)) || ''
  const direction = textValue(args.chosenConcept, 1100)
  const note = textValue(args.note, 500)
  const extra = textValue(args.extra, 500)
  const displayContent = [
    displayName ? `TOP FULL NAME (first, exactly once): "${displayName}"` : '',
    achievement ? `COHERENT NEWS (second, action + achievement): "${achievement}"` : '',
    metric ? `ONE PROMINENT VERIFIED METRIC (third, with unit/context): "${metric}"` : '',
  ].filter(Boolean).join('\n')

  return [
    'Create ONE complete 1080×1350 portrait 4:5 Arabic editorial poster for the selected direction. Integrate the actual attached source photo, typography and minimal approved copy together in this image-generation step. No background-only or pasted-person workflow, no triptych.',
    STUDIO_FACT_RULES,
    STUDIO_BRAND_RULES,
    STUDIO_NEWS_LAYOUT_RULES,
    STUDIO_LOGO_RESERVATION,
    `News category: ${textValue(record.news_type, 80) || 'Classify from the verified achievement below; do not assume a competition.'}`,
    FACE_LOCK,
    'If no actual source photo is attached, use an honest typographic or abstract non-human treatment, NEVER a fake human face. Do not infer a photograph from analysis metadata alone.',
    `Creative direction, arrangement only: ${direction || 'Choose a content-appropriate integrated editorial composition from this story and its real photos.'}`,
    label ? `Internal visual context only: ${label}` : '',
    `VISIBLE_COPY — complete allowlist, in reading order:\n${displayContent || 'No approved visible copy is available; leave text areas empty. Do not invent copy.'}`,
    'Set the quoted Arabic as finished news copy: direct, human, clear, and declarative. Never print field labels, analysis summaries, source-image descriptions, or explanatory metadata.',
    'Read naturally from top to bottom: full name → one concise complete achievement line → at most one useful verified metric → original digital footer. Do not shorten, rewrite or paraphrase the approved copy in the image stage. Show only available facts; never fill gaps by inventing facts. No mandatory plaque, names box or four-icon row.',
    args.templateDirective ?? '',
    args.hasVideo ? videoLayoutFor(args.videoOrientation) : '',
    note ? `Apply this additional visual direction: ${note}` : '',
    extra ? `Internal additional context, not automatically verified or printable: ${extra}` : '',
    'FINAL PRIORITY: source facts, approved copy, original person and v3 identity/footer override an old saved concept or optional template. The model integrates the photo and renders the text now; only original logo/social branding is composited afterward.',
    sourcePhotoRequirement(args.sourceImageCount),
    PRINT_BOUNDARY,
  ].filter(Boolean).join('\n\n')
}

function sourcePhotoRequirement(count?: number): string {
  if (count === undefined) return ''
  if (count === 0) return `ACTUAL SOURCE PHOTO COUNT: 0. ${STUDIO_NO_SOURCE_IMAGE_RULES}`
  return `ACTUAL SOURCE PHOTO COUNT: ${count}. PHOTO INCLUSION IS MANDATORY: display the supplied real photograph(s) prominently in the finished poster, not just use them for analysis, inspiration or colors. Place them below or beside the name/achievement pair and above the footer. Preserve their subjects faithfully; if a cutout cannot be preserved, include the intact photograph instead of omitting it. Reduce decorative effects or icon rows to make room. The no-source-photo rule does not apply because real photos are attached. Never replace them with a badge, illustration or a text-only layout.`
}

import { STUDIO_BRAND_RULES, STUDIO_LOGO_RESERVATION } from './studio-design-guidelines'

/** Text approved for display on a congratulatory poster, separate from analysis metadata. */
export interface StudioGreetingCopy {
  kind: 'greeting'
  message: string
  closing?: string
  slogan?: string
}

function cleanParagraph(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * The studio's extraInfo describes how to design the poster. Only the actual
 * content field may become visible copy. Keep the user's spelling unchanged.
 */
export function greetingCopyFromNewsText(newsText: string): StudioGreetingCopy | null {
  const content = newsText.match(/(?:^|\n)المحتوى:\s*([\s\S]*?)(?=\n\n(?:معلومات إضافية من الأدمن|اسم صاحب الإنجاز|سياق الحملة)|$)/)?.[1]?.trim() ?? ''
  if (!/(?:أسمى|أطيب|أصدق|خالص)\s+(?:التهاني|التهنئة|التبريكات)|نهنئ|نبارك|تهانينا/.test(content)) return null
  if (!/(?:بمناسبة|عيد|اليوم الوطني|تهنئة)/.test(content)) return null

  const paragraphs = content.split(/\n\s*\n/).map(cleanParagraph).filter(Boolean)
  if (!paragraphs.length) return null
  const message = paragraphs[0]
  const closing = paragraphs.slice(1).join(' ')
  const extraInfo = newsText.split(/\n\nمعلومات إضافية من الأدمن[^\n]*:\n/)[1] ?? ''
  const slogan = /عزّ?نا\s+بطبعنا/.test(`${content}\n${extraInfo}`) ? 'عزّنا بطبعنا' : undefined
  return { kind: 'greeting', message, ...(closing ? { closing } : {}), ...(slogan ? { slogan } : {}) }
}

export function buildGreetingPosterPrompt(copy: StudioGreetingCopy, options: {
  direction?: string
  note?: string
  templateDirective?: string
  videoDirective?: string
}): string {
  return [
    'Create a premium 4:5 Arabic congratulatory poster for First1Saudi using the supplied reference image as the visual source.',
    'Greeting layout exception: do not add an achievement plaque, news headline, names box or fact row; use only the approved greeting copy below.',
    'Preserve all pictured people, faces, clothing and their order. Keep the Arabic greeting large and readable in clear space away from faces.',
    options.direction ? `Use this direction for visual arrangement only; its words must not appear on the artwork: ${options.direction}` : '',
    'The following quoted Arabic is the complete visible greeting copy; the mandatory social footer and exact "@First1Saudi" are additional required elements. Render it verbatim as finished celebratory text, without headings, field names, explanations, callouts, icons describing the occasion, or facts extracted from the analysis:',
    `"${copy.message}"`,
    copy.closing ? `"${copy.closing}"` : '',
    copy.slogan ? `Render the approved national-day slogan as text only, never generate its official logo: "${copy.slogan}" prominently; do not render it as a hashtag or a descriptive label.` : '',
    STUDIO_BRAND_RULES,
    STUDIO_LOGO_RESERVATION,
    options.templateDirective ?? '',
    options.videoDirective ?? '',
    options.note ? `Apply this visual editing note without printing its words: ${options.note}` : '',
    'Do not print analysis keys, source descriptions, design instructions, or any additional Arabic copy. Always generate the mandatory curved social footer with the five social icons and exact "@First1Saudi".',
  ].filter(Boolean).join('\n\n')
}

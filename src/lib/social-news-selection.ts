const SAUDI_CONTEXT = /(?:السعود(?:ي|ية|يون|يات)|المملكة العربية السعودية|المملكة)/
const OUTCOME_SIGNAL = /(?:أول|الأولى|أوائل|إنجاز|حقق|حققت|رقم قياسي|فاز|فازت|يفوز|حصد|حصدت|جائزة|جوائز|ميدالية|ميداليات|براءة|اختراع|تتويج|كرم|تكريم|اعتماد دولي|تصنيف عالمي)/
const SPECIALIST_DOMAIN = /(?:بحث|بحثي|علم|علمي|تقنية|تقني|ابتكار|مبتكر|مخترع|براءة|ذكاء اصطناعي|هندسة|طبي|صحي|فضاء|روبوت|رقمي|طاقة|استدامة|مياه|صناعة|ريادة|شركة ناشئة|أولمبياد)/
const GLOBAL_OR_FIRST = /(?:أول|الأولى|رقم قياسي|عالمي|دولي|دولية|عالمية|معرض جنيف|أولمبياد|براءة)/
const HUMAN_OR_TEAM = /(?:طالب|طالبة|طلاب|باحث|باحثة|باحثين|مبتكر|مبتكرة|مخترع|مخترعة|رائد|رائدة|فريق|منتخب|شركة ناشئة)/
const ANNOUNCEMENT_ONLY = /(?:إطلاق|يطلق|تطلق|فتح باب|استقبال الطلبات|توقيع اتفاق|مذكرة تفاهم|تدشين|يعلن عن بدء|تعلن عن بدء)/

export type SocialNewsDecision = {
  eligible: boolean
  reason: 'eligible' | 'not_saudi' | 'announcement' | 'no_outcome' | 'not_specialized' | 'not_distinctive'
}

/** Keeps the daily plan aligned with the First1Saudi editorial focus. */
export function assessSocialNews(text: string): SocialNewsDecision {
  const value = text.replace(/\s+/g, ' ').trim()
  if (!SAUDI_CONTEXT.test(value)) return { eligible: false, reason: 'not_saudi' }
  if (ANNOUNCEMENT_ONLY.test(value)) return { eligible: false, reason: 'announcement' }
  if (!OUTCOME_SIGNAL.test(value)) return { eligible: false, reason: 'no_outcome' }
  if (!SPECIALIST_DOMAIN.test(value)) return { eligible: false, reason: 'not_specialized' }
  if (!GLOBAL_OR_FIRST.test(value) && !HUMAN_OR_TEAM.test(value)) {
    return { eligible: false, reason: 'not_distinctive' }
  }
  return { eligible: true, reason: 'eligible' }
}

export function isSocialNewsEligible(title: string, content = ''): boolean {
  return assessSocialNews(`${title} ${content}`).eligible
}

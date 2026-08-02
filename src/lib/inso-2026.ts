export const INSO_CAMPAIGN_KEY = 'inso-2026'

export type InsoPhase = 'before' | 'during' | 'after'

export interface InsoCoverageSeed {
  coverage_date: string
  phase: InsoPhase
  slot: string
  title: string
  brief: string
}

export interface InsoCoverageItem extends InsoCoverageSeed {
  id: string
  post_text: string | null
  design_url: string | null
  design_brief: string | null
  design_options: Array<{ id: string; title: string; imageUrl: string; direction: string; hasVideo: boolean; createdAt: string; selected?: boolean }>
  publication_status: 'draft' | 'ready' | 'scheduled' | 'published'
  scheduled_for: string | null
  published_at: string | null
  created_at: string
}

export const INSO_MANDATORY_FOOTER = '#INSO2026 #موهبة @mawhiba @moe_gov_sa'

export const INSO_CORE_CONTEXT = `
فعالية أولمبياد العلوم النووية الدولي 2026 في جدة، من 2 إلى 9 أغسطس 2026.
المملكة تستضيف النسخة الثالثة بمشاركة 120 طالباً ومختصاً علمياً من 19 دولة.
الشراكة الوطنية بين موهبة ووزارة التعليم عنصر ثابت في كل منشور.
يجب إبراز دور موهبة في استضافة الأولمبياد واكتشاف وتأهيل الطلبة للمنافسات الدولية.
زاوية الحدث: الاستخدامات السلمية للعلوم النووية، العلم، التبادل الدولي، والموهبة الوطنية.
لا تنسب أرقام أو أسماء أو نتائج غير موجودة في معطيات الفعالية.
`

export const INSO_COVERAGE_SEEDS: InsoCoverageSeed[] = [
  { coverage_date: '2026-07-29', phase: 'before', slot: 'launch', title: 'إعلان الاستضافة', brief: 'إطلاق الحملة والتعريف باستضافة المملكة للأولمبياد الدولي للعلوم النووية.' },
  { coverage_date: '2026-07-30', phase: 'before', slot: 'countries', title: 'العقول القادمة إلى جدة', brief: 'التعريف بالدول المشاركة وبالاستعدادات النهائية لاستقبال الوفود.' },
  { coverage_date: '2026-08-01', phase: 'before', slot: 'welcome', title: 'الاستعداد للترحيب', brief: 'رسالة ترحيبية عن الاستعدادات ووصول المشاركين إلى مدينة جدة.' },
  { coverage_date: '2026-08-02', phase: 'during', slot: 'arrival', title: 'الوصول والتسجيل', brief: 'تغطية وصول الوفود، بداية رحلة المشاركين، ورسالة ترحيب متعددة اللغات.' },
  { coverage_date: '2026-08-03', phase: 'during', slot: 'opening', title: 'حفل الافتتاح', brief: 'تغطية الافتتاح: كلمة الدولة المستضيفة، تدشين الأولمبياد، الأوبريت، واستعراض الدول المشاركة.' },
  { coverage_date: '2026-08-04', phase: 'during', slot: 'practical', title: 'الاختبار العملي', brief: 'إبراز الجدية العلمية وروح المنافسة في الاختبار العملي.' },
  { coverage_date: '2026-08-05', phase: 'during', slot: 'theory', title: 'الاختبار النظري ولم الشمل', brief: 'تغطية الاختبار النظري ثم حفل لم الشمل والتبادل الثقافي بين الوفود.' },
  { coverage_date: '2026-08-06', phase: 'during', slot: 'activities', title: 'فعاليات مصاحبة', brief: 'قصص المشاركين والأنشطة العلمية والثقافية المصاحبة.' },
  { coverage_date: '2026-08-07', phase: 'during', slot: 'council', title: 'المجلس الدولي', brief: 'إبراز البعد الدولي للحدث واجتماع المجلس الدولي.' },
  { coverage_date: '2026-08-08', phase: 'during', slot: 'closing', title: 'حفل الختام والنتائج', brief: 'تغطية الختام، النتائج، تهنئة الطلبة، وشكر الجهات الشريكة.' },
  { coverage_date: '2026-08-09', phase: 'after', slot: 'departure', title: 'ختام الرحلة', brief: 'تلخيص أثر الاستضافة ورسالة وداع للوفود المغادرة.' },
  { coverage_date: '2026-08-22', phase: 'after', slot: 'report', title: 'التقرير الختامي', brief: 'توثيق الإنجاز والأثر الوطني والدولي للحملة.' },
]

export function enforceInsoFooter(text: string): string {
  const normalized = text.trim()
  const required = ['#INSO2026', '#موهبة', '@mawhiba', '@moe_gov_sa']
  const missing = required.filter(token => !normalized.includes(token))
  return missing.length ? `${normalized}\n\n${missing.join(' ')}` : normalized
}

export function formatInsoDate(date: string): string {
  return new Intl.DateTimeFormat('ar-SA', {
    timeZone: 'Asia/Riyadh', day: 'numeric', month: 'long', year: 'numeric', calendar: 'gregory',
  }).format(new Date(`${date}T12:00:00+03:00`))
}

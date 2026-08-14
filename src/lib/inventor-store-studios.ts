import type { InventorStoreProduct } from '@/lib/inventor-store'

export type StudioDeliverableKind =
  | 'report'
  | 'matrix'
  | 'research'
  | 'plan'
  | 'document'
  | 'infographic'
  | 'presentation'
  | 'script'
  | 'video'
  | 'webpage'
  | 'media_kit'
  | 'partner_map'
  | 'content_pack'

export type StudioField = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'list' | 'url'
  help?: string
  placeholder?: string
  required?: boolean
}

export type StudioDeliverableDefinition = {
  key: string
  title: string
  kind: StudioDeliverableKind
  description: string
  fields: StudioField[]
  checklist: string[]
}

export type InventorStoreStudioDefinition = {
  title: string
  description: string
  workflowLabel: string
  deliverables: StudioDeliverableDefinition[]
}

const commonChecklist = [
  'المعلومات المستخدمة موجودة في الطلب أو الوثائق الداعمة',
  'لا توجد وعود أو ادعاءات غير موثقة',
  'المصطلحات والأرقام والأسماء تمت مراجعتها',
  'المخرج يطابق نطاق الخدمة المعلن',
]

const fields = {
  executive: { key: 'executive_summary', label: 'الملخص التنفيذي', type: 'textarea' as const, required: true, placeholder: 'خلاصة نهائية واضحة ومباشرة...' },
  findings: { key: 'findings', label: 'النتائج الرئيسية', type: 'list' as const, required: true, help: 'ضع كل نتيجة في سطر مستقل.' },
  recommendations: { key: 'recommendations', label: 'التوصيات العملية', type: 'list' as const, required: true, help: 'رتبها حسب الأولوية.' },
  evidence: { key: 'evidence', label: 'الأدلة والمراجع المستخدمة', type: 'list' as const, help: 'روابط أو أسماء وثائق أو ملاحظات تحقق، كل مرجع في سطر.' },
  audience: { key: 'audience', label: 'الجمهور المستهدف', type: 'text' as const, required: true },
  keyMessage: { key: 'key_message', label: 'الرسالة المركزية', type: 'textarea' as const, required: true },
  visualDirection: { key: 'visual_direction', label: 'التوجيه البصري', type: 'textarea' as const, help: 'الأسلوب والألوان وترتيب العناصر والصور المختارة.' },
  fileUrl: { key: 'working_file_url', label: 'رابط ملف العمل', type: 'url' as const, help: 'رابط Canva أو Google Drive أو مساحة العمل.' },
}

const deliverable = (
  key: string,
  title: string,
  kind: StudioDeliverableKind,
  description: string,
  itemFields: StudioField[],
  checklist: string[] = [],
): StudioDeliverableDefinition => ({
  key,
  title,
  kind,
  description,
  fields: itemFields,
  checklist: [...commonChecklist, ...checklist],
})

const diagnosis = (title = 'تقرير التشخيص والقرار التالي') => deliverable(
  'diagnosis-report', title, 'report',
  'تقييم منظم للمرحلة الحالية والفجوات والأولوية التالية، وليس نصاً تسويقياً.',
  [
    fields.executive,
    { key: 'readiness_scores', label: 'محاور الجاهزية ودرجاتها', type: 'list', required: true, help: 'مثال: النموذج الأولي | 3 من 5 | سبب الدرجة.' },
    { key: 'gaps_risks', label: 'الفجوات والمخاطر', type: 'list', required: true },
    fields.recommendations,
    fields.evidence,
    fields.fileUrl,
  ],
  ['كل درجة مرتبطة بسبب واضح', 'الخطوات التالية قابلة للتنفيذ والقياس'],
)

const disclosure = () => deliverable(
  'safe-disclosure-map', 'مصفوفة الإفصاح الآمن', 'matrix',
  'تقسيم المعلومات إلى ما يعرض، وما يعرض بحذر، وما يحجب، مع تعليمات قبل الاجتماع.',
  [
    { key: 'share', label: 'يمكن عرضه', type: 'list', required: true },
    { key: 'share_with_caution', label: 'يعرض بحذر', type: 'list', required: true },
    { key: 'withhold', label: 'يجب حجبه', type: 'list', required: true },
    { key: 'meeting_checklist', label: 'قائمة الاستعداد قبل الاجتماع', type: 'list', required: true },
    { key: 'warning_questions', label: 'أسئلة تنبيه للمخترع', type: 'list' },
    fields.fileUrl,
  ],
  ['لا تتضمن صياغة توحي بأنها استشارة قانونية', 'كل معلومة حساسة مصنفة بوضوح'],
)

const priorArt = () => deliverable(
  'prior-art-research', 'سجل البحث والمقارنة الأولية', 'research',
  'مساحة بحث موثقة للكلمات والتصنيفات والنتائج القريبة والفروقات، مع روابط المصادر.',
  [
    { key: 'search_terms_ar', label: 'كلمات البحث العربية', type: 'list', required: true },
    { key: 'search_terms_en', label: 'كلمات البحث الإنجليزية', type: 'list', required: true },
    { key: 'classifications', label: 'التصنيفات ومجالات البحث', type: 'list' },
    { key: 'similar_results', label: 'النتائج القريبة وروابطها', type: 'list', required: true, help: 'كل سطر: الاسم | الرابط | سبب الصلة.' },
    { key: 'differences', label: 'جدول الفروقات الأولي', type: 'list', required: true },
    { key: 'research_limits', label: 'حدود البحث وملاحظاته', type: 'textarea', required: true },
    fields.fileUrl,
  ],
  ['كل نتيجة قريبة لها رابط قابل للفتح', 'يوجد تنبيه واضح أن البحث استكشافي وغير قانوني'],
)

const proofPlan = () => deliverable(
  'proof-plan', 'خطة إثبات الفكرة', 'plan',
  'تحويل الادعاءات إلى فرضيات واختبارات ومؤشرات نجاح وقرارات تالية.',
  [
    { key: 'hypotheses', label: 'الفرضيات المراد إثباتها', type: 'list', required: true },
    { key: 'tests', label: 'الاختبارات مرتبة بالأولوية', type: 'list', required: true },
    { key: 'success_metrics', label: 'معايير النجاح والفشل', type: 'list', required: true },
    { key: 'documentation_template', label: 'نموذج توثيق النتائج', type: 'textarea', required: true },
    { key: 'next_decisions', label: 'القرار المقترح بعد كل اختبار', type: 'list', required: true },
    fields.fileUrl,
  ],
  ['الاختبارات ضمن القيود المذكورة في الطلب', 'لا تتضمن اعتماد سلامة أو مطابقة فنية'],
)

const marketStudy = () => deliverable(
  'market-validation', 'دراسة قابلية السوق المصغرة', 'research',
  'تحليل أولي للمستخدم والمشكلة والبدائل والفرصة وأسئلة التحقق الميداني.',
  [fields.executive, { key: 'segments', label: 'شرائح المستخدمين ذات الأولوية', type: 'list', required: true }, { key: 'problem_context', label: 'المشكلة وسياق الاستخدام', type: 'textarea', required: true }, { key: 'alternatives', label: 'البدائل والمنافسون الأوليون', type: 'list', required: true }, { key: 'value_hypotheses', label: 'فرضيات القيمة والشراء', type: 'list', required: true }, { key: 'interview_guide', label: 'دليل المقابلات واختبارات السوق', type: 'list', required: true }, fields.evidence, fields.fileUrl],
  ['الاستنتاجات مفصولة عن الافتراضات', 'لا توصف كدراسة جدوى مالية'],
)

const onePage = () => deliverable(
  'invention-one-page', 'بطاقة الاختراع التعريفية', 'document',
  'صفحة واحدة قابلة للمشاركة تشرح المشكلة والحل والقيمة بوضوح.',
  [{ key: 'headline', label: 'العنوان الرئيسي', type: 'text', required: true }, fields.keyMessage, { key: 'problem', label: 'المشكلة', type: 'textarea', required: true }, { key: 'solution', label: 'الحل وآلية العمل', type: 'textarea', required: true }, { key: 'benefits', label: 'أبرز الفوائد', type: 'list', required: true }, { key: 'applications', label: 'الاستخدامات', type: 'list' }, fields.visualDirection, fields.fileUrl],
  ['يمكن فهم الاختراع خلال أقل من دقيقة', 'النسخة مناسبة للجوال والطباعة'],
)

const profile = () => deliverable(
  'invention-profile', 'الملف التعريفي للاختراع', 'document',
  'هيكل ملف متكامل من المشكلة إلى التطبيقات والإنجازات والمرحلة الحالية.',
  [{ key: 'outline', label: 'هيكل الصفحات', type: 'list', required: true }, fields.executive, { key: 'invention_story', label: 'قصة الاختراع', type: 'textarea', required: true }, { key: 'technical_overview', label: 'الشرح التقني المبسط', type: 'textarea', required: true }, { key: 'applications', label: 'التطبيقات والقيمة', type: 'list', required: true }, { key: 'inventor_achievements', label: 'المخترع والإنجازات', type: 'textarea' }, fields.visualDirection, fields.fileUrl],
  ['عدد الصفحات يطابق نطاق المنتج', 'التسلسل صالح للعرض أمام الجهات'],
)

const infographic = () => deliverable(
  'invention-infographic', 'إنفوجرافيك شرح الاختراع', 'infographic',
  'محتوى بصري من اليمين إلى اليسار يشرح الآلية والفوائد دون ازدحام.',
  [{ key: 'headline', label: 'العنوان', type: 'text', required: true }, { key: 'visual_sequence', label: 'التسلسل البصري من اليمين إلى اليسار', type: 'list', required: true }, { key: 'facts', label: 'الحقائق والأرقام المعتمدة', type: 'list' }, { key: 'captions', label: 'النصوص القصيرة داخل التصميم', type: 'list', required: true }, fields.visualDirection, fields.fileUrl],
  ['الاتجاه RTL واضح', 'لا يوجد نسخ مطول من وصف العميل', 'الصور المختارة من مرفقات الصور وليست الوثائق'],
)

const pitchDeck = () => deliverable(
  'investor-pitch-deck', 'عرض الاختراع للمستثمرين', 'presentation',
  'بناء قصة استثمارية مترابطة، شريحة لكل فكرة، مع أرقام موثقة وطلب واضح.',
  [{ key: 'deck_goal', label: 'هدف العرض والطلب الاستثماري', type: 'textarea', required: true }, fields.audience, { key: 'slide_outline', label: 'هيكل الشرائح', type: 'list', required: true, help: 'كل سطر: رقم الشريحة | العنوان | الرسالة | الدليل.' }, { key: 'market_evidence', label: 'أرقام السوق ومصادرها', type: 'list' }, { key: 'ask', label: 'الطلب واستخدام التمويل', type: 'textarea', required: true }, fields.visualDirection, fields.fileUrl],
  ['بين 10 و15 شريحة', 'كل رقم له مصدر أو وسم بأنه تقدير', 'الطلب النهائي محدد'],
)

const presentationScript = () => deliverable(
  'presentation-script', 'نص تقديم الاختراع', 'script',
  'نصان بصوت المخترع مع أسئلة وأجوبة، وليس وصفاً عاماً للاختراع.',
  [{ key: 'script_60', label: 'نص 60 ثانية', type: 'textarea', required: true }, { key: 'script_180', label: 'نص 3 دقائق', type: 'textarea', required: true }, { key: 'qa', label: 'الأسئلة والأجوبة المتوقعة', type: 'list', required: true }, { key: 'delivery_notes', label: 'ملاحظات الإلقاء', type: 'list' }, fields.fileUrl],
  ['النص قابل للنطق ضمن الزمن المحدد', 'اللغة طبيعية ومناسبة للجمهور'],
)

const video = () => deliverable(
  'explainer-video', 'فيديو شرح الاختراع', 'video',
  'سيناريو ولوحة مشاهد وتعليق صوتي ومتابعة ملف الإنتاج النهائي.',
  [{ key: 'concept', label: 'الفكرة الإخراجية', type: 'textarea', required: true }, { key: 'storyboard', label: 'لوحة المشاهد', type: 'list', required: true, help: 'كل سطر: الزمن | الصورة | الحركة | النص.' }, { key: 'voiceover', label: 'نص التعليق الصوتي', type: 'textarea', required: true }, { key: 'on_screen_text', label: 'النصوص على الشاشة', type: 'list' }, { key: 'production_notes', label: 'ملاحظات الإنتاج والموسيقى', type: 'textarea' }, fields.fileUrl],
  ['المدة لا تتجاوز 60 ثانية', 'الموسيقى مرخصة', 'لا يتم تحريف صور الاختراع أو المخترع'],
)

const webpage = () => deliverable(
  'digital-page', 'الصفحة الرقمية للاختراع', 'webpage',
  'هيكل ومحتوى صفحة متجاوبة مع روابط تواصل وQR ونسخة منشورة.',
  [{ key: 'page_structure', label: 'أقسام الصفحة وترتيبها', type: 'list', required: true }, { key: 'hero_copy', label: 'محتوى الواجهة الأولى', type: 'textarea', required: true }, { key: 'sections_copy', label: 'محتوى الأقسام', type: 'textarea', required: true }, { key: 'cta', label: 'الإجراء وروابط التواصل', type: 'list', required: true }, { key: 'seo', label: 'عنوان ووصف محركات البحث', type: 'textarea' }, { key: 'published_url', label: 'رابط المعاينة أو النشر', type: 'url' }, fields.fileUrl],
  ['تم اختبارها على الجوال والكمبيوتر', 'كل الروابط وQR تعمل'],
)

const mediaKit = () => deliverable(
  'inventor-media-kit', 'الملف الإعلامي للمخترع', 'media_kit',
  'سيرة ورسائل وإنجازات وصور واتصال إعلامي في مرجع واحد.',
  [{ key: 'short_bio', label: 'السيرة المختصرة', type: 'textarea', required: true }, { key: 'long_bio', label: 'السيرة الموسعة', type: 'textarea', required: true }, { key: 'key_messages', label: 'الرسائل الإعلامية', type: 'list', required: true }, { key: 'achievements', label: 'الإنجازات المرتبة', type: 'list', required: true }, { key: 'media_assets', label: 'الصور والروابط الإعلامية المختارة', type: 'list' }, { key: 'contact', label: 'بيانات التواصل الإعلامي', type: 'text', required: true }, fields.visualDirection, fields.fileUrl],
  ['الاسم والألقاب والإنجازات مطابقة للوثائق', 'الصور المخصصة للنشر واضحة وعالية الدقة'],
)

const partnerMap = () => deliverable(
  'partner-map', 'خريطة الشركاء والرسائل', 'partner_map',
  'قائمة جهات مستهدفة حسب الملاءمة مع رسائل تواصل أولية وخطوة متابعة.',
  [{ key: 'segments', label: 'قطاعات الشركاء المستهدفة', type: 'list', required: true }, { key: 'targets', label: 'الجهات وسبب الملاءمة', type: 'list', required: true }, { key: 'outreach_messages', label: 'رسائل التواصل المقترحة', type: 'textarea', required: true }, { key: 'follow_up', label: 'خطة المتابعة', type: 'list', required: true }, fields.evidence],
  ['بيانات الجهات حديثة وقابلة للتحقق', 'لا توجد وعود بالحصول على شراكة أو استثمار'],
)

const launchContent = () => deliverable(
  'launch-content', 'محتوى وخطة الإطلاق', 'content_pack',
  'رسائل الإطلاق، تسلسل النشر، النصوص والقنوات والدعوات للإجراء.',
  [fields.keyMessage, fields.audience, { key: 'content_sequence', label: 'تسلسل محتوى الإطلاق', type: 'list', required: true }, { key: 'copy', label: 'النصوص النهائية', type: 'textarea', required: true }, { key: 'channels', label: 'القنوات والتكييف لكل قناة', type: 'list', required: true }, { key: 'cta', label: 'الدعوات للإجراء', type: 'list', required: true }],
  ['كل نص نهائي وجاهز للاستخدام', 'الخطة تراعي موعد الإطلاق وقيود الإفصاح'],
)

const studio = (title: string, description: string, workflowLabel: string, deliverables: StudioDeliverableDefinition[]): InventorStoreStudioDefinition => ({ title, description, workflowLabel, deliverables })

export const INVENTOR_STORE_STUDIOS: Record<string, InventorStoreStudioDefinition> = {
  'invention-readiness-diagnosis': studio('استديو تشخيص الجاهزية', 'قيّم المحاور، سجل الفجوات، ثم حوّلها إلى قرار وخطوات تالية.', 'تحليل وتوصيات', [diagnosis()]),
  'safe-disclosure-map': studio('استديو الإفصاح الآمن', 'صنّف معلومات الاختراع حسب مستوى الإفصاح وجهّز المخترع للاجتماعات.', 'تصنيف وحوكمة معلومات', [disclosure()]),
  'prior-art-exploratory-search': studio('استديو البحث الاستكشافي', 'وثّق استراتيجية البحث والنتائج القريبة والفروقات مع مصادر قابلة للمراجعة.', 'بحث ومقارنة', [priorArt()]),
  'proof-of-concept-plan': studio('استديو إثبات الفكرة', 'حوّل الادعاءات إلى اختبارات ومعايير نجاح وقرارات تالية.', 'فرضيات واختبارات', [proofPlan()]),
  'mini-market-validation': studio('استديو قابلية السوق', 'افصل الحقائق عن الافتراضات وابنِ دليلاً لاختبار السوق.', 'بحث سوق مصغر', [marketStudy()]),
  'invention-one-page': studio('استديو بطاقة الاختراع', 'ابنِ صفحة تعريفية موجزة وقابلة للمشاركة.', 'كتابة وتصميم صفحة', [onePage()]),
  'invention-profile': studio('استديو ملف الاختراع', 'رتّب قصة الاختراع ومحتوى صفحاته وهويته البصرية.', 'تحرير ملف متكامل', [profile()]),
  'invention-infographic': studio('استديو إنفوجرافيك الاختراع', 'هيكل المعلومة بصرياً من اليمين إلى اليسار قبل تنفيذ التصميم.', 'تسلسل بصري', [infographic()]),
  'investor-pitch-deck': studio('استديو عرض المستثمرين', 'ابنِ قصة العرض والأرقام والطلب الاستثماري شريحة بشريحة.', 'عرض استثماري', [pitchDeck()]),
  'invention-presentation-script': studio('استديو نص التقديم', 'جهّز نصوص الإلقاء والأسئلة والأجوبة حسب الجمهور والزمن.', 'كتابة وإلقاء', [presentationScript()]),
  'invention-explainer-video': studio('استديو فيديو الاختراع', 'أدر السيناريو والمشاهد والتعليق الصوتي وملف الإنتاج.', 'إنتاج فيديو', [video()]),
  'invention-digital-page': studio('استديو الصفحة الرقمية', 'حرر أقسام الصفحة واختبر رابطها وتجربتها على الأجهزة.', 'محتوى وتجربة ويب', [webpage()]),
  'inventor-media-kit': studio('استديو الملف الإعلامي', 'وحّد السيرة والرسائل والإنجازات والصور وبيانات التواصل.', 'هوية إعلامية', [mediaKit()]),
  'starter-bundle': studio('استديو حزمة البداية', 'ثلاثة مخرجات مترابطة برسالة واحدة وإدارة مستقلة لكل مخرج.', 'حزمة متعددة المخرجات', [onePage(), infographic(), presentationScript()]),
  'presentation-ready-bundle': studio('استديو حزمة جاهز للعرض', 'ملف وعرض وإنفوجرافيك ونص تقديم، كل مخرج في مساره مع اتساق الرسالة.', 'حزمة عرض متكاملة', [profile(), pitchDeck(), infographic(), presentationScript()]),
  'investment-ready-bundle': studio('استديو الجاهزية للاستثمار', 'تقييم جاهزية وعرض وصفحة وشركاء ورسائل تواصل ضمن مسار واحد.', 'حزمة استثمار وشراكات', [diagnosis('تقرير الجاهزية التسويقية والاستثمارية'), pitchDeck(), webpage(), partnerMap()]),
  'launch-bundle': studio('استديو الإطلاق الشامل', 'أدر الملف الإعلامي والمحتوى والتصميم والفيديو والصفحة كحملة إطلاق مترابطة.', 'إطلاق متعدد القنوات', [mediaKit(), launchContent(), infographic(), video(), webpage()]),
}

export function getInventorStoreStudio(productSlug: string): InventorStoreStudioDefinition | null {
  return INVENTOR_STORE_STUDIOS[productSlug] ?? null
}

export function getStudioForProduct(product: InventorStoreProduct): InventorStoreStudioDefinition {
  return getInventorStoreStudio(product.slug) ?? studio(
    `استديو ${product.shortName}`,
    'مساحة عمل منظمة حسب المخرجات المعلنة للخدمة.',
    'تنفيذ ومراجعة',
    product.deliverables.map((title, index) => deliverable(`output-${index + 1}`, title, 'document', title, [fields.executive, fields.fileUrl])),
  )
}

export function createEmptyDeliverableContent(definition: StudioDeliverableDefinition): Record<string, string> {
  return Object.fromEntries(definition.fields.map(field => [field.key, '']))
}

export function parseStoreRequestMeta(value: unknown): { source: 'inventor_store'; product_slug: string; product_name?: string; listed_price?: number } | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (parsed.source !== 'inventor_store' || typeof parsed.product_slug !== 'string') return null
    return {
      source: 'inventor_store',
      product_slug: parsed.product_slug,
      product_name: typeof parsed.product_name === 'string' ? parsed.product_name : undefined,
      listed_price: Number.isFinite(Number(parsed.listed_price)) ? Number(parsed.listed_price) : undefined,
    }
  } catch {
    return null
  }
}

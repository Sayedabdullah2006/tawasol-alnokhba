export type InventorOrderField = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'date' | 'number' | 'url'
  placeholder?: string
  help?: string
  required?: boolean
  minLength?: number
  maxLength?: number
  options?: string[]
}

export type InventorOrderSection = {
  title: string
  description?: string
  fields: InventorOrderField[]
}

export type InventorOrderUpload = {
  label: string
  help: string
  maxFiles: number
  minFiles?: number
}

export type InventorOrderFormDefinition = {
  title: string
  intro: string
  titleField: string
  sections: InventorOrderSection[]
  images: InventorOrderUpload
  documents: InventorOrderUpload
}

const imageDefaults = {
  label: 'صور الاختراع أو النموذج',
  help: 'ارفع صوراً واضحة من زوايا مختلفة، من دون ضغط أو لقطات شاشة قدر الإمكان.',
  maxFiles: 8,
}

const documentDefaults = {
  label: 'الوثائق الداعمة',
  help: 'ملفات PDF أو Word أو صور إثبات تساعد الفريق على فهم المعلومات والتحقق منها، ولا تُستخدم بصرياً في التصميم.',
  maxFiles: 8,
}

export const INVENTOR_STORE_ORDER_FORMS: Record<string, InventorOrderFormDefinition> = {
  'invention-readiness-diagnosis': {
    title: 'تشخيص جاهزية الاختراع',
    intro: 'صف ما تم إنجازه بواقعية لنحدد المرحلة الحالية والنواقص وأقرب خطوة عملية.',
    titleField: 'inventionName',
    sections: [
      { title: 'الفكرة والمرحلة', fields: [
        { key: 'inventionName', label: 'اسم الاختراع أو الفكرة *', type: 'text', required: true, minLength: 3, maxLength: 140 },
        { key: 'problemSolution', label: 'المشكلة والحل باختصار *', type: 'textarea', required: true, minLength: 40, maxLength: 1600 },
        { key: 'developmentStage', label: 'المرحلة الحالية *', type: 'select', required: true, options: ['فكرة مكتوبة', 'تصور أو رسم مبدئي', 'نموذج أولي', 'تم إجراء اختبارات', 'منتج جاهز', 'بدأ الاستخدام أو البيع'] },
        { key: 'workCompleted', label: 'ما الذي أنجزته فعلياً حتى الآن؟ *', type: 'textarea', required: true, minLength: 30, maxLength: 1800 },
      ] },
      { title: 'الحماية والسوق والهدف', fields: [
        { key: 'ipStatus', label: 'حالة الملكية الفكرية *', type: 'select', required: true, options: ['لم أبدأ', 'أجريت بحثاً أولياً', 'أودعت طلب حماية', 'الطلب تحت الفحص', 'حصلت على حماية', 'غير متأكد'] },
        { key: 'marketWork', label: 'ما الذي فعلته للتحقق من حاجة السوق؟', type: 'textarea', maxLength: 1200 },
        { key: 'teamAndResources', label: 'الفريق والموارد المتاحة', type: 'textarea', maxLength: 1000 },
        { key: 'mainConcern', label: 'ما القرار أو العائق الذي تريد حسمه؟ *', type: 'textarea', required: true, minLength: 20, maxLength: 900 },
      ] },
    ],
    images: { ...imageDefaults, label: 'صور المرحلة الحالية', help: 'ارفع صور النموذج أو الرسومات إن وجدت؛ الصور اختيارية للتشخيص.', maxFiles: 6 },
    documents: { ...documentDefaults, label: 'ملفات سابقة تساعد على التشخيص' },
  },
  'safe-disclosure-map': {
    title: 'إعداد خريطة الإفصاح الآمن',
    intro: 'سنقسم معلومات الاختراع إلى ما يمكن عرضه وما يحتاج حذراً وما يفضّل حجبه في السياق المحدد.',
    titleField: 'inventionName',
    sections: [
      { title: 'الاختراع والمعلومات الحساسة', fields: [
        { key: 'inventionName', label: 'اسم الاختراع *', type: 'text', required: true, minLength: 3, maxLength: 140 },
        { key: 'publicSummary', label: 'الوصف الذي تستخدمه حالياً أمام الآخرين *', type: 'textarea', required: true, minLength: 30, maxLength: 1600 },
        { key: 'sensitiveDetails', label: 'التفاصيل التي تعتقد أنها حساسة أو سرية *', type: 'textarea', required: true, minLength: 20, maxLength: 1800, help: 'اذكر نوع التفاصيل دون رفع معلومات لا ترغب بمشاركتها إلكترونياً.' },
        { key: 'ipStatus', label: 'حالة الحماية أو الإيداع *', type: 'select', required: true, options: ['لم يتم الإيداع', 'تم الإيداع', 'تحت الفحص', 'حماية ممنوحة', 'غير متأكد'] },
      ] },
      { title: 'سياق الإفصاح', fields: [
        { key: 'meetingType', label: 'أين ستعرض الاختراع؟ *', type: 'select', required: true, options: ['اجتماع مستثمر', 'اجتماع مصنع أو شريك تقني', 'معرض أو مسابقة', 'نشر إعلامي أو اجتماعي', 'إرسال ملف لجهة', 'أكثر من سياق'] },
        { key: 'audience', label: 'من سيطّلع على المعلومات؟ *', type: 'text', required: true, minLength: 3, maxLength: 300 },
        { key: 'materials', label: 'المواد التي تنوي مشاركتها *', type: 'textarea', required: true, minLength: 15, maxLength: 1000 },
        { key: 'meetingDate', label: 'موعد الاجتماع أو العرض إن وجد', type: 'date' },
      ] },
    ],
    images: { ...imageDefaults, label: 'صور المواد المزمع عرضها', help: 'ارفع فقط النسخ التي تريد مراجعة مستوى الإفصاح فيها.', maxFiles: 6 },
    documents: { ...documentDefaults, label: 'العروض أو الملفات المزمع مشاركتها' },
  },
  'prior-art-exploratory-search': {
    title: 'موجز البحث الاستكشافي',
    intro: 'نحتاج وصفاً تقنياً دقيقاً لبناء كلمات وتصنيفات بحث والعثور على حلول منشورة قريبة.',
    titleField: 'inventionName',
    sections: [
      { title: 'الجوهر التقني', fields: [
        { key: 'inventionName', label: 'اسم الاختراع *', type: 'text', required: true, minLength: 3, maxLength: 140 },
        { key: 'technicalField', label: 'المجال التقني *', type: 'text', required: true, minLength: 3, maxLength: 250, placeholder: 'مثال: أجهزة طبية، معالجة مياه، ذكاء اصطناعي...' },
        { key: 'technicalProblem', label: 'المشكلة التقنية المحددة *', type: 'textarea', required: true, minLength: 40, maxLength: 1800 },
        { key: 'mechanism', label: 'المكونات وكيف تعمل معاً *', type: 'textarea', required: true, minLength: 80, maxLength: 3200 },
        { key: 'novelFeatures', label: 'السمات التي تعتقد أنها جديدة *', type: 'textarea', required: true, minLength: 30, maxLength: 1800 },
      ] },
      { title: 'نطاق البحث السابق', fields: [
        { key: 'knownAlternatives', label: 'حلول أو منتجات أو براءات تعرفها', type: 'textarea', maxLength: 1600 },
        { key: 'previousKeywords', label: 'كلمات بحث استخدمتها سابقاً', type: 'textarea', maxLength: 900 },
        { key: 'previousSearch', label: 'هل أجريت بحثاً سابقاً؟ *', type: 'select', required: true, options: ['لا', 'بحث عام في الإنترنت', 'بحث في قواعد البراءات', 'استعنت بمختص'] },
        { key: 'searchLanguages', label: 'لغة النتائج المطلوبة *', type: 'select', required: true, options: ['العربية والإنجليزية', 'الإنجليزية أساساً', 'العربية أساساً'] },
      ] },
    ],
    images: { ...imageDefaults, label: 'رسومات أو صور لفهم السمات التقنية', help: 'الصور اختيارية لكنها تساعد على تفسير المكونات والعلاقات بينها.', maxFiles: 8 },
    documents: { ...documentDefaults, label: 'الوصف التقني ونتائج البحث السابقة' },
  },
  'proof-of-concept-plan': {
    title: 'إعداد خطة إثبات الفكرة',
    intro: 'سنحوّل أهم ادعاءات الاختراع إلى فرضيات واختبارات ومعايير نجاح قابلة للتوثيق.',
    titleField: 'inventionName',
    sections: [
      { title: 'ما الذي يجب إثباته؟', fields: [
        { key: 'inventionName', label: 'اسم الاختراع *', type: 'text', required: true, minLength: 3, maxLength: 140 },
        { key: 'mechanism', label: 'اشرح آلية العمل المتوقعة *', type: 'textarea', required: true, minLength: 60, maxLength: 2600 },
        { key: 'coreClaims', label: 'ما أهم نتائج أو قدرات تريد إثباتها؟ *', type: 'textarea', required: true, minLength: 30, maxLength: 1600 },
        { key: 'currentEvidence', label: 'ما الأدلة أو الاختبارات المتوفرة حالياً؟', type: 'textarea', maxLength: 1400 },
        { key: 'knownRisks', label: 'المخاطر أو نقاط الشك المعروفة', type: 'textarea', maxLength: 1200 },
      ] },
      { title: 'إمكانات الاختبار', fields: [
        { key: 'availableResources', label: 'المواد والأدوات والمختبرات المتاحة *', type: 'textarea', required: true, minLength: 20, maxLength: 1400 },
        { key: 'constraints', label: 'قيود التكلفة أو الوقت أو السلامة *', type: 'textarea', required: true, minLength: 15, maxLength: 1000 },
        { key: 'successMeaning', label: 'ما النتيجة التي ستعتبرها نجاحاً؟ *', type: 'textarea', required: true, minLength: 20, maxLength: 1000 },
        { key: 'targetDate', label: 'موعد مستهدف لإكمال الإثبات', type: 'date' },
      ] },
    ],
    images: { ...imageDefaults, label: 'صور النموذج والتجارب الحالية', maxFiles: 8 },
    documents: { ...documentDefaults, label: 'القياسات والمواصفات ونتائج الاختبارات' },
  },
  'mini-market-validation': {
    title: 'موجز دراسة قابلية السوق',
    intro: 'ساعدنا على تحديد المستخدم الأول والمشكلة والبدائل والفرضيات التي تستحق اختباراً ميدانياً.',
    titleField: 'inventionName',
    sections: [
      { title: 'المستخدم والمشكلة', fields: [
        { key: 'inventionName', label: 'اسم الاختراع أو المنتج *', type: 'text', required: true, minLength: 3, maxLength: 140 },
        { key: 'targetUsers', label: 'من المستخدم أو المشتري المتوقع؟ *', type: 'textarea', required: true, minLength: 30, maxLength: 1600 },
        { key: 'userProblem', label: 'ما المشكلة التي يواجهها ومتى؟ *', type: 'textarea', required: true, minLength: 40, maxLength: 1800 },
        { key: 'solutionValue', label: 'كيف يحسن اختراعك الوضع الحالي؟ *', type: 'textarea', required: true, minLength: 40, maxLength: 1800 },
        { key: 'geography', label: 'النطاق الجغرافي الأول المستهدف *', type: 'text', required: true, minLength: 3, maxLength: 240 },
      ] },
      { title: 'البدائل وإشارات الطلب', fields: [
        { key: 'alternatives', label: 'كيف يحل المستخدم المشكلة حالياً؟ *', type: 'textarea', required: true, minLength: 30, maxLength: 1600 },
        { key: 'customerEvidence', label: 'هل تحدثت مع مستخدمين أو حصلت على اهتمام؟', type: 'textarea', maxLength: 1600 },
        { key: 'expectedPrice', label: 'السعر أو نموذج الدفع المتوقع إن وجد', type: 'text', maxLength: 300 },
        { key: 'marketQuestions', label: 'أهم أسئلة السوق التي تريد الإجابة عنها *', type: 'textarea', required: true, minLength: 20, maxLength: 1200 },
        { key: 'marketType', label: 'نوع السوق الأقرب *', type: 'select', required: true, options: ['أفراد B2C', 'شركات B2B', 'جهات حكومية B2G', 'أكثر من سوق', 'غير متأكد'] },
      ] },
    ],
    images: { ...imageDefaults, label: 'صور المنتج أو سياق الاستخدام', maxFiles: 6 },
    documents: { ...documentDefaults, label: 'مقابلات أو دراسات أو بيانات سوق سابقة' },
  },
  'invention-one-page': {
    title: 'بيانات بطاقة الاختراع',
    intro: 'أجب باختصار؛ الهدف بناء صفحة واحدة تشرح الفكرة خلال أقل من دقيقة.',
    titleField: 'inventionName',
    sections: [
      { title: 'جوهر الاختراع', fields: [
        { key: 'inventionName', label: 'اسم الاختراع *', type: 'text', required: true, minLength: 3, maxLength: 140 },
        { key: 'problem', label: 'ما المشكلة التي يعالجها؟ *', type: 'textarea', required: true, minLength: 20, maxLength: 900, placeholder: 'صف المشكلة بلغة يفهمها غير المتخصص' },
        { key: 'solution', label: 'كيف يحل الاختراع المشكلة؟ *', type: 'textarea', required: true, minLength: 30, maxLength: 1400 },
        { key: 'mainValue', label: 'ما أهم ميزة أو قيمة يقدمها؟ *', type: 'textarea', required: true, minLength: 15, maxLength: 600 },
      ] },
      { title: 'الاستخدام والجمهور', fields: [
        { key: 'useCases', label: 'أبرز الاستخدامات', type: 'textarea', maxLength: 700 },
        { key: 'audience', label: 'لمن ستُعرض البطاقة؟ *', type: 'text', required: true, minLength: 3, maxLength: 200, placeholder: 'جهة داعمة، لجنة تحكيم، مستثمرون...' },
        { key: 'developmentStage', label: 'مرحلة الاختراع', type: 'select', required: true, options: ['فكرة أولية', 'نموذج أولي', 'تم اختباره', 'منتج جاهز', 'في السوق'] },
      ] },
    ],
    images: imageDefaults,
    documents: documentDefaults,
  },
  'invention-profile': {
    title: 'محتوى الملف التعريفي',
    intro: 'نحتاج قصة متكاملة عن الاختراع والمخترع لبناء ملف منظم من 8 إلى 12 صفحة.',
    titleField: 'inventionName',
    sections: [
      { title: 'الاختراع', fields: [
        { key: 'inventionName', label: 'اسم الاختراع *', type: 'text', required: true, minLength: 3, maxLength: 140 },
        { key: 'background', label: 'خلفية الفكرة والمشكلة *', type: 'textarea', required: true, minLength: 40, maxLength: 1800 },
        { key: 'mechanism', label: 'كيف يعمل الاختراع؟ *', type: 'textarea', required: true, minLength: 50, maxLength: 2500 },
        { key: 'advantages', label: 'المزايا ونقاط الاختلاف *', type: 'textarea', required: true, minLength: 30, maxLength: 1400 },
        { key: 'applications', label: 'مجالات الاستخدام والتطبيقات', type: 'textarea', maxLength: 1200 },
        { key: 'developmentStage', label: 'مرحلة التطوير *', type: 'select', required: true, options: ['فكرة أولية', 'نموذج أولي', 'تم اختباره', 'منتج جاهز', 'في السوق'] },
      ] },
      { title: 'المخترع والإنجازات', fields: [
        { key: 'inventorBio', label: 'نبذة عن المخترع أو الفريق *', type: 'textarea', required: true, minLength: 30, maxLength: 1400 },
        { key: 'achievements', label: 'الجوائز والإنجازات والاعتمادات', type: 'textarea', maxLength: 1800 },
        { key: 'targetReader', label: 'الجهات التي سيُرسل إليها الملف *', type: 'text', required: true, minLength: 3, maxLength: 250 },
      ] },
    ],
    images: { ...imageDefaults, label: 'صور الاختراع والمخترع', help: 'ارفع صور النموذج وصوراً شخصية احترافية وصور الجوائز أو المشاركات المراد إظهارها.' },
    documents: { ...documentDefaults, label: 'ملفات الاختراع وإثباتات الإنجازات' },
  },
  'invention-infographic': {
    title: 'مخطط الإنفوجرافيك',
    intro: 'حدد المعلومة التي تريد أن يفهمها القارئ بصرياً، مع ترتيب الخطوات والأرقام الصحيحة.',
    titleField: 'infographicTitle',
    sections: [
      { title: 'المحتوى البصري', fields: [
        { key: 'infographicTitle', label: 'عنوان الإنفوجرافيك *', type: 'text', required: true, minLength: 3, maxLength: 120 },
        { key: 'coreMessage', label: 'الرسالة الرئيسية *', type: 'textarea', required: true, minLength: 25, maxLength: 900 },
        { key: 'flow', label: 'الخطوات أو التسلسل المطلوب شرحه *', type: 'textarea', required: true, minLength: 30, maxLength: 1800, placeholder: 'اكتبها مرتبة من الخطوة الأولى إلى الأخيرة' },
        { key: 'facts', label: 'الأرقام والحقائق التي يجب إبرازها', type: 'textarea', maxLength: 1200, help: 'اكتب فقط الأرقام التي تستطيع توثيقها.' },
      ] },
      { title: 'المقاس والأسلوب', fields: [
        { key: 'platform', label: 'الاستخدام الأساسي *', type: 'select', required: true, options: ['X', 'Instagram', 'LinkedIn', 'عرض تقديمي', 'طباعة', 'استخدام متعدد'] },
        { key: 'orientation', label: 'اتجاه التصميم *', type: 'select', required: true, options: ['طولي', 'مربع', 'عرضي'] },
        { key: 'visualPreference', label: 'تفضيلات بصرية أو ألوان', type: 'text', maxLength: 300 },
      ] },
    ],
    images: { ...imageDefaults, label: 'صور أو رسومات تدخل في الإنفوجرافيك' },
    documents: { ...documentDefaults, label: 'مصادر الأرقام والمعلومات' },
  },
  'investor-pitch-deck': {
    title: 'بيانات عرض المستثمرين',
    intro: 'هذه الأسئلة تبني منطق العرض الاستثماري من المشكلة إلى الفرصة والطلب الواضح.',
    titleField: 'inventionName',
    sections: [
      { title: 'المنتج والفرصة', fields: [
        { key: 'inventionName', label: 'اسم الاختراع أو المشروع *', type: 'text', required: true, minLength: 3, maxLength: 140 },
        { key: 'problemSolution', label: 'المشكلة والحل *', type: 'textarea', required: true, minLength: 60, maxLength: 2200 },
        { key: 'targetMarket', label: 'العملاء والسوق المستهدف *', type: 'textarea', required: true, minLength: 30, maxLength: 1400 },
        { key: 'competitiveAdvantage', label: 'لماذا يختلف عن البدائل؟ *', type: 'textarea', required: true, minLength: 30, maxLength: 1400 },
        { key: 'businessModel', label: 'كيف يمكن أن يحقق عائداً؟', type: 'textarea', maxLength: 1200 },
      ] },
      { title: 'الجاهزية والطلب', fields: [
        { key: 'traction', label: 'الاختبارات أو العملاء أو الإنجازات الحالية', type: 'textarea', maxLength: 1400 },
        { key: 'investmentAsk', label: 'ما المطلوب من المستثمر أو الجهة؟ *', type: 'textarea', required: true, minLength: 20, maxLength: 900 },
        { key: 'meetingAudience', label: 'من سيشاهد العرض؟ *', type: 'text', required: true, minLength: 3, maxLength: 240 },
        { key: 'meetingDate', label: 'موعد العرض إن وجد', type: 'date' },
      ] },
    ],
    images: { ...imageDefaults, label: 'صور المنتج أو النموذج والفريق' },
    documents: { ...documentDefaults, label: 'دراسة السوق والملفات المالية أو التقنية' },
  },
  'invention-presentation-script': {
    title: 'إعداد نص التقديم',
    intro: 'صف موقف التقديم وطريقتك الطبيعية حتى تكون الصياغة قابلة للإلقاء وليست نصاً جامداً.',
    titleField: 'inventionName',
    sections: [
      { title: 'سياق التقديم', fields: [
        { key: 'inventionName', label: 'اسم الاختراع *', type: 'text', required: true, minLength: 3, maxLength: 140 },
        { key: 'occasion', label: 'أين ستقدم الاختراع؟ *', type: 'text', required: true, minLength: 5, maxLength: 300, placeholder: 'مسابقة، اجتماع مستثمرين، معرض...' },
        { key: 'audience', label: 'من هم الحضور؟ *', type: 'text', required: true, minLength: 3, maxLength: 240 },
        { key: 'tone', label: 'نبرة التقديم المفضلة *', type: 'select', required: true, options: ['مهنية وواثقة', 'ملهمة وحماسية', 'علمية مبسطة', 'استثمارية مباشرة'] },
      ] },
      { title: 'مادة الحديث', fields: [
        { key: 'story', label: 'قصة الفكرة والمشكلة والحل *', type: 'textarea', required: true, minLength: 50, maxLength: 2200 },
        { key: 'proof', label: 'أقوى دليل أو إنجاز يدعم الاختراع', type: 'textarea', maxLength: 1000 },
        { key: 'desiredAction', label: 'ماذا تريد من الجمهور بعد العرض؟ *', type: 'textarea', required: true, minLength: 15, maxLength: 700 },
        { key: 'concerns', label: 'أسئلة أو اعتراضات تتوقعها', type: 'textarea', maxLength: 1200 },
      ] },
    ],
    images: { ...imageDefaults, label: 'صور مرجعية لفهم الاختراع', maxFiles: 5 },
    documents: documentDefaults,
  },
  'invention-explainer-video': {
    title: 'موجز فيديو الاختراع',
    intro: 'حدد أين سيُعرض الفيديو وما المواد المتاحة حتى نبني السيناريو والمقاس والإيقاع المناسب.',
    titleField: 'videoTitle',
    sections: [
      { title: 'هدف الفيديو', fields: [
        { key: 'videoTitle', label: 'عنوان أو موضوع الفيديو *', type: 'text', required: true, minLength: 3, maxLength: 140 },
        { key: 'videoGoal', label: 'ما الهدف الأساسي؟ *', type: 'select', required: true, options: ['شرح آلية الاختراع', 'التعريف السريع', 'عرض في معرض أو مسابقة', 'جذب شريك أو مستثمر', 'النشر في المنصات'] },
        { key: 'story', label: 'المشكلة والحل وتسلسل القصة *', type: 'textarea', required: true, minLength: 60, maxLength: 2500 },
        { key: 'callToAction', label: 'الرسالة أو الإجراء في نهاية الفيديو', type: 'text', maxLength: 300 },
      ] },
      { title: 'مواصفات الإنتاج', fields: [
        { key: 'platform', label: 'منصة العرض الأساسية *', type: 'select', required: true, options: ['X', 'Instagram / Reels', 'TikTok', 'LinkedIn', 'شاشة معرض', 'استخدام متعدد'] },
        { key: 'orientation', label: 'اتجاه الفيديو *', type: 'select', required: true, options: ['طولي 9:16', 'عرضي 16:9', 'مربع 1:1'] },
        { key: 'voiceover', label: 'التعليق الصوتي *', type: 'select', required: true, options: ['صوت عربي رجالي', 'صوت عربي نسائي', 'نصوص على الشاشة دون تعليق', 'سأوفر تسجيلاً صوتياً'] },
        { key: 'footageStatus', label: 'المواد المصورة المتاحة *', type: 'select', required: true, options: ['صور فقط', 'صور ومقاطع فيديو', 'لا توجد مواد وسنحتاج معالجة بصرية', 'سأرسل المواد لاحقاً'] },
      ] },
    ],
    images: { ...imageDefaults, label: 'صور ومشاهد الاختراع', help: 'ارفع الصور هنا. المقاطع الكبيرة والمواد الإضافية يمكن إرفاقها كرابط داخل الملاحظات أو ضمن الوثائق.', minFiles: 1 },
    documents: { ...documentDefaults, label: 'السيناريو أو الملفات الفنية والروابط' },
  },
  'invention-digital-page': {
    title: 'هيكل الصفحة الرقمية',
    intro: 'حدد محتوى الصفحة وطريقة الوصول والتواصل؛ سنرتبها كوجهة واحدة متجاوبة.',
    titleField: 'pageTitle',
    sections: [
      { title: 'هوية الصفحة', fields: [
        { key: 'pageTitle', label: 'اسم الاختراع أو عنوان الصفحة *', type: 'text', required: true, minLength: 3, maxLength: 140 },
        { key: 'pageIntro', label: 'نبذة افتتاحية *', type: 'textarea', required: true, minLength: 40, maxLength: 1500 },
        { key: 'sections', label: 'الأقسام المطلوب عرضها *', type: 'textarea', required: true, minLength: 20, maxLength: 1400, placeholder: 'عن الاختراع، المزايا، الصور، الإنجازات، تواصل...' },
        { key: 'primaryAction', label: 'الزر أو الإجراء الرئيسي *', type: 'text', required: true, minLength: 3, maxLength: 180, placeholder: 'طلب شراكة، تواصل، تحميل الملف...' },
      ] },
      { title: 'الوصول والتواصل', fields: [
        { key: 'visibility', label: 'خصوصية الصفحة *', type: 'select', required: true, options: ['عامة ومتاحة للجميع', 'خاصة برابط', 'خاصة بكلمة مرور'] },
        { key: 'contactDetails', label: 'بيانات التواصل المطلوب إظهارها *', type: 'textarea', required: true, minLength: 10, maxLength: 700 },
        { key: 'links', label: 'روابط خارجية أو حسابات اجتماعية', type: 'textarea', maxLength: 1000 },
        { key: 'preferredSlug', label: 'اسم الرابط المقترح بالإنجليزية', type: 'text', maxLength: 60, placeholder: 'my-invention' },
      ] },
    ],
    images: { ...imageDefaults, label: 'معرض صور الصفحة', minFiles: 1 },
    documents: { ...documentDefaults, label: 'ملفات قابلة للعرض أو التحميل في الصفحة' },
  },
  'inventor-media-kit': {
    title: 'بيانات الملف الإعلامي',
    intro: 'زوّدنا بالمعلومات المعتمدة التي يمكن للإعلام والجهات استخدامها عن المخترع.',
    titleField: 'inventorName',
    sections: [
      { title: 'الهوية الإعلامية', fields: [
        { key: 'inventorName', label: 'الاسم الكامل *', type: 'text', required: true, minLength: 3, maxLength: 140 },
        { key: 'professionalTitle', label: 'الصفة أو التخصص *', type: 'text', required: true, minLength: 3, maxLength: 180 },
        { key: 'bio', label: 'السيرة والنشأة والمسار *', type: 'textarea', required: true, minLength: 60, maxLength: 2500 },
        { key: 'keyMessage', label: 'الرسالة التي تود أن يعرفك بها الجمهور', type: 'textarea', maxLength: 800 },
      ] },
      { title: 'الإنجاز والظهور', fields: [
        { key: 'achievements', label: 'الاختراعات والجوائز والإنجازات *', type: 'textarea', required: true, minLength: 40, maxLength: 2500 },
        { key: 'mediaAppearances', label: 'روابط أو أسماء الظهور الإعلامي', type: 'textarea', maxLength: 1500 },
        { key: 'contactPreference', label: 'وسيلة التواصل الإعلامي المعتمدة *', type: 'text', required: true, minLength: 5, maxLength: 300 },
        { key: 'languages', label: 'لغة الملف المطلوبة *', type: 'select', required: true, options: ['العربية', 'الإنجليزية', 'العربية والإنجليزية'] },
      ] },
    ],
    images: { ...imageDefaults, label: 'الصور الشخصية وصور الإنجازات', help: 'يفضل رفع صورة شخصية رسمية أفقية ورأسية، وصور عالية الدقة من المشاركات والجوائز.', minFiles: 1 },
    documents: { ...documentDefaults, label: 'السيرة والشهادات والروابط الإعلامية' },
  },
  'starter-bundle': {
    title: 'موجز حزمة البداية',
    intro: 'سنستخدم هذه المعلومات لبناء البطاقة والإنفوجرافيك ونص التقديم برسالة واحدة.',
    titleField: 'inventionName',
    sections: [
      { title: 'أساس القصة', fields: [
        { key: 'inventionName', label: 'اسم الاختراع *', type: 'text', required: true, minLength: 3, maxLength: 140 },
        { key: 'problemSolution', label: 'المشكلة والحل وكيف يعمل *', type: 'textarea', required: true, minLength: 80, maxLength: 2800 },
        { key: 'topBenefits', label: 'أهم ثلاث فوائد أو مزايا *', type: 'textarea', required: true, minLength: 30, maxLength: 1200 },
        { key: 'stepsAndFacts', label: 'الخطوات والأرقام المناسبة للإنفوجرافيك', type: 'textarea', maxLength: 1400 },
      ] },
      { title: 'الاستخدام', fields: [
        { key: 'audience', label: 'الجمهور المستهدف *', type: 'text', required: true, minLength: 3, maxLength: 220 },
        { key: 'presentationContext', label: 'أين ستستخدم المواد؟ *', type: 'text', required: true, minLength: 5, maxLength: 300 },
        { key: 'developmentStage', label: 'مرحلة الاختراع *', type: 'select', required: true, options: ['فكرة أولية', 'نموذج أولي', 'تم اختباره', 'منتج جاهز', 'في السوق'] },
      ] },
    ],
    images: { ...imageDefaults, label: 'صور الاختراع والمخترع' },
    documents: documentDefaults,
  },
  'presentation-ready-bundle': {
    title: 'موجز حزمة جاهز للعرض',
    intro: 'نربط الملف والعرض والإنفوجرافيك والنص بموعد العرض والجمهور والنتيجة المطلوبة.',
    titleField: 'inventionName',
    sections: [
      { title: 'الاختراع والفرصة', fields: [
        { key: 'inventionName', label: 'اسم الاختراع *', type: 'text', required: true, minLength: 3, maxLength: 140 },
        { key: 'fullStory', label: 'المشكلة والحل والآلية والمزايا *', type: 'textarea', required: true, minLength: 100, maxLength: 3500 },
        { key: 'marketAndAudience', label: 'السوق والمستخدمون المستهدفون *', type: 'textarea', required: true, minLength: 40, maxLength: 1600 },
        { key: 'proofAndAchievements', label: 'الاختبارات والجوائز والإنجازات', type: 'textarea', maxLength: 1800 },
      ] },
      { title: 'العرض القادم', fields: [
        { key: 'presentationFor', label: 'الجهة أو الجمهور الذي ستعرض أمامه *', type: 'text', required: true, minLength: 3, maxLength: 260 },
        { key: 'desiredOutcome', label: 'النتيجة المطلوبة من العرض *', type: 'textarea', required: true, minLength: 20, maxLength: 900 },
        { key: 'presentationDate', label: 'موعد العرض إن وجد', type: 'date' },
        { key: 'brandPreference', label: 'الهوية أو الألوان المفضلة', type: 'text', maxLength: 300 },
      ] },
    ],
    images: { ...imageDefaults, label: 'صور العرض والاختراع والمخترع', minFiles: 1 },
    documents: { ...documentDefaults, label: 'ملفات الاختراع ودراسة السوق والإنجازات' },
  },
  'investment-ready-bundle': {
    title: 'تقييم الجاهزية للاستثمار',
    intro: 'نحتاج معلومات تشغيلية وسوقية واقعية لبناء عرض وخريطة شركاء دون ادعاء ضمان الاستثمار.',
    titleField: 'ventureName',
    sections: [
      { title: 'المشروع والسوق', fields: [
        { key: 'ventureName', label: 'اسم الاختراع أو المشروع *', type: 'text', required: true, minLength: 3, maxLength: 140 },
        { key: 'productAndProblem', label: 'المنتج والمشكلة والحل *', type: 'textarea', required: true, minLength: 100, maxLength: 3500 },
        { key: 'market', label: 'السوق والعملاء والمنافسون *', type: 'textarea', required: true, minLength: 60, maxLength: 2400 },
        { key: 'businessModel', label: 'نموذج الإيرادات والتسعير *', type: 'textarea', required: true, minLength: 30, maxLength: 1600 },
        { key: 'traction', label: 'ما تحقق حتى الآن؟ *', type: 'textarea', required: true, minLength: 20, maxLength: 1600 },
      ] },
      { title: 'الاستثمار والشراكات', fields: [
        { key: 'fundingGoal', label: 'التمويل أو الشراكة المطلوبة *', type: 'textarea', required: true, minLength: 30, maxLength: 1200 },
        { key: 'fundingAmount', label: 'قيمة التمويل المطلوبة إن وجدت', type: 'number', placeholder: 'بالريال السعودي' },
        { key: 'fundUse', label: 'كيف سيُستخدم التمويل؟', type: 'textarea', maxLength: 1200 },
        { key: 'ipStatus', label: 'حالة الملكية الفكرية *', type: 'select', required: true, options: ['لم يبدأ الإجراء', 'تم إيداع الطلب', 'تحت الفحص', 'براءة ممنوحة', 'حماية أخرى / سر تجاري'] },
        { key: 'preferredPartners', label: 'نوع الجهات أو الشركاء المطلوبين', type: 'textarea', maxLength: 1000 },
      ] },
    ],
    images: { ...imageDefaults, label: 'صور المنتج والفريق والتجارب', minFiles: 1 },
    documents: { ...documentDefaults, label: 'الملفات التقنية والسوقية والمالية وإثبات الملكية' },
  },
  'launch-bundle': {
    title: 'موجز الإطلاق الشامل',
    intro: 'نبني الإطلاق حول رسالة وموعد وجمهور واضح، ثم نوحّد المحتوى والتصاميم والفيديو والصفحة.',
    titleField: 'launchName',
    sections: [
      { title: 'موضوع الإطلاق', fields: [
        { key: 'launchName', label: 'اسم الاختراع أو عنوان الإطلاق *', type: 'text', required: true, minLength: 3, maxLength: 160 },
        { key: 'launchStory', label: 'قصة الاختراع وما الذي سيُعلن؟ *', type: 'textarea', required: true, minLength: 100, maxLength: 3500 },
        { key: 'keyMessages', label: 'الرسائل الرئيسية والحقائق المعتمدة *', type: 'textarea', required: true, minLength: 50, maxLength: 2200 },
        { key: 'audience', label: 'الجمهور المستهدف *', type: 'textarea', required: true, minLength: 20, maxLength: 900 },
      ] },
      { title: 'خطة الإطلاق', fields: [
        { key: 'launchDate', label: 'تاريخ الإطلاق المتوقع', type: 'date' },
        { key: 'channels', label: 'القنوات والمنصات المطلوبة *', type: 'textarea', required: true, minLength: 10, maxLength: 700 },
        { key: 'spokesperson', label: 'المتحدث أو الاسم الذي سيظهر في المواد', type: 'text', maxLength: 220 },
        { key: 'callToAction', label: 'الإجراء المطلوب من الجمهور *', type: 'text', required: true, minLength: 5, maxLength: 300 },
        { key: 'restrictions', label: 'معلومات سرية أو قيود يجب مراعاتها', type: 'textarea', maxLength: 1000 },
      ] },
    ],
    images: { ...imageDefaults, label: 'مكتبة صور الإطلاق', help: 'ارفع صور الاختراع والمخترع والفريق والفعاليات والهوية بأعلى دقة متاحة.', minFiles: 1 },
    documents: { ...documentDefaults, label: 'الملف الكامل والهوية والمواد المعتمدة' },
  },
}

export function getInventorStoreOrderForm(slug: string) {
  return INVENTOR_STORE_ORDER_FORMS[slug]
}

export function validateInventorStoreAnswers(definition: InventorOrderFormDefinition, answers: Record<string, unknown>) {
  for (const section of definition.sections) {
    for (const field of section.fields) {
      const value = String(answers[field.key] ?? '').trim()
      if (field.required && !value) return `أكمل حقل: ${field.label.replace(' *', '')}`
      if (value && field.minLength && value.length < field.minLength) return `حقل «${field.label.replace(' *', '')}» يحتاج تفاصيل أكثر`
      if (value && field.maxLength && value.length > field.maxLength) return `حقل «${field.label.replace(' *', '')}» تجاوز الحد المسموح`
      if (value && field.options && !field.options.includes(value)) return `القيمة المختارة في «${field.label.replace(' *', '')}» غير صحيحة`
    }
  }
  return null
}

export function formatInventorStoreAnswers(definition: InventorOrderFormDefinition, answers: Record<string, unknown>) {
  return definition.sections.flatMap(section => [
    `## ${section.title}`,
    ...section.fields.flatMap(field => {
      const value = String(answers[field.key] ?? '').trim()
      return value ? [`${field.label.replace(' *', '')}: ${value}`] : []
    }),
  ]).join('\n\n')
}

import {
  generateEducationCopy,
  generateEducationInfographic,
  type EducationTopic,
} from '@/lib/first1-education'

export const FIRST1_OCCASION_SOURCE = 'first1saudi-occasion'

type AnnualOccasion = Omit<EducationTopic, 'id'> & {
  id: string
  month?: number
  day?: number
  dateLabel: string
  kind: 'official' | 'global' | 'religious'
}

export type First1Occasion = AnnualOccasion & { date: string | null }

const OCCASIONS: AnnualOccasion[] = [
  { id: 'education-day', month: 1, day: 24, dateLabel: '24 يناير', kind: 'global', title: 'المعرفة هي أول اختراع', category: 'اليوم الدولي للتعليم', sourceUrl: 'https://www.un.org/en/observances/international-day-education', facts: ['التعليم يفتح باب اكتساب المعرفة والمهارات اللازمة للمستقبل.', 'كل رحلة إنجاز تبدأ بسؤال جيد ورغبة حقيقية في التعلم.'], contentTags: ['#التعليم', '#تمكين_المواهب'] },
  { id: 'women-science', month: 2, day: 11, dateLabel: '11 فبراير', kind: 'global', title: 'العلم يتسع لكل موهبة', category: 'اليوم الدولي للمرأة والفتاة في العلوم', sourceUrl: 'https://www.un.org/en/observances/women-and-girls-in-science-day', facts: ['مشاركة الفتيات والنساء في العلوم توسع دائرة الحلول والأفكار.', 'الموهبة العلمية تكبر بالفرص والتجربة والثقة.'], contentTags: ['#المرأة_في_العلوم', '#موهبة'] },
  { id: 'founding-day', month: 2, day: 22, dateLabel: '22 فبراير', kind: 'official', title: 'من الجذور إلى المستقبل', category: 'يوم التأسيس', sourceUrl: 'https://www.spa.gov.sa/', facts: ['يوم التأسيس مناسبة وطنية للاعتزاز بجذور الدولة السعودية التي تأسست عام 1727م.', 'الهوية الراسخة تمنح الطموح مساحة أوسع لبناء المستقبل.'], contentTags: ['#يوم_التأسيس', '#السعودية'] },
  { id: 'flag-day', month: 3, day: 11, dateLabel: '11 مارس', kind: 'official', title: 'علمنا يحمل قصة طموح', category: 'يوم العلم السعودي', sourceUrl: 'https://www.spa.gov.sa/w1863066', facts: ['يُحتفى بيوم العلم السعودي في 11 مارس من كل عام.', 'يرمز العلم السعودي إلى التوحيد والعدل والقوة والنماء والرخاء.'], contentTags: ['#يوم_العلم', '#السعودية'] },
  { id: 'space-flight', month: 4, day: 12, dateLabel: '12 أبريل', kind: 'global', title: 'الفضاء يبدأ بسؤال', category: 'اليوم الدولي للرحلات البشرية إلى الفضاء', sourceUrl: 'https://www.un.org/en/observances/human-spaceflight-day', facts: ['الرحلات البشرية إلى الفضاء تذكرنا بأن الأسئلة الكبيرة تحتاج علماً وتجربة.', 'كل إنجاز تقني كبير يبدأ بخيال منضبط بالمعرفة.'], contentTags: ['#علوم_الفضاء', '#ابتكار'] },
  { id: 'creativity-innovation', month: 4, day: 21, dateLabel: '21 أبريل', kind: 'global', title: 'فكرتك قد تحل مشكلة كبيرة', category: 'اليوم العالمي للإبداع والابتكار', sourceUrl: 'https://www.un.org/en/observances/creativity-and-innovation-day', facts: ['الإبداع والابتكار يقدمان حلولاً جديدة للتحديات اليومية.', 'الفكرة الأقوى هي التي تربط الخيال بحل حاجة حقيقية.'], contentTags: ['#إبداع', '#ابتكار'] },
  { id: 'ip-day', month: 4, day: 26, dateLabel: '26 أبريل', kind: 'global', title: 'الفكرة تستحق أن تُحمى', category: 'اليوم العالمي للملكية الفكرية', sourceUrl: 'https://www.wipo.int/en/web/ipday', facts: ['الملكية الفكرية تساعد المبدعين والمبتكرين على حماية نتاجهم.', 'التوثيق والبحث المبكر جزء مهم من رحلة الفكرة.'], contentTags: ['#ملكية_فكرية', '#براءات_اختراع'] },
  { id: 'light-day', month: 5, day: 16, dateLabel: '16 مايو', kind: 'global', title: 'الضوء أكثر من شيء نراه', category: 'اليوم الدولي للضوء', sourceUrl: 'https://www.unesco.org/ar/days/light', facts: ['يُحتفل باليوم الدولي للضوء في 16 مايو من كل عام.', 'ساهم علم الضوء في تقنيات للطب والاتصالات والطاقة وفهم الكون.'], contentTags: ['#علوم', '#تقنية'] },
  { id: 'environment-day', month: 6, day: 5, dateLabel: '5 يونيو', kind: 'global', title: 'ابتكار يخدم الكوكب', category: 'اليوم العالمي للبيئة', sourceUrl: 'https://www.un.org/en/observances/world-environment-day', facts: ['الابتكار المستدام يبحث عن حلول تخفف الأثر البيئي وتحسن الحياة.', 'التحديات البيئية تفتح مساحات واسعة للأفكار القابلة للتطبيق.'], contentTags: ['#استدامة', '#ابتكار'] },
  { id: 'youth-skills', month: 7, day: 15, dateLabel: '15 يوليو', kind: 'global', title: 'المهارة تعطي الموهبة صوتاً', category: 'اليوم العالمي لمهارات الشباب', sourceUrl: 'https://www.un.org/en/observances/world-youth-skills-day', facts: ['المهارات العملية تساعد الشباب على الانتقال من الفكرة إلى الأثر.', 'التعلم المستمر يصنع فارقاً في رحلة الموهبة والعمل.'], contentTags: ['#مهارات_الشباب', '#تمكين'] },
  { id: 'youth-day', month: 8, day: 12, dateLabel: '12 أغسطس', kind: 'global', title: 'ابدأ من المشكلة', category: 'اليوم الدولي للشباب', sourceUrl: 'https://www.un.org/en/observances/youth-day', facts: ['الشباب يملكون قدرة كبيرة على تحويل التحديات إلى فرص.', 'البداية الذكية لأي مشروع هي فهم المشكلة التي يحلها.'], contentTags: ['#الشباب', '#ريادة_الأعمال'] },
  { id: 'literacy-day', month: 9, day: 8, dateLabel: '8 سبتمبر', kind: 'global', title: 'اقرأ أكثر لتبني أبعد', category: 'اليوم الدولي لمحو الأمية', sourceUrl: 'https://www.unesco.org/en/days/literacy', facts: ['يُحتفل باليوم الدولي لمحو الأمية في 8 سبتمبر من كل عام.', 'القراءة والكتابة أساس لاكتساب معرفة أوسع ومهارات جديدة.'], contentTags: ['#محو_الأمية', '#معرفة'] },
  { id: 'national-day', month: 9, day: 23, dateLabel: '23 سبتمبر', kind: 'official', title: 'وطن يصنع الممكن', category: 'اليوم الوطني السعودي', sourceUrl: 'https://www.mofa.gov.sa/en/ksa/Pages/saudiNationalDay.aspx', facts: ['يوافق اليوم الوطني السعودي 23 سبتمبر من كل عام.', 'الطموح الوطني يترجم إلى فرص للمعرفة والابتكار والإنجاز.'], contentTags: ['#اليوم_الوطني', '#السعودية'] },
  { id: 'space-week', month: 10, day: 4, dateLabel: '4 أكتوبر', kind: 'global', title: 'للسماء مسارات تبدأ من الأرض', category: 'أسبوع الفضاء العالمي', sourceUrl: 'https://www.un.org/en/observances/world-space-week', facts: ['يقام أسبوع الفضاء العالمي سنوياً من 4 إلى 10 أكتوبر.', 'علوم الفضاء تجمع بين الفيزياء والهندسة والخيال العلمي المنهجي.'], contentTags: ['#أسبوع_الفضاء', '#علوم_الفضاء'] },
  { id: 'teachers-day', month: 10, day: 5, dateLabel: '5 أكتوبر', kind: 'global', title: 'خلف كل موهبة من يفتح باباً', category: 'اليوم العالمي للمعلمين', sourceUrl: 'https://www.unesco.org/en/days/teachers', facts: ['يُحتفل باليوم العالمي للمعلمين في 5 أكتوبر.', 'المعلم يصنع بيئة تمنح الأسئلة والموهبة فرصة للنمو.'], contentTags: ['#يوم_المعلم', '#تعليم'] },
  { id: 'science-day', month: 11, day: 10, dateLabel: '10 نوفمبر', kind: 'global', title: 'العلم حلٌّ قابل للمشاركة', category: 'اليوم العالمي للعلوم من أجل السلام والتنمية', sourceUrl: 'https://www.unesco.org/en/days/science', facts: ['العلم أداة لفهم العالم وبناء حلول تخدم التنمية.', 'تبادل المعرفة والتعاون العلمي يزيدان أثر الابتكار.'], contentTags: ['#اليوم_العالمي_للعلوم', '#ابتكار'] },
  { id: 'arabic-day', month: 12, day: 18, dateLabel: '18 ديسمبر', kind: 'global', title: 'العربية لغة فكرة وهوية', category: 'اليوم العالمي للغة العربية', sourceUrl: 'https://www.unesco.org/en/days/arabic-language', facts: ['يُحتفل باليوم العالمي للغة العربية في 18 ديسمبر.', 'اللغة العربية وعاء غني للمعرفة والتواصل والإبداع.'], contentTags: ['#اللغة_العربية', '#معرفة'] },
  { id: 'eid-fitr', dateLabel: 'عيد الفطر', kind: 'religious', title: 'عيدٌ يليق بفرحة الإنجاز', category: 'عيد الفطر', sourceUrl: 'https://www.sama.gov.sa/', facts: ['يُحدد موعد عيد الفطر وفق التقويم الهجري والإعلان الرسمي.', 'العيد مناسبة للفرح والامتنان وبداية جديدة.'], contentTags: ['#عيد_الفطر', '#السعودية'] },
  { id: 'eid-adha', dateLabel: 'عيد الأضحى', kind: 'religious', title: 'عيد مبارك وطموح مستمر', category: 'عيد الأضحى', sourceUrl: 'https://www.sama.gov.sa/', facts: ['يُحدد موعد عيد الأضحى وفق التقويم الهجري والإعلان الرسمي.', 'العيد مناسبة للفرح والتواصل وتقدير ما تحقق.'], contentTags: ['#عيد_الأضحى', '#السعودية'] },
]

function nextAnnualDate(month: number, day: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0)
  const year = value('year')
  const today = `${year}-${String(value('month')).padStart(2, '0')}-${String(value('day')).padStart(2, '0')}`
  const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return candidate >= today ? candidate : `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function getFirst1Occasions(): First1Occasion[] {
  return OCCASIONS.map(occasion => ({ ...occasion, date: occasion.month && occasion.day ? nextAnnualDate(occasion.month, occasion.day) : null }))
}

export function occasionKey(occasion: First1Occasion): string {
  return `${occasion.id}-${occasion.date ?? 'hijri'}`
}

export async function generateFirst1Occasion(occasion: First1Occasion) {
  const content = await generateEducationCopy({ id: occasionKey(occasion), title: occasion.title, category: occasion.category, sourceUrl: occasion.sourceUrl, facts: occasion.facts, contentTags: occasion.contentTags })
  return { content, designUrl: await generateEducationInfographic(content, 'first1-occasion') }
}

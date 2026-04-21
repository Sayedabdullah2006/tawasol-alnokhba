// ─── Platform Info ───
export const PLATFORM = {
  nameAr: 'تواصل النخبة',
  nameEn: 'Tawasul Al-Nokhba',
  tagline: 'اترك أثراً دائماً..',
  email: process.env.ADMIN_EMAIL ?? 'admin@tawasul-elite.com',
}

// ─── Categories ───
export interface Category {
  id: string
  nameAr: string
  icon: string
  desc: string
  hasSubOption?: boolean
  // Which client types can see this category
  // undefined = all types can see it
  clientTypes?: string[]
}

export const CATEGORIES: Category[] = [
  { id: 'inventions', nameAr: 'الاختراعات', icon: '💡', desc: 'اختراع أو ابتكار جديد', hasSubOption: true, clientTypes: ['individual'] },
  { id: 'competitions', nameAr: 'المسابقات', icon: '🏆', desc: 'فوز أو تميز في مسابقة', hasSubOption: true, clientTypes: ['individual'] },
  { id: 'books', nameAr: 'كتب ومصنفات', icon: '📚', desc: 'كتاب أو بحث أو مصنف', clientTypes: ['individual'] },
  { id: 'certs', nameAr: 'شهادات احترافية', icon: '🎖️', desc: 'شهادة مهنية أو تخصصية', clientTypes: ['individual'] },
  { id: 'graduation', nameAr: 'تهنئة تخرج', icon: '🎓', desc: 'تخرج أو إنجاز أكاديمي', clientTypes: ['individual'] },
  { id: 'appointment', nameAr: 'تعيين منصب', icon: '👔', desc: 'تعيين أو ترقية مهنية' },
  { id: 'award', nameAr: 'جائزة خاصة', icon: '🥇', desc: 'جائزة أو تكريم', clientTypes: ['individual'] },
  { id: 'cv', nameAr: 'سيرة ذاتية', icon: '👤', desc: 'ملف شخصي احترافي', clientTypes: ['individual'] },
  { id: 'product', nameAr: 'منتج تجاري', icon: '🚀', desc: 'منتج أو خدمة تجارية', clientTypes: ['individual', 'business'] },
  { id: 'research', nameAr: 'بحث علمي', icon: '🔬', desc: 'بحث أو دراسة علمية', clientTypes: ['individual'] },
  { id: 'charity', nameAr: 'مبادرة خيرية', icon: '❤️', desc: 'مبادرة أو عمل خيري', clientTypes: ['charity'] },
  { id: 'government', nameAr: 'إعلان حكومي', icon: '🏛️', desc: 'خدمة أو إعلان حكومي', clientTypes: ['government'] },
]

// Helper to filter categories by client type
export function getCategoriesForClientType(clientType: string): Category[] {
  return CATEGORIES.filter(c => !c.clientTypes || c.clientTypes.includes(clientType))
}

// ─── Competition Subcategories ───
export interface CompetitionSubcategory {
  id: string
  nameAr: string
  desc: string
  positions: CompetitionPosition[]
}

export interface CompetitionPosition {
  id: string
  nameAr: string
  multiplier: number // Price multiplier based on position
}

export const COMPETITION_POSITIONS: CompetitionPosition[] = [
  { id: 'first', nameAr: 'المركز الأول', multiplier: 2.0 },
  { id: 'second', nameAr: 'المركز الثاني', multiplier: 1.8 },
  { id: 'third', nameAr: 'المركز الثالث', multiplier: 1.6 },
  { id: 'top_10', nameAr: 'ضمن أفضل 10', multiplier: 1.4 },
  { id: 'top_50', nameAr: 'ضمن أفضل 50', multiplier: 1.2 },
  { id: 'participation', nameAr: 'مشاركة فقط', multiplier: 1.0 },
]

export const COMPETITION_SUBCATEGORIES: CompetitionSubcategory[] = [
  {
    id: 'international',
    nameAr: 'المسابقات الدولية',
    desc: 'مسابقات عالمية ودولية',
    positions: COMPETITION_POSITIONS
  },
  {
    id: 'local',
    nameAr: 'المسابقات المحلية',
    desc: 'مسابقات محلية ووطنية',
    positions: COMPETITION_POSITIONS
  },
  {
    id: 'hackathon',
    nameAr: 'مشاركة في هاكثون',
    desc: 'هاكثون أو تحدٍ برمجي',
    positions: [
      { id: 'first', nameAr: 'المركز الأول', multiplier: 1.8 },
      { id: 'second', nameAr: 'المركز الثاني', multiplier: 1.6 },
      { id: 'third', nameAr: 'المركز الثالث', multiplier: 1.4 },
      { id: 'finalist', nameAr: 'وصلت للنهائي', multiplier: 1.3 },
      { id: 'participation', nameAr: 'مشاركة فقط', multiplier: 1.0 },
    ]
  },
]

// Helper to get competition subcategories
export function getCompetitionSubcategories(): CompetitionSubcategory[] {
  return COMPETITION_SUBCATEGORIES
}

// Helper to get positions for a specific competition type
export function getCompetitionPositions(subcategoryId: string): CompetitionPosition[] {
  const subcategory = COMPETITION_SUBCATEGORIES.find(s => s.id === subcategoryId)
  return subcategory?.positions ?? []
}

// ─── Platforms ───
export const PLATFORMS = [
  { id: 'x', name: '𝕏', color: '#1D1D1D', label: 'X (تويتر)' },
  { id: 'instagram', name: '◉', color: '#E1306C', label: 'Instagram' },
  { id: 'linkedin', name: 'in', color: '#0077B5', label: 'LinkedIn' },
  { id: 'tiktok', name: '▶', color: '#69C9D0', label: 'TikTok' },
]

// ─── Extras ───
export const EXTRAS = [
  { id: 'bilingual', nameAr: 'صياغة المحتوى باللغتين', icon: '✍️', price: 300 },
  { id: 'mention', nameAr: 'منشن في القناة', icon: '🔔', price: 200 },
  { id: 'story', nameAr: 'ستوري في القناة', icon: '📱', price: 150 },
  { id: 'encyclopedia', nameAr: 'إضافة للموسوعة الرقمية', icon: '📖', price: 500 },
  { id: 'pin6', nameAr: 'تثبيت 6 أشهر', icon: '📌', price: 100 },
  { id: 'pin12', nameAr: 'تثبيت 12 شهر', icon: '📍', price: 200 },
  { id: 'repost', nameAr: 'إعادة نشر', icon: '🔄', price: 150 },
  { id: 'campaign', nameAr: 'حملة ترويجية متكاملة', icon: '📣', price: 1000 },
  { id: 'video', nameAr: 'فيديو جاهز', icon: '🎬', price: 400 },
  { id: 'report', nameAr: 'تقرير الأداء', icon: '📊', price: 800 },
  { id: 'plan', nameAr: 'خطة تسويقية شاملة', icon: '🗺️', price: 1500 },
  { id: 'website', nameAr: 'تصميم موقع إلكتروني', icon: '🌐', price: 5000 },
  { id: 'media', nameAr: 'تغطية إعلامية', icon: '📺', price: 10000 },
  { id: 'infographic', nameAr: 'تصميم انفوجرافيك', icon: '🎨', price: 300, categoryOnly: 'cv' },
]

// ─── Post count messages ───
export const POST_COUNT_MESSAGES: Record<number, string> = {
  1: 'سيتم احتساب السعر الأساسي',
  2: 'ستحصل على خصم إضافي على طلبك',
  3: 'ستحصل على خصم أكبر على طلبك',
  4: 'خصم جيد على طلبك',
  5: 'خصم ممتاز على طلبك',
  6: 'خصم رائع على طلبك',
  7: 'خصم كبير جداً على طلبك',
  8: 'خصم ضخم على طلبك',
  9: 'خصم استثنائي على طلبك',
  10: 'خصم كبير جداً على طلبك',
}
export const POST_COUNT_MESSAGE_11_PLUS = 'أعلى خصم متاح — وفّر بشكل كبير'

// ─── Statuses ───
export const REQUEST_STATUSES = {
  pending: { label: 'تحت المراجعة', color: 'yellow' },
  quoted: { label: 'بانتظار موافقتك', color: 'blue' },
  client_rejected: { label: 'رفض العميل للعرض', color: 'red' },
  negotiation: { label: 'تفاوض على السعر', color: 'orange' },
  approved: { label: 'بانتظار الدفع', color: 'cyan' },
  payment_review: { label: 'بانتظار تحقق الدفع', color: 'orange' },
  paid: { label: 'تم الدفع', color: 'cyan' },
  in_progress: { label: 'قيد التنفيذ', color: 'orange' },
  content_review: { label: 'مراجعة المحتوى', color: 'purple' },
  completed: { label: 'مكتمل', color: 'green' },
  rejected: { label: 'مرفوض', color: 'red' },
} as const

export type RequestStatus = keyof typeof REQUEST_STATUSES

// ─── Progress Steps ───
export interface ProgressStep {
  id: string
  label: string
  icon: string
  description: string
}

export const PROGRESS_STEPS: ProgressStep[] = [
  { id: 'pending', label: 'المراجعة الأولية', icon: '📋', description: 'جاري مراجعة الطلب' },
  { id: 'quoted', label: 'العرض المخصص', icon: '💰', description: 'بانتظار موافقتك على العرض' },
  { id: 'payment', label: 'الدفع', icon: '💳', description: 'إتمام عملية الدفع' },
  { id: 'in_progress', label: 'التحضير', icon: '⚡', description: 'جاري تحضير المحتوى' },
  { id: 'content_review', label: 'مراجعة المحتوى', icon: '👁️', description: 'مراجعة المحتوى المقترح' },
  { id: 'completed', label: 'مكتمل', icon: '✅', description: 'تم إنجاز الطلب بنجاح' },
]

// Helper function to get the current step index
export function getCurrentStepIndex(status: RequestStatus): number {
  switch (status) {
    case 'pending': return 0
    case 'quoted': return 1
    case 'approved':
    case 'payment_review':
    case 'paid': return 2
    case 'in_progress': return 3
    case 'content_review': return 4
    case 'completed': return 5
    case 'rejected': return -1 // Special case for rejected
    default: return 0
  }
}

// Helper function to check if a step is completed
export function isStepCompleted(stepIndex: number, currentStatus: RequestStatus): boolean {
  const currentIndex = getCurrentStepIndex(currentStatus)
  return currentIndex > stepIndex
}

// Helper function to check if a step is active
export function isStepActive(stepIndex: number, currentStatus: RequestStatus): boolean {
  return getCurrentStepIndex(currentStatus) === stepIndex
}

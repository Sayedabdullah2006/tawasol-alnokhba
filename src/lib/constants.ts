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
  { id: 'events', nameAr: 'فعاليات ومؤتمرات', icon: '🎯', desc: 'مؤتمر أو معرض أو فعالية' },
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
  approved: { label: 'بانتظار الدفع', color: 'cyan' },
  payment_review: { label: 'بانتظار تحقق الدفع', color: 'orange' },
  paid: { label: 'تم الدفع', color: 'cyan' },
  in_progress: { label: 'قيد التنفيذ', color: 'orange' },
  completed: { label: 'مكتمل', color: 'green' },
  rejected: { label: 'مرفوض', color: 'red' },
} as const

export type RequestStatus = keyof typeof REQUEST_STATUSES

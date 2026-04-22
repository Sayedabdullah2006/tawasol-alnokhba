// نظام ترجمة الحالات حسب دور المستخدم
import { RequestStatus } from './constants'

// ترجمة الحالات للعميل
export const CLIENT_STATUS_LABELS: Record<RequestStatus, { label: string; color: string; description: string }> = {
  pending: {
    label: 'تحت المراجعة',
    color: 'yellow',
    description: 'جاري مراجعة طلبك من قبل فريق الإدارة'
  },
  quoted: {
    label: 'بانتظار موافقتك',
    color: 'blue',
    description: 'وصلك عرض سعر، راجعه ووافق أو اطلب التفاوض'
  },
  client_rejected: {
    label: 'رفضت العرض',
    color: 'red',
    description: 'قمت برفض عرض السعر المقدم'
  },
  negotiation: {
    label: 'طلبت التفاوض',
    color: 'orange',
    description: 'تم إرسال طلب التفاوض، في انتظار رد الإدارة'
  },
  approved: {
    label: 'مُعتمد - ادفع الآن',
    color: 'cyan',
    description: 'تم اعتماد العرض، يرجى إتمام عملية الدفع'
  },
  payment_review: {
    label: 'تم الدفع - بانتظار التحقق',
    color: 'orange',
    description: 'تم رفع إيصال الدفع، جاري التحقق من الإدارة'
  },
  paid: {
    label: 'تم تأكيد الدفع',
    color: 'cyan',
    description: 'تم تأكيد استلام الدفع، سيبدأ التنفيذ قريباً'
  },
  in_progress: {
    label: 'قيد التنفيذ',
    color: 'orange',
    description: 'جاري تحضير المحتوى وتنفيذ طلبك'
  },
  content_review: {
    label: 'راجع المحتوى المقترح',
    color: 'purple',
    description: 'وصل إليك محتوى مقترح للمراجعة والموافقة'
  },
  completed: {
    label: 'مكتمل',
    color: 'green',
    description: 'تم إنجاز طلبك بنجاح'
  },
  rejected: {
    label: 'مرفوض',
    color: 'red',
    description: 'تم رفض طلبك من قبل الإدارة'
  }
}

// ترجمة الحالات للإدارة
export const ADMIN_STATUS_LABELS: Record<RequestStatus, { label: string; color: string; description: string }> = {
  pending: {
    label: 'بانتظار المراجعة',
    color: 'yellow',
    description: 'طلب جديد يحتاج مراجعة وإرسال عرض سعر'
  },
  quoted: {
    label: 'بانتظار موافقة العميل',
    color: 'blue',
    description: 'تم إرسال عرض السعر، في انتظار رد العميل'
  },
  client_rejected: {
    label: 'رفض العميل للعرض',
    color: 'red',
    description: 'رفض العميل عرض السعر المقدم'
  },
  negotiation: {
    label: 'العميل طلب التفاوض',
    color: 'orange',
    description: 'طلب العميل التفاوض على السعر - يحتاج للرد'
  },
  approved: {
    label: 'معتمد - بانتظار الدفع',
    color: 'cyan',
    description: 'وافق العميل على العرض، في انتظار الدفع'
  },
  payment_review: {
    label: 'إيصال دفع - يحتاج تحقق',
    color: 'orange',
    description: 'رفع العميل إيصال دفع، يحتاج تحقق وتأكيد'
  },
  paid: {
    label: 'تم تأكيد الدفع',
    color: 'cyan',
    description: 'تم تأكيد استلام الدفع، يمكن بدء التنفيذ'
  },
  in_progress: {
    label: 'قيد التنفيذ',
    color: 'orange',
    description: 'جاري تنفيذ المشروع وتحضير المحتوى'
  },
  content_review: {
    label: 'العميل يراجع المحتوى',
    color: 'purple',
    description: 'تم إرسال المحتوى للعميل، في انتظار موافقته'
  },
  completed: {
    label: 'مكتمل',
    color: 'green',
    description: 'تم إنجاز المشروع بنجاح'
  },
  rejected: {
    label: 'مرفوض من الإدارة',
    color: 'red',
    description: 'تم رفض الطلب من قبل الإدارة'
  }
}

// دالة للحصول على تسمية الحالة حسب دور المستخدم
export function getStatusLabel(
  status: RequestStatus,
  userRole: 'client' | 'admin' | 'public' = 'public'
): { label: string; color: string; description: string } {
  switch (userRole) {
    case 'client':
      return CLIENT_STATUS_LABELS[status]
    case 'admin':
      return ADMIN_STATUS_LABELS[status]
    default:
      // للمستخدمين العامين أو غير المحددين، استخدم تسميات محايدة
      return CLIENT_STATUS_LABELS[status]
  }
}

// دوال مساعدة لحالات محددة
export function isActionRequiredForAdmin(status: RequestStatus): boolean {
  return ['pending', 'negotiation', 'payment_review'].includes(status)
}

export function isActionRequiredForClient(status: RequestStatus): boolean {
  return ['quoted', 'content_review'].includes(status)
}

export function isWaitingStatus(status: RequestStatus): boolean {
  return ['quoted', 'approved', 'payment_review', 'in_progress', 'content_review'].includes(status)
}

export function isFinalStatus(status: RequestStatus): boolean {
  return ['completed', 'rejected', 'client_rejected'].includes(status)
}

// أولويات المهام للإدارة
export function getAdminPriority(status: RequestStatus): 'high' | 'medium' | 'low' | 'none' {
  switch (status) {
    case 'pending':
    case 'negotiation':
      return 'high'
    case 'payment_review':
      return 'medium'
    case 'in_progress':
      return 'low'
    default:
      return 'none'
  }
}
// منطق تحديد الإجراءات المتاحة للإدارة حسب حالة الطلب
import { RequestStatus } from './constants'

export interface AdminActionConfig {
  showStatusUpdate: boolean
  showAdminNotes: boolean
  showQuickActions: boolean
  allowedActions: string[]
  message: {
    type: 'info' | 'warning' | 'success' | 'waiting'
    text: string
    icon: string
  }
}

export function getAdminActions(status: RequestStatus): AdminActionConfig {
  switch (status) {
    case 'pending':
      return {
        showStatusUpdate: false,
        showAdminNotes: true,
        showQuickActions: true,
        allowedActions: ['send_quote', 'reject'],
        message: {
          type: 'info',
          text: 'راجع المحتوى ثم أرسل العرض للعميل، أو ارفض الطلب',
          icon: '📋'
        }
      }

    case 'quoted':
      return {
        showStatusUpdate: false,
        showAdminNotes: false,
        showQuickActions: false,
        allowedActions: [],
        message: {
          type: 'waiting',
          text: 'تم إرسال العرض للعميل، في انتظار رده (موافقة، رفض، أو تفاوض)',
          icon: '⏳'
        }
      }

    case 'negotiation':
      return {
        showStatusUpdate: false,
        showAdminNotes: true,
        showQuickActions: true,
        allowedActions: ['respond_negotiation'],
        message: {
          type: 'warning',
          text: 'العميل طلب التفاوض على السعر - يحتاج للرد العاجل',
          icon: '💬'
        }
      }

    case 'approved':
      return {
        showStatusUpdate: false,
        showAdminNotes: false,
        showQuickActions: false,
        allowedActions: [],
        message: {
          type: 'success',
          text: 'وافق العميل على العرض، في انتظار إتمام عملية الدفع',
          icon: '✅'
        }
      }

    case 'payment_review':
      return {
        showStatusUpdate: true,
        showAdminNotes: true,
        showQuickActions: true,
        allowedActions: ['confirm_payment'],
        message: {
          type: 'warning',
          text: 'رفع العميل إيصال دفع، يحتاج تحقق وتأكيد من الإدارة',
          icon: '💳'
        }
      }

    case 'paid':
      return {
        showStatusUpdate: true,
        showAdminNotes: true,
        showQuickActions: true,
        allowedActions: ['start_work'],
        message: {
          type: 'success',
          text: 'تم تأكيد الدفع، يمكن بدء تنفيذ المشروع',
          icon: '💰'
        }
      }

    case 'in_progress':
      return {
        showStatusUpdate: true,
        showAdminNotes: true,
        showQuickActions: true,
        allowedActions: ['send_content'],
        message: {
          type: 'info',
          text: 'جاري تنفيذ المشروع - أرسل المحتوى للعميل عند الانتهاء',
          icon: '⚡'
        }
      }

    case 'content_review':
      return {
        showStatusUpdate: false,
        showAdminNotes: false,
        showQuickActions: false,
        allowedActions: [],
        message: {
          type: 'waiting',
          text: 'تم إرسال المحتوى للعميل، في انتظار مراجعته وموافقته',
          icon: '👁️'
        }
      }

    case 'completed':
      return {
        showStatusUpdate: false,
        showAdminNotes: true,
        showQuickActions: false,
        allowedActions: [],
        message: {
          type: 'success',
          text: 'تم إنجاز المشروع بنجاح',
          icon: '🎉'
        }
      }

    case 'rejected':
    case 'client_rejected':
      return {
        showStatusUpdate: false,
        showAdminNotes: true,
        showQuickActions: false,
        allowedActions: [],
        message: {
          type: 'info',
          text: 'طلب مرفوض - لا توجد إجراءات مطلوبة',
          icon: '❌'
        }
      }

    default:
      return {
        showStatusUpdate: true,
        showAdminNotes: true,
        showQuickActions: false,
        allowedActions: [],
        message: {
          type: 'info',
          text: 'حالة غير معروفة',
          icon: '❓'
        }
      }
  }
}

// دالة لتحديد ما إذا كانت الحالة تحتاج إجراء من الإدارة
export function requiresAdminAction(status: RequestStatus): boolean {
  const actionsNeeded = [
    'pending',           // إرسال عرض سعر
    'negotiation',       // رد على التفاوض
    'payment_review',    // تحقق من الدفع
    'in_progress'        // إرسال المحتوى
  ]
  return actionsNeeded.includes(status)
}

// دالة لتحديد ما إذا كانت الحالة في انتظار العميل
export function waitingForClient(status: RequestStatus): boolean {
  const clientActions = [
    'quoted',           // موافقة على العرض
    'approved',         // دفع المبلغ
    'content_review'    // مراجعة المحتوى
  ]
  return clientActions.includes(status)
}

// دالة لتحديد ما إذا كانت الحالة نهائية
export function isFinalStatus(status: RequestStatus): boolean {
  return ['completed', 'rejected', 'client_rejected'].includes(status)
}

// ألوان الرسائل حسب النوع
export const messageColors = {
  info: 'bg-blue-50 border-blue-200 text-blue-700',
  warning: 'bg-orange-50 border-orange-200 text-orange-700',
  success: 'bg-green-50 border-green-200 text-green-700',
  waiting: 'bg-gray-50 border-gray-200 text-gray-700'
}
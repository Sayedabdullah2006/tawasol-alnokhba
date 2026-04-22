// نظام التذكيرات اليومية للعملاء
// يرسل تذكيرات مهذبة للطلبات التي تحتاج إجراء من العميل

import { createServiceRoleClient } from './supabase-server'
import { sendEnhancedEmail, htmlToText } from './email-deliverability'
import { generateRequestNumber } from './utils'
import { waitingForClient } from './admin-actions'
import type { RequestStatus } from './constants'

// إعدادات التذكيرات
const REMINDER_SETTINGS = {
  // متى نبدأ إرسال التذكيرات (بالأيام)
  startAfterDays: {
    'quoted': 2,           // تذكير بالعرض بعد يومين
    'approved': 1,         // تذكير بالدفع بعد يوم واحد
    'content_review': 3    // تذكير بمراجعة المحتوى بعد 3 أيام
  },

  // كم مرة نرسل التذكير (الحد الأقصى)
  maxReminders: {
    'quoted': 5,           // حتى 5 تذكيرات للعرض
    'approved': 7,         // حتى 7 تذكيرات للدفع
    'content_review': 4    // حتى 4 تذكيرات لمراجعة المحتوى
  },

  // الفترة بين التذكيرات (بالأيام)
  intervalDays: {
    'quoted': 3,           // تذكير كل 3 أيام
    'approved': 2,         // تذكير كل يومين
    'content_review': 4    // تذكير كل 4 أيام
  }
}

interface ReminderData {
  requestId: string
  requestNumber: string
  clientName: string
  clientEmail: string
  status: RequestStatus
  createdAt: string
  lastStatusChange: string
  reminderCount: number
  adminQuotedPrice?: number
  finalTotal?: number
  proposedContent?: string
  proposedImages?: string[]
}

// قوالب الرسائل المهذبة لكل حالة
export function getQuoteApprovalReminder(data: ReminderData, reminderNum: number): {
  subject: string
  html: string
} {
  const price = data.finalTotal || data.adminQuotedPrice || 0
  const daysSince = Math.floor((Date.now() - new Date(data.lastStatusChange).getTime()) / (1000 * 60 * 60 * 24))

  // رسائل متدرجة في الإلحاح
  const messages = [
    {
      title: 'عرضك المخصص جاهز 💰',
      emoji: '✨',
      tone: 'ودود ومتفائل',
      content: `
        <p style="font-size:15px; line-height:1.8; margin-bottom:16px;">
          نأمل أن تكون في أحسن حال!
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          أردنا تذكيرك بلطف أن عرضك المخصص لطلب <strong>${data.requestNumber}</strong>
          جاهز ومنتظر موافقتك منذ ${daysSince} أيام.
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:20px;">
          نحن متحمسون لبدء العمل على مشروعك الرائع! 🚀
        </p>
      `
    },
    {
      title: 'لا تفوت الفرصة! عرضك بانتظارك 💫',
      emoji: '⏰',
      tone: 'تشجيعي ولكن مؤكد',
      content: `
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          نتفهم انشغالك، ولكن لا نريدك أن تفوت هذه الفرصة الرائعة!
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          عرضك المخصص بقيمة <strong style="color:#C9A961;">${price.toLocaleString('ar')} ر.س</strong>
          لا يزال ساري المفعول ومنتظر قرارك.
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:20px;">
          فريقنا جاهز للبدء فور موافقتك! ✨
        </p>
      `
    },
    {
      title: 'هل تحتاج مساعدة في قرارك؟ 🤝',
      emoji: '💬',
      tone: 'داعم ومساعد',
      content: `
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          نلاحظ أن عرضك لا يزال قيد المراجعة منذ أكثر من أسبوع.
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          إذا كانت لديك أي استفسارات أو تحتاج توضيحات إضافية حول العرض،
          فريق دعم العملاء مستعد لمساعدتك في أي وقت.
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:20px;">
          نحن هنا لنجعل تجربتك معنا مميزة! 🌟
        </p>
      `
    },
    {
      title: 'آخر تذكير بعرضك المميز 🎯',
      emoji: '⚡',
      tone: 'أخير ولكن ودود',
      content: `
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          هذا آخر تذكير ودود بخصوص عرضك المخصص.
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          نقدر وقتك ونتفهم ظروفك. إذا قررت المتابعة، سنكون سعداء لخدمتك.
          وإذا لم تعد مهتماً، فلا مشكلة على الإطلاق.
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:20px;">
          شكراً لإتاحة الفرصة لنا! 🙏
        </p>
      `
    }
  ]

  const messageIndex = Math.min(reminderNum - 1, messages.length - 1)
  const message = messages[messageIndex]

  return {
    subject: `${message.title} · ${data.requestNumber}`,
    html: `
      <div style="direction: rtl; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">

        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-size: 48px; margin-bottom: 12px;">${message.emoji}</div>
          <h2 style="margin: 0; color: #0E2855; font-size: 20px; font-weight: bold;">${message.title.replace(/[💰💫⏰🤝🎯]/g, '')}</h2>
          <p style="margin: 4px 0 0 0; color: #6B7C99; font-size: 14px;">طلب ${data.requestNumber}</p>
        </div>

        <div style="background: #F8FAFC; border-radius: 12px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0; color: #0E2855; font-size: 15px; font-weight: bold;">مرحباً ${data.clientName} 👋</p>
          ${message.content}
        </div>

        <div style="background: #E8F5E8; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
          <h3 style="margin: 0 0 12px 0; color: #059669; font-size: 16px;">تفاصيل العرض</h3>
          <div style="color: #059669; font-size: 24px; font-weight: bold; margin-bottom: 8px;">
            ${price.toLocaleString('ar')} ر.س
          </div>
          <p style="margin: 0; color: #059669; font-size: 14px;">السعر المخصص لطلبك</p>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="https://nukhba.media/dashboard/${data.requestId}"
             style="display: inline-block; background: #C9A961; color: #FFFFFF; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 0 8px 8px 0;">
            ✅ مراجعة العرض
          </a>
          <br>
          <a href="mailto:support@nukhba.media"
             style="display: inline-block; background: #0E2855; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-size: 14px; margin-top: 8px;">
            💬 تواصل معنا
          </a>
        </div>

        <div style="background: #FFF8E1; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; color: #856404; font-size: 13px; line-height: 1.6;">
            💡 <strong>تذكير ودود:</strong> هذا العرض مخصص لك وحدك ولا يتطلب أي التزامات مالية مقدماً
          </p>
        </div>

      </div>
    `
  }
}

export function getPaymentReminder(data: ReminderData, reminderNum: number): {
  subject: string
  html: string
} {
  const amount = data.finalTotal || data.adminQuotedPrice || 0
  const daysSince = Math.floor((Date.now() - new Date(data.lastStatusChange).getTime()) / (1000 * 60 * 60 * 24))

  const messages = [
    {
      title: 'طلبك معتمد! آن الأوان لإتمام الدفع 💳',
      emoji: '🎉',
      tone: 'احتفالي ومتحمس',
      content: `
        <p style="font-size:15px; line-height:1.8; margin-bottom:16px;">
          مبروك! تم اعتماد طلبك وفريقنا جاهز للانطلاق! 🚀
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          لبدء تنفيذ مشروعك الرائع، نحتاج فقط إتمام عملية الدفع
          للمبلغ المتفق عليه.
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:20px;">
          العملية بسيطة وآمنة تماماً! ✨
        </p>
      `
    },
    {
      title: 'نحن منتظرون! إتمم دفعتك الآن 💫',
      emoji: '⏰',
      tone: 'تشجيعي ومحفز',
      content: `
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          فريقنا متحمس لبدء العمل على مشروعك منذ ${daysSince} أيام!
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          إتمام الدفع سيضعك في مقدمة قائمة التنفيذ،
          وستحصل على مشروعك في أسرع وقت ممكن.
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:20px;">
          لا تدع الفرصة تفوتك! 🎯
        </p>
      `
    },
    {
      title: 'هل تحتاج مساعدة في الدفع؟ نحن هنا! 🤝',
      emoji: '💬',
      tone: 'داعم ومساعد',
      content: `
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          نلاحظ أنك لم تتمكن من إتمام الدفع بعد.
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          إذا واجهت أي مشكلة تقنية أو تحتاج مساعدة في عملية التحويل،
          فريق دعم العملاء جاهز لمساعدتك خطوة بخطوة.
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:20px;">
          نحن نقدر ثقتك وسنجعل العملية سهلة عليك! 🌟
        </p>
      `
    },
    {
      title: 'آخر فرصة لحجز مكانك! ⚡',
      emoji: '🚨',
      tone: 'عاجل ولكن ودود',
      content: `
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          هذا آخر تذكير بخصوص إتمام دفع طلبك المعتمد.
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          بعد اليوم، قد نحتاج لإعادة جدولة طلبك أو إعادة تقييم الأولوية.
          إذا كنت لا تزال مهتماً، يرجى إتمام الدفع في أقرب وقت.
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:20px;">
          نتطلع لخدمتك! 🙏
        </p>
      `
    }
  ]

  const messageIndex = Math.min(reminderNum - 1, messages.length - 1)
  const message = messages[messageIndex]

  return {
    subject: `${message.title} · ${data.requestNumber}`,
    html: `
      <div style="direction: rtl; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">

        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-size: 48px; margin-bottom: 12px;">${message.emoji}</div>
          <h2 style="margin: 0; color: #0E2855; font-size: 20px; font-weight: bold;">${message.title.replace(/[💳💫⏰🤝⚡🚨]/g, '')}</h2>
          <p style="margin: 4px 0 0 0; color: #6B7C99; font-size: 14px;">طلب ${data.requestNumber}</p>
        </div>

        <div style="background: #F8FAFC; border-radius: 12px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0; color: #0E2855; font-size: 15px; font-weight: bold;">أهلاً ${data.clientName} 👋</p>
          ${message.content}
        </div>

        <div style="background: #C9A961; color: white; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
          <h3 style="margin: 0 0 12px 0; color: white; font-size: 16px;">المبلغ المطلوب</h3>
          <div style="color: white; font-size: 28px; font-weight: bold; margin-bottom: 8px;">
            ${amount.toLocaleString('ar')} ر.س
          </div>
          <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 14px;">السعر النهائي شامل كافة الخدمات</p>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="https://nukhba.media/dashboard/${data.requestId}"
             style="display: inline-block; background: #059669; color: #FFFFFF; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 0 8px 8px 0;">
            💳 إتمام الدفع
          </a>
          <br>
          <a href="mailto:support@nukhba.media"
             style="display: inline-block; background: #6B7C99; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-size: 14px; margin-top: 8px;">
            🆘 مساعدة في الدفع
          </a>
        </div>

        <div style="background: #E3F2FD; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; color: #1976D2; font-size: 13px; line-height: 1.6;">
            🔒 <strong>دفع آمن ومضمون:</strong> جميع المعاملات محمية بأعلى معايير الأمان
          </p>
        </div>

      </div>
    `
  }
}

export function getContentReviewReminder(data: ReminderData, reminderNum: number): {
  subject: string
  html: string
} {
  const daysSince = Math.floor((Date.now() - new Date(data.lastStatusChange).getTime()) / (1000 * 60 * 60 * 24))
  const hasImages = data.proposedImages && data.proposedImages.length > 0

  const messages = [
    {
      title: 'محتواك جاهز للمراجعة! 👁️',
      emoji: '🎨',
      tone: 'متحمس ومبدع',
      content: `
        <p style="font-size:15px; line-height:1.8; margin-bottom:16px;">
          أخبار رائعة! فريقنا الإبداعي انتهى من تحضير محتواك المميز! 🎉
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          المحتوى جاهز لمراجعتك والموافقة عليه أو طلب أي تعديلات تريدها.
          نريد التأكد من أن كل شيء يلبي توقعاتك تماماً!
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:20px;">
          نحن فخورون بالنتيجة ومتحمسون لرأيك! ✨
        </p>
      `
    },
    {
      title: 'في انتظار مراجعتك للمحتوى المميز 🌟',
      emoji: '⏰',
      tone: 'تذكير ودود',
      content: `
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          مرت ${daysSince} أيام على تسليم المحتوى المقترح.
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          نتفهم انشغالك، ولكن مراجعتك مهمة جداً لنا لضمان جودة العمل النهائي.
          ${hasImages ? 'قم بمراجعة النصوص والتصاميم المرفقة.' : 'قم بمراجعة النصوص المقترحة.'}
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:20px;">
          رأيك يهمنا وسيجعل المحتوى أفضل! 💫
        </p>
      `
    },
    {
      title: 'هل المحتوى يحتاج تعديل؟ أخبرنا! 🛠️',
      emoji: '💬',
      tone: 'داعم ومرن',
      content: `
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          نحن في انتظار ملاحظاتك على المحتوى المقترح منذ أكثر من أسبوع.
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          إذا كان المحتوى يحتاج تعديلات، فلا تتردد في إخبارنا!
          نحن مرنون ونريد أن نصل معاً للنتيجة المثالية.
          وإذا كان كل شيء جيد، فقط اضغط موافق!
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:20px;">
          هدفنا رضاك التام عن المحتوى! 🎯
        </p>
      `
    },
    {
      title: 'آخر فرصة لمراجعة محتواك ⚡',
      emoji: '📋',
      tone: 'أخير ولكن ودود',
      content: `
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          هذا آخر تذكير بخصوص مراجعة المحتوى المقترح لطلبك.
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:16px;">
          إذا لم نحصل على ردك خلال الأيام القادمة، سنعتبر أنك موافق على المحتوى كما هو
          وسنبدأ عملية النشر النهائية.
        </p>
        <p style="font-size:14px; line-height:1.8; margin-bottom:20px;">
          نقدر وقتك ونتطلع لإنجاز مشروعك! 🚀
        </p>
      `
    }
  ]

  const messageIndex = Math.min(reminderNum - 1, messages.length - 1)
  const message = messages[messageIndex]

  return {
    subject: `${message.title} · ${data.requestNumber}`,
    html: `
      <div style="direction: rtl; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">

        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-size: 48px; margin-bottom: 12px;">${message.emoji}</div>
          <h2 style="margin: 0; color: #0E2855; font-size: 20px; font-weight: bold;">${message.title.replace(/[👁️🌟⏰🛠️💬📋⚡]/g, '')}</h2>
          <p style="margin: 4px 0 0 0; color: #6B7C99; font-size: 14px;">طلب ${data.requestNumber}</p>
        </div>

        <div style="background: #F8FAFC; border-radius: 12px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0; color: #0E2855; font-size: 15px; font-weight: bold;">أهلاً ${data.clientName} 👋</p>
          ${message.content}
        </div>

        ${data.proposedContent ? `
          <div style="background: #E8F5E8; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <h3 style="margin: 0 0 12px 0; color: #059669; font-size: 16px;">نظرة سريعة على المحتوى</h3>
            <div style="background: white; border-radius: 8px; padding: 16px; border-right: 4px solid #059669;">
              <p style="margin: 0; color: #0E2855; font-size: 14px; line-height: 1.6; white-space: pre-line;">
                ${data.proposedContent.substring(0, 200)}${data.proposedContent.length > 200 ? '...' : ''}
              </p>
            </div>
          </div>
        ` : ''}

        <div style="text-align: center; margin: 32px 0;">
          <a href="https://nukhba.media/dashboard/${data.requestId}"
             style="display: inline-block; background: #059669; color: #FFFFFF; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 0 8px 8px 0;">
            👁️ مراجعة المحتوى
          </a>
          <br>
          <a href="https://nukhba.media/dashboard/${data.requestId}"
             style="display: inline-block; background: #C9A961; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-size: 14px; margin: 4px 8px;">
            ✅ موافق على المحتوى
          </a>
          <a href="https://nukhba.media/dashboard/${data.requestId}"
             style="display: inline-block; background: #0E2855; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-size: 14px; margin: 4px 8px;">
            ✏️ طلب تعديلات
          </a>
        </div>

        <div style="background: #FFF3CD; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; color: #856404; font-size: 13px; line-height: 1.6;">
            ⚡ <strong>مراجعة سريعة:</strong> المراجعة تستغرق دقائق قليلة وستسرّع من عملية النشر
          </p>
        </div>

      </div>
    `
  }
}

// دالة لإنشاء البيانات المطلوبة للتذكيرات
export async function getReminderData(requestId: string): Promise<ReminderData | null> {
  try {
    const supabase = await createServiceRoleClient()

    const { data: request, error } = await supabase
      .from('publish_requests')
      .select(`
        id,
        request_number,
        client_name,
        client_email,
        status,
        created_at,
        last_status_change,
        admin_quoted_price,
        final_total,
        proposed_content,
        proposed_images
      `)
      .eq('id', requestId)
      .single()

    if (error || !request) {
      console.error('[REMINDERS] Error fetching request data:', error)
      return null
    }

    // احصل على عدد التذكيرات السابقة
    const { data: reminderLogs } = await supabase
      .from('email_reminder_logs')
      .select('id')
      .eq('request_id', requestId)
      .eq('reminder_type', request.status)

    return {
      requestId: request.id,
      requestNumber: generateRequestNumber(request.request_number),
      clientName: request.client_name,
      clientEmail: request.client_email,
      status: request.status,
      createdAt: request.created_at,
      lastStatusChange: request.last_status_change || request.created_at,
      reminderCount: reminderLogs?.length || 0,
      adminQuotedPrice: request.admin_quoted_price,
      finalTotal: request.final_total,
      proposedContent: request.proposed_content,
      proposedImages: request.proposed_images
    }

  } catch (error) {
    console.error('[REMINDERS] Exception in getReminderData:', error)
    return null
  }
}

// دالة للتحقق من إمكانية إرسال تذكير
export function shouldSendReminder(data: ReminderData): boolean {
  const settings = REMINDER_SETTINGS
  const status = data.status as keyof typeof settings.startAfterDays

  // تحقق من أن الحالة تحتاج تذكير
  if (!waitingForClient(status)) {
    return false
  }

  // تحقق من الحد الأقصى للتذكيرات
  if (data.reminderCount >= settings.maxReminders[status]) {
    return false
  }

  // تحقق من الفترة الزمنية منذ آخر تغيير حالة
  const daysSinceChange = Math.floor(
    (Date.now() - new Date(data.lastStatusChange).getTime()) / (1000 * 60 * 60 * 24)
  )

  // للتذكير الأول، انتظر startAfterDays
  if (data.reminderCount === 0) {
    return daysSinceChange >= settings.startAfterDays[status]
  }

  // للتذكيرات التالية، انتظر intervalDays
  return daysSinceChange >= (
    settings.startAfterDays[status] +
    (data.reminderCount * settings.intervalDays[status])
  )
}

// دالة إرسال التذكير
export async function sendReminder(data: ReminderData): Promise<boolean> {
  try {
    const reminderNumber = data.reminderCount + 1
    let reminderContent: { subject: string; html: string }

    // اختر النوع المناسب من التذكير حسب الحالة
    switch (data.status) {
      case 'quoted':
        reminderContent = getQuoteApprovalReminder(data, reminderNumber)
        break
      case 'approved':
        reminderContent = getPaymentReminder(data, reminderNumber)
        break
      case 'content_review':
        reminderContent = getContentReviewReminder(data, reminderNumber)
        break
      default:
        console.log(`[REMINDERS] No reminder template for status: ${data.status}`)
        return false
    }

    // إرسال البريد الإلكتروني مع نسخة للإدارة
    const emailSent = await sendEnhancedEmail({
      to: data.clientEmail,
      subject: reminderContent.subject,
      html: reminderContent.html,
      text: htmlToText(reminderContent.html),
      cc: 'first1saudi@gmail.com', // نسخة للإدارة لجميع التذكيرات
      options: {
        category: 'notification',
        priority: 'normal',
        trackOpens: true,
        trackClicks: true
      }
    })

    if (emailSent) {
      // سجل إرسال التذكير
      await logReminderSent(data, reminderNumber)
      console.log(`[REMINDERS] ✅ Reminder ${reminderNumber} sent successfully to ${data.clientEmail} for ${data.requestNumber}`)
    } else {
      console.error(`[REMINDERS] ❌ Failed to send reminder ${reminderNumber} to ${data.clientEmail} for ${data.requestNumber}`)
    }

    return emailSent

  } catch (error) {
    console.error('[REMINDERS] Exception in sendReminder:', error)
    return false
  }
}

// دالة لتسجيل إرسال التذكير
async function logReminderSent(data: ReminderData, reminderNumber: number): Promise<void> {
  try {
    const supabase = await createServiceRoleClient()

    await supabase.from('email_reminder_logs').insert({
      request_id: data.requestId,
      client_email: data.clientEmail,
      reminder_type: data.status,
      reminder_number: reminderNumber,
      sent_at: new Date().toISOString(),
      email_subject: `تذكير ${reminderNumber} - ${data.requestNumber}`
    })

  } catch (error) {
    console.error('[REMINDERS] Error logging reminder:', error)
  }
}
// Supabase Edge Function: daily-reminders
// Job يومية لإرسال تذكيرات مهذبة للعملاء بالطلبات المطلوب اتخاذ إجراء عليها
//
// Deploy:
//   npx supabase functions deploy daily-reminders --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// استيراد منطق التذكيرات
interface ReminderData {
  requestId: string
  requestNumber: string
  clientName: string
  clientEmail: string
  status: string
  createdAt: string
  lastStatusChange: string
  reminderCount: number
  adminQuotedPrice?: number
  finalTotal?: number
  proposedContent?: string
  proposedImages?: string[]
}

// إعدادات التذكيرات (نسخة من الملف الأصلي)
const REMINDER_SETTINGS = {
  startAfterDays: {
    'quoted': 2,           // تذكير بالعرض بعد يومين
    'approved': 1,         // تذكير بالدفع بعد يوم واحد
    'content_review': 3    // تذكير بمراجعة المحتوى بعد 3 أيام
  },
  maxReminders: {
    'quoted': 5,           // حتى 5 تذكيرات للعرض
    'approved': 7,         // حتى 7 تذكيرات للدفع
    'content_review': 4    // حتى 4 تذكيرات لمراجعة المحتوى
  },
  intervalDays: {
    'quoted': 3,           // تذكير كل 3 أيام
    'approved': 2,         // تذكير كل يومين
    'content_review': 4    // تذكير كل 4 أيام
  }
}

// دالة للتحقق من إمكانية إرسال تذكير
function shouldSendReminder(data: ReminderData): boolean {
  const status = data.status as keyof typeof REMINDER_SETTINGS.startAfterDays

  // تحقق من أن الحالة تحتاج تذكير
  const clientWaitingStatuses = ['quoted', 'approved', 'content_review']
  if (!clientWaitingStatuses.includes(status)) {
    return false
  }

  // تحقق من الحد الأقصى للتذكيرات
  if (data.reminderCount >= REMINDER_SETTINGS.maxReminders[status]) {
    return false
  }

  // تحقق من الفترة الزمنية منذ آخر تغيير حالة
  const daysSinceChange = Math.floor(
    (Date.now() - new Date(data.lastStatusChange).getTime()) / (1000 * 60 * 60 * 24)
  )

  // للتذكير الأول، انتظر startAfterDays
  if (data.reminderCount === 0) {
    return daysSinceChange >= REMINDER_SETTINGS.startAfterDays[status]
  }

  // للتذكيرات التالية، انتظر intervalDays
  return daysSinceChange >= (
    REMINDER_SETTINGS.startAfterDays[status] +
    (data.reminderCount * REMINDER_SETTINGS.intervalDays[status])
  )
}

// دالة لإنشاء رقم الطلب
function generateRequestNumber(num: number): string {
  return `ATH-${num.toString().padStart(4, '0')}`
}

Deno.serve(async (req) => {
  console.log('=== Daily Reminders Job Started ===')
  console.log('Time:', new Date().toISOString())

  try {
    // إنشاء عميل Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. العثور على الطلبات التي تحتاج تذكيرات
    const { data: requests, error: requestsError } = await supabase
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
      .in('status', ['quoted', 'approved', 'content_review'])
      .not('client_email', 'is', null)

    if (requestsError) {
      console.error('Error fetching requests:', requestsError)
      return new Response(JSON.stringify({ error: 'Failed to fetch requests' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!requests || requests.length === 0) {
      console.log('No requests found that need reminders')
      return new Response(JSON.stringify({
        success: true,
        message: 'No requests found that need reminders',
        processed: 0,
        sent: 0
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`Found ${requests.length} requests to check for reminders`)

    let processedCount = 0
    let sentCount = 0
    const results: any[] = []

    // 2. التحقق من كل طلب وإرسال التذكيرات
    for (const request of requests) {
      try {
        processedCount++

        // احصل على عدد التذكيرات السابقة
        const { data: reminderLogs } = await supabase
          .from('email_reminder_logs')
          .select('id')
          .eq('request_id', request.id)
          .eq('reminder_type', request.status)

        const reminderData: ReminderData = {
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

        // تحقق من إمكانية إرسال تذكير
        if (!shouldSendReminder(reminderData)) {
          console.log(`Skipping reminder for ${reminderData.requestNumber}: conditions not met`)
          results.push({
            requestId: request.id,
            requestNumber: reminderData.requestNumber,
            status: request.status,
            action: 'skipped',
            reason: 'conditions_not_met',
            reminderCount: reminderData.reminderCount
          })
          continue
        }

        // إرسال التذكير عبر استدعاء دالة إرسال الإيميل المحسنة
        const reminderNumber = reminderData.reminderCount + 1

        // إنشاء محتوى التذكير حسب النوع
        let subject: string
        let htmlContent: string

        if (request.status === 'quoted') {
          const price = request.final_total || request.admin_quoted_price || 0
          subject = `عرضك المخصص جاهز ومنتظر موافقتك 💰 · ${reminderData.requestNumber}`
          htmlContent = createQuoteReminderHTML(reminderData, reminderNumber, price)
        } else if (request.status === 'approved') {
          const amount = request.final_total || request.admin_quoted_price || 0
          subject = `طلبك معتمد! آن الأوان لإتمام الدفع 💳 · ${reminderData.requestNumber}`
          htmlContent = createPaymentReminderHTML(reminderData, reminderNumber, amount)
        } else if (request.status === 'content_review') {
          subject = `محتواك جاهز للمراجعة! 👁️ · ${reminderData.requestNumber}`
          htmlContent = createContentReminderHTML(reminderData, reminderNumber)
        } else {
          console.log(`Unknown status for reminder: ${request.status}`)
          continue
        }

        // إرسال البريد الإلكتروني باستخدام دالة الإرسال المحسنة مع CC للإدارة
        const emailResponse = await supabase.functions.invoke('send-enhanced-email', {
          body: {
            to: request.client_email,
            subject: subject,
            html: htmlContent,
            cc: 'first1saudi@gmail.com', // نسخة للإدارة
            options: {
              category: 'notification',
              priority: 'normal',
              trackOpens: true,
              trackClicks: true
            }
          }
        })

        if (emailResponse.error || !emailResponse.data?.ok) {
          console.error(`Failed to send reminder to ${request.client_email}:`, emailResponse.error)
          results.push({
            requestId: request.id,
            requestNumber: reminderData.requestNumber,
            status: request.status,
            action: 'failed',
            reason: 'email_send_failed',
            error: emailResponse.error?.message
          })
          continue
        }

        // تسجيل إرسال التذكير
        const { error: logError } = await supabase
          .from('email_reminder_logs')
          .insert({
            request_id: request.id,
            client_email: request.client_email,
            reminder_type: request.status,
            reminder_number: reminderNumber,
            sent_at: new Date().toISOString(),
            email_subject: subject
          })

        if (logError) {
          console.error('Failed to log reminder:', logError)
        }

        sentCount++
        console.log(`✅ Sent reminder ${reminderNumber} to ${request.client_email} for ${reminderData.requestNumber}`)

        results.push({
          requestId: request.id,
          requestNumber: reminderData.requestNumber,
          status: request.status,
          action: 'sent',
          reminderNumber: reminderNumber,
          emailSent: true
        })

      } catch (error) {
        console.error(`Error processing request ${request.id}:`, error)
        results.push({
          requestId: request.id,
          requestNumber: generateRequestNumber(request.request_number),
          status: request.status,
          action: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    console.log(`=== Daily Reminders Job Completed ===`)
    console.log(`Processed: ${processedCount}, Sent: ${sentCount}`)

    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      processed: processedCount,
      sent: sentCount,
      results: results
    }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Daily reminders job error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

// دوال إنشاء محتوى HTML للتذكيرات
function createQuoteReminderHTML(data: ReminderData, reminderNum: number, price: number): string {
  const daysSince = Math.floor((Date.now() - new Date(data.lastStatusChange).getTime()) / (1000 * 60 * 60 * 24))

  const messages = [
    { emoji: '✨', title: 'عرضك المخصص جاهز', content: `نأمل أن تكون في أحسن حال! أردنا تذكيرك بلطف أن عرضك المخصص جاهز ومنتظر موافقتك منذ ${daysSince} أيام. نحن متحمسون لبدء العمل على مشروعك الرائع!` },
    { emoji: '⏰', title: 'لا تفوت الفرصة', content: `نتفهم انشغالك، ولكن لا نريدك أن تفوت هذه الفرصة الرائعة! عرضك المخصص لا يزال ساري المفعول ومنتظر قرارك. فريقنا جاهز للبدء فور موافقتك!` },
    { emoji: '💬', title: 'هل تحتاج مساعدة؟', content: `نلاحظ أن عرضك لا يزال قيد المراجعة منذ أكثر من أسبوع. إذا كانت لديك أي استفسارات أو تحتاج توضيحات إضافية، فريق دعم العملاء مستعد لمساعدتك.` }
  ]

  const messageIndex = Math.min(reminderNum - 1, messages.length - 1)
  const message = messages[messageIndex]

  return `
    <div style="direction: rtl; font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="font-size: 48px; margin-bottom: 12px;">${message.emoji}</div>
        <h2 style="margin: 0; color: #0E2855; font-size: 20px;">${message.title}</h2>
        <p style="margin: 4px 0 0 0; color: #6B7C99; font-size: 14px;">طلب ${data.requestNumber}</p>
      </div>

      <div style="background: #F8FAFC; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0 0 8px 0; color: #0E2855; font-size: 15px; font-weight: bold;">مرحباً ${data.clientName} 👋</p>
        <p style="font-size: 14px; line-height: 1.8; margin: 0;">${message.content}</p>
      </div>

      <div style="background: #C9A961; color: white; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
        <h3 style="margin: 0 0 12px 0; color: white;">العرض المخصص</h3>
        <div style="font-size: 24px; font-weight: bold;">${price.toLocaleString('ar')} ر.س</div>
      </div>

      <div style="text-align: center; margin: 32px 0;">
        <a href="https://nukhba.media/dashboard/${data.requestId}" style="display: inline-block; background: #059669; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold;">
          ✅ مراجعة العرض
        </a>
      </div>
    </div>
  `
}

function createPaymentReminderHTML(data: ReminderData, reminderNum: number, amount: number): string {
  const daysSince = Math.floor((Date.now() - new Date(data.lastStatusChange).getTime()) / (1000 * 60 * 60 * 24))

  const messages = [
    { emoji: '🎉', title: 'طلبك معتمد! آن الأوان للدفع', content: `مبروك! تم اعتماد طلبك وفريقنا جاهز للانطلاق! لبدء تنفيذ مشروعك الرائع، نحتاج فقط إتمام عملية الدفع للمبلغ المتفق عليه.` },
    { emoji: '⏰', title: 'نحن منتظرون!', content: `فريقنا متحمس لبدء العمل على مشروعك منذ ${daysSince} أيام! إتمام الدفع سيضعك في مقدمة قائمة التنفيذ، وستحصل على مشروعك في أسرع وقت ممكن.` },
    { emoji: '💬', title: 'هل تحتاج مساعدة في الدفع؟', content: `نلاحظ أنك لم تتمكن من إتمام الدفع بعد. إذا واجهت أي مشكلة تقنية أو تحتاج مساعدة، فريق دعم العملاء جاهز لمساعدتك خطوة بخطوة.` }
  ]

  const messageIndex = Math.min(reminderNum - 1, messages.length - 1)
  const message = messages[messageIndex]

  return `
    <div style="direction: rtl; font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="font-size: 48px; margin-bottom: 12px;">${message.emoji}</div>
        <h2 style="margin: 0; color: #0E2855; font-size: 20px;">${message.title}</h2>
        <p style="margin: 4px 0 0 0; color: #6B7C99; font-size: 14px;">طلب ${data.requestNumber}</p>
      </div>

      <div style="background: #F8FAFC; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0 0 8px 0; color: #0E2855; font-size: 15px; font-weight: bold;">أهلاً ${data.clientName} 👋</p>
        <p style="font-size: 14px; line-height: 1.8; margin: 0;">${message.content}</p>
      </div>

      <div style="background: #C9A961; color: white; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
        <h3 style="margin: 0 0 12px 0; color: white;">المبلغ المطلوب</h3>
        <div style="font-size: 28px; font-weight: bold;">${amount.toLocaleString('ar')} ر.س</div>
      </div>

      <div style="text-align: center; margin: 32px 0;">
        <a href="https://nukhba.media/dashboard/${data.requestId}" style="display: inline-block; background: #059669; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold;">
          💳 إتمام الدفع
        </a>
      </div>
    </div>
  `
}

function createContentReminderHTML(data: ReminderData, reminderNum: number): string {
  const daysSince = Math.floor((Date.now() - new Date(data.lastStatusChange).getTime()) / (1000 * 60 * 60 * 24))

  const messages = [
    { emoji: '🎨', title: 'محتواك جاهز للمراجعة', content: `أخبار رائعة! فريقنا الإبداعي انتهى من تحضير محتواك المميز! المحتوى جاهز لمراجعتك والموافقة عليه أو طلب أي تعديلات تريدها.` },
    { emoji: '⏰', title: 'في انتظار مراجعتك', content: `مرت ${daysSince} أيام على تسليم المحتوى المقترح. نتفهم انشغالك، ولكن مراجعتك مهمة جداً لنا لضمان جودة العمل النهائي.` },
    { emoji: '💬', title: 'هل المحتوى يحتاج تعديل؟', content: `نحن في انتظار ملاحظاتك على المحتوى المقترح. إذا كان يحتاج تعديلات، فلا تتردد في إخبارنا! وإذا كان كل شيء جيد، فقط اضغط موافق!` }
  ]

  const messageIndex = Math.min(reminderNum - 1, messages.length - 1)
  const message = messages[messageIndex]

  return `
    <div style="direction: rtl; font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="font-size: 48px; margin-bottom: 12px;">${message.emoji}</div>
        <h2 style="margin: 0; color: #0E2855; font-size: 20px;">${message.title}</h2>
        <p style="margin: 4px 0 0 0; color: #6B7C99; font-size: 14px;">طلب ${data.requestNumber}</p>
      </div>

      <div style="background: #F8FAFC; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <p style="margin: 0 0 8px 0; color: #0E2855; font-size: 15px; font-weight: bold;">أهلاً ${data.clientName} 👋</p>
        <p style="font-size: 14px; line-height: 1.8; margin: 0;">${message.content}</p>
      </div>

      <div style="text-align: center; margin: 32px 0;">
        <a href="https://nukhba.media/dashboard/${data.requestId}" style="display: inline-block; background: #059669; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold;">
          👁️ مراجعة المحتوى
        </a>
      </div>
    </div>
  `
}
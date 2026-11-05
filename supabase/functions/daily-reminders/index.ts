// Supabase Edge Function: daily-reminders
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

const REMINDER_SETTINGS = {
  startAfterDays: { 'quoted': 2, 'approved': 1, 'content_review': 3 },
  maxReminders:   { 'quoted': 5, 'approved': 7, 'content_review': 4 },
  intervalDays:   { 'quoted': 3, 'approved': 2, 'content_review': 4 }
}

function shouldSendReminder(data: ReminderData): boolean {
  const status = data.status as keyof typeof REMINDER_SETTINGS.startAfterDays
  if (!['quoted', 'approved', 'content_review'].includes(status)) return false
  if (data.reminderCount >= REMINDER_SETTINGS.maxReminders[status]) return false
  const daysSinceChange = Math.floor((Date.now() - new Date(data.lastStatusChange).getTime()) / (1000 * 60 * 60 * 24))
  if (data.reminderCount === 0) return daysSinceChange >= REMINDER_SETTINGS.startAfterDays[status]
  return daysSinceChange >= (REMINDER_SETTINGS.startAfterDays[status] + (data.reminderCount * REMINDER_SETTINGS.intervalDays[status]))
}

function generateRequestNumber(num: number): string {
  return `ATH-${num.toString().padStart(4, '0')}`
}

Deno.serve(async (req) => {
  console.log('=== Daily Reminders Job Started ===')
  console.log('Time:', new Date().toISOString())

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase environment variables')
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 0. إغلاق الطلبات المتوقفة لأكثر من 7 أيام
    // pending  → يُحسب من created_at (الطلب منتظر منذ الإنشاء)
    // quoted   → يُحسب من last_status_change (العميل منتظر منذ وصول العرض)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: stalePending } = await supabase
      .from('publish_requests')
      .select('id, request_number, client_name, client_email')
      .eq('status', 'pending')
      .lt('created_at', sevenDaysAgo)
      .not('client_email', 'is', null)

    const { data: staleQuoted } = await supabase
      .from('publish_requests')
      .select('id, request_number, client_name, client_email')
      .eq('status', 'quoted')
      .lt('last_status_change', sevenDaysAgo)
      .not('client_email', 'is', null)

    const staleRequests = [...(stalePending ?? []), ...(staleQuoted ?? [])]

    if (staleRequests.length > 0) {
      console.log(`[AUTO-CLOSE] Found ${staleRequests.length} stale requests (pending: ${stalePending?.length ?? 0}, quoted: ${staleQuoted?.length ?? 0})`)

      for (const req of staleRequests) {
        try {
          const { error: updateError } = await supabase
            .from('publish_requests')
            .update({ status: 'auto_closed', updated_at: new Date().toISOString() })
            .eq('id', req.id)
            .in('status', ['pending', 'quoted'])

          if (updateError) { console.error(`[AUTO-CLOSE] Failed to close ${req.id}:`, updateError); continue }

          const requestNumber = generateRequestNumber(req.request_number)
          const emailResponse = await supabase.functions.invoke('send-enhanced-email', {
            body: {
              to: req.client_email,
              requestId:req.id,
              notificationKey:`auto-closed:${req.id}`,
              subject: `📋 تم إغلاق طلبك تلقائياً · ${requestNumber}`,
              html: createAutoClosedHTML(req.client_name, requestNumber),
              cc: 'first1saudi@gmail.com',
              options: { category: 'notification', priority: 'normal' }
            }
          })

          if (emailResponse.error || !emailResponse.data?.ok) {
            console.error(`[AUTO-CLOSE] Email failed for ${req.client_email}:`, emailResponse.error)
          } else {
            console.log(`[AUTO-CLOSE] ✅ Closed & notified: ${requestNumber} → ${req.client_email}`)
          }
        } catch (err) {
          console.error(`[AUTO-CLOSE] Error processing ${req.id}:`, err)
        }
      }
    } else {
      console.log('[AUTO-CLOSE] No stale requests found')
    }

    // 1. التذكيرات
    const { data: requests, error: requestsError } = await supabase
      .from('publish_requests')
      .select('id, request_number, client_name, client_email, status, created_at, last_status_change, admin_quoted_price, final_total, proposed_content, proposed_images')
      .in('status', ['quoted', 'approved', 'content_review'])
      .not('client_email', 'is', null)

    if (requestsError) {
      console.error('Error fetching requests:', requestsError)
      return new Response(JSON.stringify({ error: 'Failed to fetch requests' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    if (!requests || requests.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No requests need reminders', processed: 0, sent: 0 }), { headers: { 'Content-Type': 'application/json' } })
    }

    let processedCount = 0, sentCount = 0
    const results: any[] = []

    for (const request of requests) {
      try {
        processedCount++
        const { data: reminderLogs } = await supabase.from('email_reminder_logs').select('id').eq('request_id', request.id).eq('reminder_type', request.status)

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

        if (!shouldSendReminder(reminderData)) {
          results.push({ requestId: request.id, requestNumber: reminderData.requestNumber, status: request.status, action: 'skipped' })
          continue
        }

        const reminderNumber = reminderData.reminderCount + 1
        let subject = '', htmlContent = ''

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
        } else { continue }

        const emailResponse = await supabase.functions.invoke('send-enhanced-email', {
          body: { notificationKey:`reminder:${request.id}:${request.status}:${reminderNumber}`,requestId:request.id,to: request.client_email, subject, html: htmlContent, cc: 'first1saudi@gmail.com', options: { category: 'notification', priority: 'normal', trackOpens: true, trackClicks: true } }
        })

        if (emailResponse.error || !emailResponse.data?.ok) {
          results.push({ requestId: request.id, requestNumber: reminderData.requestNumber, action: 'failed', error: emailResponse.error?.message })
          continue
        }

        await supabase.from('email_reminder_logs').insert({ request_id: request.id, client_email: request.client_email, reminder_type: request.status, reminder_number: reminderNumber, sent_at: new Date().toISOString(), email_subject: subject })
        sentCount++
        results.push({ requestId: request.id, requestNumber: reminderData.requestNumber, status: request.status, action: 'sent', reminderNumber })

      } catch (error) {
        results.push({ requestId: request.id, action: 'error', error: error instanceof Error ? error.message : 'Unknown error' })
      }
    }

    console.log(`=== Done === Processed: ${processedCount}, Sent: ${sentCount}`)
    return new Response(JSON.stringify({ success: true, timestamp: new Date().toISOString(), processed: processedCount, sent: sentCount, results }), { headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Job error:', error)
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})

function createQuoteReminderHTML(data: ReminderData, reminderNum: number, price: number): string {
  const daysSince = Math.floor((Date.now() - new Date(data.lastStatusChange).getTime()) / (1000 * 60 * 60 * 24))
  const messages = [
    { emoji: '✨', title: 'عرضك المخصص جاهز', content: `عرضك منتظر موافقتك منذ ${daysSince} أيام. فريقنا جاهز للبدء فور موافقتك!` },
    { emoji: '⏰', title: 'لا تفوت الفرصة', content: `عرضك لا يزال ساري المفعول ومنتظر قرارك. فريقنا جاهز للبدء فور موافقتك!` },
    { emoji: '💬', title: 'هل تحتاج مساعدة؟', content: `إذا كانت لديك استفسارات، فريق دعم العملاء مستعد لمساعدتك.` }
  ]
  const msg = messages[Math.min(reminderNum - 1, 2)]
  return `<div style="direction:rtl;font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><div style="text-align:center;margin-bottom:24px"><div style="font-size:48px">${msg.emoji}</div><h2 style="color:#0E2855">${msg.title}</h2><p style="color:#6B7C99">طلب ${data.requestNumber}</p></div><div style="background:#F8FAFC;border-radius:12px;padding:20px;margin:20px 0"><p style="color:#0E2855;font-weight:bold">مرحباً ${data.clientName} 👋</p><p style="font-size:14px;line-height:1.8">${msg.content}</p></div><div style="background:#C9A961;color:white;border-radius:12px;padding:20px;margin:24px 0;text-align:center"><h3 style="color:white">العرض المخصص</h3><div style="font-size:24px;font-weight:bold">${price.toLocaleString('ar')} ر.س</div></div><div style="text-align:center;margin:32px 0"><a href="https://nukhba.media/dashboard/${data.requestId}" style="background:#059669;color:white;padding:16px 32px;text-decoration:none;border-radius:8px;font-weight:bold">✅ مراجعة العرض</a></div></div>`
}

function createPaymentReminderHTML(data: ReminderData, reminderNum: number, amount: number): string {
  const daysSince = Math.floor((Date.now() - new Date(data.lastStatusChange).getTime()) / (1000 * 60 * 60 * 24))
  const messages = [
    { emoji: '🎉', title: 'طلبك معتمد! آن الأوان للدفع', content: `تم اعتماد طلبك، لبدء تنفيذ مشروعك نحتاج فقط إتمام عملية الدفع.` },
    { emoji: '⏰', title: 'نحن منتظرون!', content: `فريقنا متحمس لبدء العمل منذ ${daysSince} أيام!` },
    { emoji: '💬', title: 'هل تحتاج مساعدة في الدفع؟', content: `إذا واجهت أي مشكلة، فريق دعم العملاء جاهز لمساعدتك.` }
  ]
  const msg = messages[Math.min(reminderNum - 1, 2)]
  return `<div style="direction:rtl;font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><div style="text-align:center;margin-bottom:24px"><div style="font-size:48px">${msg.emoji}</div><h2 style="color:#0E2855">${msg.title}</h2><p style="color:#6B7C99">طلب ${data.requestNumber}</p></div><div style="background:#F8FAFC;border-radius:12px;padding:20px;margin:20px 0"><p style="color:#0E2855;font-weight:bold">أهلاً ${data.clientName} 👋</p><p style="font-size:14px;line-height:1.8">${msg.content}</p></div><div style="background:#C9A961;color:white;border-radius:12px;padding:20px;margin:24px 0;text-align:center"><h3 style="color:white">المبلغ المطلوب</h3><div style="font-size:28px;font-weight:bold">${amount.toLocaleString('ar')} ر.س</div></div><div style="text-align:center;margin:32px 0"><a href="https://nukhba.media/dashboard/${data.requestId}" style="background:#059669;color:white;padding:16px 32px;text-decoration:none;border-radius:8px;font-weight:bold">💳 إتمام الدفع</a></div></div>`
}

function createAutoClosedHTML(clientName: string, requestNumber: string): string {
  return `<div style="direction:rtl;font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#fff"><div style="text-align:center;margin-bottom:24px"><div style="font-size:48px">📋</div><h2 style="color:#0E2855">تم إغلاق طلبك تلقائياً</h2><p style="color:#6B7C99">طلب ${requestNumber}</p></div><div style="background:#F8FAFC;border-radius:12px;padding:20px;margin:20px 0"><p style="color:#0E2855;font-weight:bold">مرحباً ${clientName} 👋</p><p style="font-size:14px;line-height:1.8;color:#374151">طلبك <strong>${requestNumber}</strong> كان بانتظار موافقتك لأكثر من أسبوع، لذلك أُغلق تلقائياً للحفاظ على تنظيم قائمة الطلبات.</p></div><div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:12px;padding:16px;margin:16px 0"><p style="font-size:13px;font-weight:bold;color:#92400E">📌 هل ترغب في المتابعة؟</p><p style="font-size:13px;line-height:1.8;color:#78350F">يسعدنا استقبال طلبك مجدداً — ما عليك سوى الدخول للموقع ورفع طلب جديد.</p></div><div style="text-align:center;margin:32px 0"><a href="https://nukhba.media/request" style="background:#059669;color:#fff;padding:16px 36px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px">رفع طلب جديد</a></div><p style="text-align:center;font-size:12px;color:#6B7C99">إذا كان الإغلاق خطأً — <a href="https://nukhba.media/contact" style="color:#C9A961">تواصل معنا</a></p></div>`
}

function createContentReminderHTML(data: ReminderData, reminderNum: number): string {
  const daysSince = Math.floor((Date.now() - new Date(data.lastStatusChange).getTime()) / (1000 * 60 * 60 * 24))
  const messages = [
    { emoji: '🎨', title: 'محتواك جاهز للمراجعة', content: `فريقنا انتهى من تحضير محتواك! جاهز لمراجعتك والموافقة أو طلب تعديلات.` },
    { emoji: '⏰', title: 'في انتظار مراجعتك', content: `مرت ${daysSince} أيام على تسليم المحتوى.` },
    { emoji: '💬', title: 'هل المحتوى يحتاج تعديل؟', content: `إذا كان يحتاج تعديلات فلا تتردد في إخبارنا!` }
  ]
  const msg = messages[Math.min(reminderNum - 1, 2)]
  return `<div style="direction:rtl;font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><div style="text-align:center;margin-bottom:24px"><div style="font-size:48px">${msg.emoji}</div><h2 style="color:#0E2855">${msg.title}</h2><p style="color:#6B7C99">طلب ${data.requestNumber}</p></div><div style="background:#F8FAFC;border-radius:12px;padding:20px;margin:20px 0"><p style="color:#0E2855;font-weight:bold">أهلاً ${data.clientName} 👋</p><p style="font-size:14px;line-height:1.8">${msg.content}</p></div><div style="text-align:center;margin:32px 0"><a href="https://nukhba.media/dashboard/${data.requestId}" style="background:#059669;color:white;padding:16px 32px;text-decoration:none;border-radius:8px;font-weight:bold">👁️ مراجعة المحتوى</a></div></div>`
}

// Enhanced email notification system with better error handling and logging
import { sendEmail } from './email'
import { sendEnhancedEmail, validateEmailContent, htmlToText } from './email-deliverability'

export interface EmailJob {
  to: string | string[]
  subject: string
  html: string
  text?: string
  retries?: number
  context?: string // For logging what triggered this email
  priority?: 'high' | 'normal' | 'low'
  category?: 'transactional' | 'notification' | 'marketing'
  enhanced?: boolean // Use enhanced deliverability features
}

export interface EmailResult {
  success: boolean
  error?: string
  attemptedAt: Date
}

// Queue for failed emails (in-memory for now, could be moved to database/Redis later)
const failedEmails: (EmailJob & { lastAttempt: Date; attempts: number })[] = []

// Enhanced email sending with retry logic, deliverability validation, and better logging
export async function sendEmailWithRetry(job: EmailJob): Promise<EmailResult> {
  const maxRetries = job.retries ?? 3
  const context = job.context ?? 'unknown'
  const useEnhanced = job.enhanced !== false // Default to enhanced unless explicitly disabled

  // Pre-flight validation for deliverability
  const validation = validateEmailContent(job.subject, job.html, job.text)

  if (validation.isSpammy) {
    console.warn(`[EMAIL] ⚠️ Email content flagged as potentially spammy (score: ${validation.score}): ${job.subject}`)
    console.warn(`[EMAIL] Warnings:`, validation.warnings)

    // Don't send if spam score is too high, but log the attempt
    if (validation.score > 8) {
      console.error(`[EMAIL] 🚫 Email blocked due to high spam score (${validation.score}): ${job.subject}`)
      addToFailedQueue({ ...job, context: `${context}-blocked-spam` })
      return {
        success: false,
        error: `Blocked due to high spam score (${validation.score}). Warnings: ${validation.warnings.join(', ')}`,
        attemptedAt: new Date()
      }
    }
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[EMAIL] Attempting to send ${useEnhanced ? 'enhanced' : 'basic'} email (${attempt}/${maxRetries}): ${job.subject} to ${Array.isArray(job.to) ? job.to.join(', ') : job.to} [Context: ${context}] [Spam score: ${validation.score}]`)

      let success: boolean

      if (useEnhanced) {
        // Use enhanced email with deliverability improvements
        success = await sendEnhancedEmail({
          to: job.to,
          subject: job.subject,
          html: job.html,
          text: job.text || htmlToText(job.html),
          options: {
            category: job.category || 'notification',
            priority: job.priority || 'normal',
            trackOpens: true,
            trackClicks: false
          }
        })
      } else {
        // Fallback to basic email
        success = await sendEmail(job.to, job.subject, job.html)
      }

      if (success) {
        console.log(`[EMAIL] ✅ Email sent successfully: ${job.subject} [Context: ${context}] [Enhanced: ${useEnhanced}]`)
        return { success: true, attemptedAt: new Date() }
      } else {
        console.warn(`[EMAIL] ⚠️ Email send returned false (attempt ${attempt}/${maxRetries}): ${job.subject} [Context: ${context}]`)

        if (attempt === maxRetries) {
          console.error(`[EMAIL] ❌ Email failed after ${maxRetries} attempts: ${job.subject} [Context: ${context}]`)
          addToFailedQueue(job)
          return {
            success: false,
            error: `Failed after ${maxRetries} attempts`,
            attemptedAt: new Date()
          }
        }
      }
    } catch (error) {
      console.error(`[EMAIL] 💥 Email send exception (attempt ${attempt}/${maxRetries}): ${job.subject} [Context: ${context}]`, error)

      // If enhanced email fails, try basic email on final attempt
      if (useEnhanced && attempt === maxRetries) {
        console.log(`[EMAIL] 🔄 Final attempt with basic email fallback...`)
        try {
          const basicSuccess = await sendEmail(job.to, job.subject, job.html)
          if (basicSuccess) {
            console.log(`[EMAIL] ✅ Fallback email sent successfully: ${job.subject} [Context: ${context}]`)
            return { success: true, attemptedAt: new Date() }
          }
        } catch (fallbackError) {
          console.error(`[EMAIL] 💥 Fallback email also failed:`, fallbackError)
        }
      }

      if (attempt === maxRetries) {
        addToFailedQueue(job)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          attemptedAt: new Date()
        }
      }
    }

    // Wait before retry (exponential backoff)
    if (attempt < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000) // Max 10 seconds
      console.log(`[EMAIL] 🔄 Retrying in ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  return { success: false, error: 'Should not reach here', attemptedAt: new Date() }
}

// Add failed email to queue for later retry
function addToFailedQueue(job: EmailJob) {
  const existingIndex = failedEmails.findIndex(
    item => item.subject === job.subject &&
            JSON.stringify(item.to) === JSON.stringify(job.to)
  )

  if (existingIndex >= 0) {
    failedEmails[existingIndex].attempts += 1
    failedEmails[existingIndex].lastAttempt = new Date()
  } else {
    failedEmails.push({
      ...job,
      lastAttempt: new Date(),
      attempts: 1
    })
  }

  console.log(`[EMAIL] 📮 Added to failed queue. Total failed emails: ${failedEmails.length}`)
}

// Get failed emails for admin review
export function getFailedEmails(): (EmailJob & { lastAttempt: Date; attempts: number })[] {
  return [...failedEmails]
}

// Clear failed email queue
export function clearFailedEmails(): number {
  const count = failedEmails.length
  failedEmails.splice(0, failedEmails.length)
  console.log(`[EMAIL] 🗑️ Cleared ${count} failed emails from queue`)
  return count
}

// Retry all failed emails
export async function retryFailedEmails(): Promise<{ success: number; failed: number }> {
  const emailsToRetry = [...failedEmails]
  let successCount = 0
  let failedCount = 0

  console.log(`[EMAIL] 🔄 Retrying ${emailsToRetry.length} failed emails...`)

  // Clear the queue since we're about to retry them
  failedEmails.splice(0, failedEmails.length)

  for (const email of emailsToRetry) {
    try {
      const result = await sendEmailWithRetry({
        ...email,
        context: `retry-${email.context}`,
        retries: 2 // Fewer retries for manual retry
      })

      if (result.success) {
        successCount++
      } else {
        failedCount++
      }
    } catch (error) {
      console.error(`[EMAIL] Error retrying failed email: ${email.subject}`, error)
      failedCount++
    }
  }

  console.log(`[EMAIL] 📊 Retry results: ${successCount} succeeded, ${failedCount} failed`)
  return { success: successCount, failed: failedCount }
}

// Convenience wrapper for common notification patterns
export async function notifyAsync(
  emailFn: () => Promise<boolean>,
  context: string,
  fallbackSubject: string = 'تحديث من تواصل النخبة'
): Promise<void> {
  try {
    console.log(`[EMAIL] 📤 Sending notification: ${context}`)
    const success = await emailFn()

    if (success) {
      console.log(`[EMAIL] ✅ Notification sent successfully: ${context}`)
    } else {
      console.warn(`[EMAIL] ⚠️ Notification failed: ${context}`)
      // Could add to failed queue here if we had more context about the email
    }
  } catch (error) {
    console.error(`[EMAIL] 💥 Notification exception: ${context}`, error)
    // Could add to failed queue here if we had more context about the email
  }
}

// Enhanced email health check - tests both basic and enhanced email systems
export async function testEmailSystem(): Promise<{
  success: boolean;
  error?: string;
  responseTime: number;
  enhancedFeatures?: boolean;
  validationScore?: number;
  warnings?: string[];
}> {
  const startTime = Date.now()
  const timestamp = new Date().toLocaleString('ar')

  const testHtml = `
    <div style="direction: rtl; font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0E2855; margin-bottom: 16px;">🔧 اختبار نظام الإيميل المحسن</h2>

      <div style="background: #E8F5E8; padding: 12px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0; color: #059669;"><strong>✅ النظام يعمل بشكل صحيح</strong></p>
      </div>

      <div style="background: #F8FAFC; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <h3 style="margin: 0 0 12px 0; color: #0E2855; font-size: 16px;">تفاصيل الاختبار</h3>
        <ul style="margin: 0; padding-right: 20px; color: #6B7C99; font-size: 14px;">
          <li>اختبار إرسال البريد الإلكتروني</li>
          <li>تحليل محتوى ضد spam filters</li>
          <li>تطبيق تحسينات deliverability</li>
          <li>إنشاء نسخة نصية تلقائية</li>
          <li>إضافة headers محسنة</li>
        </ul>
      </div>

      <p style="color: #6B7C99; font-size: 12px; margin: 16px 0 0 0;">
        <strong>وقت الإرسال:</strong> ${timestamp}<br>
        <strong>نوع الاختبار:</strong> نظام محسن مع تحسينات deliverability
      </p>
    </div>
  `

  try {
    // Pre-validate the test content
    const validation = validateEmailContent('اختبار نظام الإيميل المحسن - تواصل النخبة', testHtml)

    const testResult = await sendEmailWithRetry({
      to: 'first1saudi@gmail.com', // Admin email
      subject: '🔧 اختبار نظام الإيميل المحسن - تواصل النخبة',
      html: testHtml,
      text: htmlToText(testHtml),
      context: 'enhanced-system-health-check',
      category: 'transactional',
      priority: 'normal',
      enhanced: true,
      retries: 2
      // لا نحتاج CC هنا لأنه اختبار إداري
    })

    const responseTime = Date.now() - startTime

    return {
      success: testResult.success,
      error: testResult.error,
      responseTime,
      enhancedFeatures: true,
      validationScore: validation.score,
      warnings: validation.warnings
    }
  } catch (error) {
    const responseTime = Date.now() - startTime

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime,
      enhancedFeatures: false
    }
  }
}

// Get email system statistics
export function getEmailStats(): {
  failedEmailsCount: number
  failedEmails: { subject: string; attempts: number; lastAttempt: Date; context?: string }[]
} {
  return {
    failedEmailsCount: failedEmails.length,
    failedEmails: failedEmails.map(email => ({
      subject: email.subject,
      attempts: email.attempts,
      lastAttempt: email.lastAttempt,
      context: email.context
    }))
  }
}
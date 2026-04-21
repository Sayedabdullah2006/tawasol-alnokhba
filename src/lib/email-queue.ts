// Enhanced email notification system with better error handling and logging
import { sendEmail } from './email'

export interface EmailJob {
  to: string | string[]
  subject: string
  html: string
  retries?: number
  context?: string // For logging what triggered this email
}

export interface EmailResult {
  success: boolean
  error?: string
  attemptedAt: Date
}

// Queue for failed emails (in-memory for now, could be moved to database/Redis later)
const failedEmails: (EmailJob & { lastAttempt: Date; attempts: number })[] = []

// Enhanced email sending with retry logic and better logging
export async function sendEmailWithRetry(job: EmailJob): Promise<EmailResult> {
  const maxRetries = job.retries ?? 3
  const context = job.context ?? 'unknown'

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[EMAIL] Attempting to send email (${attempt}/${maxRetries}): ${job.subject} to ${Array.isArray(job.to) ? job.to.join(', ') : job.to} [Context: ${context}]`)

      const success = await sendEmail(job.to, job.subject, job.html)

      if (success) {
        console.log(`[EMAIL] ✅ Email sent successfully: ${job.subject} [Context: ${context}]`)
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

// Email health check - can be called by admin endpoints to verify email system is working
export async function testEmailSystem(): Promise<{
  success: boolean;
  error?: string;
  responseTime: number
}> {
  const startTime = Date.now()

  try {
    const testResult = await sendEmailWithRetry({
      to: 'first1saudi@gmail.com', // Admin email
      subject: 'نظام الإيميل يعمل بشكل صحيح',
      html: `
        <div style="direction: rtl; font-family: Arial, sans-serif; padding: 20px;">
          <h2>اختبار نظام الإيميل</h2>
          <p>هذه رسالة اختبار للتأكد من أن نظام الإيميل يعمل بشكل صحيح.</p>
          <p><strong>الوقت:</strong> ${new Date().toLocaleString('ar')}</p>
          <p><strong>حالة النظام:</strong> ✅ يعمل</p>
        </div>
      `,
      context: 'system-health-check',
      retries: 1
    })

    const responseTime = Date.now() - startTime

    return {
      success: testResult.success,
      error: testResult.error,
      responseTime
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: Date.now() - startTime
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
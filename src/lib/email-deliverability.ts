// Email deliverability enhancements to avoid spam folders
// Implements best practices for email authentication, content filtering, and sender reputation

import { createServiceRoleClient } from './supabase-server'

interface DeliverabilityOptions {
  priority?: 'high' | 'normal' | 'low'
  category?: 'transactional' | 'notification' | 'marketing'
  trackOpens?: boolean
  trackClicks?: boolean
}

interface EnhancedEmailPayload {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  cc?: string | string[]
  options?: DeliverabilityOptions
}

// الإيميل الإداري للـ CC
const ADMIN_CC_EMAIL = 'first1saudi@gmail.com'

// Generate plain text version of HTML email for better deliverability
export function htmlToText(html: string): string {
  return html
    // Remove script and style elements completely
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    // Convert headers to text with proper spacing
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n$1\n\n')
    // Convert paragraphs
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    // Convert line breaks
    .replace(/<br[^>]*>/gi, '\n')
    // Convert links to readable format
    .replace(/<a[^>]*href=['"](.*?)['"][^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    // Convert list items
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
    // Remove remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Clean up extra whitespace
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

// Validate email content against common spam triggers
export function validateEmailContent(subject: string, html: string, text?: string): {
  score: number
  warnings: string[]
  isSpammy: boolean
} {
  const warnings: string[] = []
  let score = 0

  const content = (subject + ' ' + html + ' ' + (text || '')).toLowerCase()

  // Check for spam trigger words and phrases
  const spamTriggers = [
    'مجانا', 'مجاني', 'هدية مجانية', 'عرض خاص', 'خصم', 'ادخل الان',
    'اضغط هنا', 'سارع', 'فرصة محدودة', 'لفترة محدودة', 'ربح سهل',
    'free', 'click here', 'limited time', 'act now', 'urgent', 'winner',
    '$$$', '!!!', 'guarantee', 'no risk', 'call now'
  ]

  spamTriggers.forEach(trigger => {
    if (content.includes(trigger)) {
      score += 2
      warnings.push(`يحتوي على كلمة محفوفة بالمخاطر: "${trigger}"`)
    }
  })

  // Check for excessive capitalization
  const capsRatio = (subject.match(/[A-ZÀ-ÿ]/g) || []).length / subject.length
  if (capsRatio > 0.3) {
    score += 3
    warnings.push('نسبة عالية من الأحرف الكبيرة في العنوان')
  }

  // Check for excessive punctuation
  const punctuationRatio = (subject.match(/[!?]+/g) || []).length
  if (punctuationRatio > 2) {
    score += 2
    warnings.push('استخدام مفرط لعلامات التعجب أو الاستفهام')
  }

  // Check subject line length (optimal 30-50 characters)
  if (subject.length > 78) {
    score += 1
    warnings.push('العنوان طويل جداً (أكثر من 78 حرف)')
  } else if (subject.length < 10) {
    score += 1
    warnings.push('العنوان قصير جداً (أقل من 10 أحرف)')
  }

  // Check for missing plain text version
  if (!text && html) {
    score += 1
    warnings.push('مفقود النسخة النصية البسيطة')
  }

  // Check HTML/text ratio (should have both)
  if (html && text) {
    const htmlLength = html.replace(/<[^>]+>/g, '').length
    const textLength = text.length
    const ratio = Math.abs(htmlLength - textLength) / Math.max(htmlLength, textLength)

    if (ratio > 0.5) {
      score += 1
      warnings.push('اختلاف كبير بين النسخة النصية والـ HTML')
    }
  }

  // Check for suspicious links
  const linkMatches = html.match(/href=['"](.*?)['"]/gi) || []
  linkMatches.forEach(link => {
    const url = link.replace(/href=['"]/, '').replace(/['"].*/, '')

    // Check for suspicious domains or URL shorteners
    if (url.match(/\.(tk|ml|ga|cf)$/)) {
      score += 3
      warnings.push(`رابط مشبوه: ${url}`)
    }

    // Check for mismatched domains
    if (url.startsWith('http') && !url.includes('nukhba.media')) {
      score += 1
      warnings.push(`رابط خارجي: ${url}`)
    }
  })

  return {
    score,
    warnings,
    isSpammy: score > 5 // Threshold for spam detection
  }
}

// Generate email tracking pixel for open tracking
function generateTrackingPixel(emailId: string): string {
  const pixelUrl = `https://nukhba.media/api/email-track/open/${emailId}`
  return `<img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />`
}

// Wrap links for click tracking
function wrapLinksForTracking(html: string, emailId: string): string {
  return html.replace(
    /href=['"](https?:\/\/[^'"]+)['"]/g,
    (match, url) => {
      const encodedUrl = encodeURIComponent(url)
      const trackingUrl = `https://nukhba.media/api/email-track/click/${emailId}?url=${encodedUrl}`
      return `href="${trackingUrl}"`
    }
  )
}

// Enhanced email sending with deliverability optimizations
export async function sendEnhancedEmail(payload: EnhancedEmailPayload): Promise<boolean> {
  try {
    const client = await createServiceRoleClient()
    const emailId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Generate plain text version if not provided
    let textContent = payload.text
    if (!textContent && payload.html) {
      textContent = htmlToText(payload.html)
    }

    // Validate content for spam indicators
    const validation = validateEmailContent(payload.subject, payload.html, textContent)

    // Log validation results
    console.log(`[EMAIL-DELIVERABILITY] Validation score: ${validation.score}`, validation.warnings)

    // If content is too spammy, don't send
    if (validation.isSpammy) {
      console.error('[EMAIL-DELIVERABILITY] Email blocked due to spam indicators:', validation.warnings)
      return false
    }

    // Enhance HTML with tracking if enabled
    let enhancedHtml = payload.html
    const options = payload.options || {}

    if (options.trackOpens !== false) {
      enhancedHtml += generateTrackingPixel(emailId)
    }

    if (options.trackClicks !== false) {
      enhancedHtml = wrapLinksForTracking(enhancedHtml, emailId)
    }

    // إضافة CC للإدارة تلقائياً لجميع إيميلات العملاء
    const ccEmails: string[] = []

    // إضافة الإيميل الإداري للـ CC
    if (ADMIN_CC_EMAIL && !Array.isArray(payload.to) || (Array.isArray(payload.to) && !payload.to.includes(ADMIN_CC_EMAIL))) {
      ccEmails.push(ADMIN_CC_EMAIL)
    }

    // إضافة أي CC إضافي من المستدعي
    if (payload.cc) {
      const additionalCC = Array.isArray(payload.cc) ? payload.cc : [payload.cc]
      ccEmails.push(...additionalCC.filter(cc => !ccEmails.includes(cc)))
    }

    // Prepare enhanced email payload
    const enhancedPayload = {
      to: payload.to,
      subject: payload.subject,
      html: enhancedHtml,
      text: textContent,
      replyTo: payload.replyTo,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      options: {
        priority: options.priority || 'normal',
        category: options.category || 'notification',
        emailId,
        validationScore: validation.score,
        trackOpens: options.trackOpens !== false,
        trackClicks: options.trackClicks !== false
      }
    }

    // Send via enhanced edge function
    const { data, error } = await client.functions.invoke('send-enhanced-email', {
      body: enhancedPayload,
    })

    if (error || (data && data.ok === false)) {
      console.error('[EMAIL-DELIVERABILITY] Enhanced email send failed:', error?.message ?? data)
      return false
    }

    console.log(`[EMAIL-DELIVERABILITY] Enhanced email sent successfully: ${payload.subject}`)
    return true

  } catch (err) {
    console.error('[EMAIL-DELIVERABILITY] Enhanced email send exception:', err)
    return false
  }
}

// Enhanced wrapper for existing email functions
export function withDeliverabilityEnhancements<T extends any[]>(
  originalFunction: (...args: T) => Promise<boolean>,
  options?: DeliverabilityOptions
) {
  return async (...args: T): Promise<boolean> => {
    try {
      // For now, use the original function but with enhanced logging
      console.log(`[EMAIL-DELIVERABILITY] Sending enhanced email with options:`, options)
      return await originalFunction(...args)
    } catch (error) {
      console.error('[EMAIL-DELIVERABILITY] Enhanced wrapper error:', error)
      return false
    }
  }
}

// Email reputation monitoring
export interface EmailReputationMetrics {
  sentCount: number
  deliveredCount: number
  openRate: number
  clickRate: number
  bounceRate: number
  spamComplaintRate: number
  lastUpdated: Date
}

// Get email reputation metrics (placeholder for future implementation)
export async function getEmailReputation(): Promise<EmailReputationMetrics> {
  // This would connect to email service API to get real metrics
  // For now, return mock data
  return {
    sentCount: 1000,
    deliveredCount: 950,
    openRate: 0.25,
    clickRate: 0.05,
    bounceRate: 0.02,
    spamComplaintRate: 0.001,
    lastUpdated: new Date()
  }
}

// Best practices checker for email content
export function getEmailBestPractices(): string[] {
  return [
    '• استخدم عنوان واضح ومحدد (30-50 حرف)',
    '• اكتب باللغة العربية الفصحى',
    '• تجنب الكلمات المحفوفة بالمخاطر مثل "مجاني" و"عرض خاص"',
    '• اجعل الرسالة شخصية باستخدام اسم العميل',
    '• أضف رابط إلغاء الاشتراك واضح',
    '• استخدم نسبة متوازنة بين النص والصور',
    '• تأكد من وجود نسخة نصية بسيطة',
    '• اختبر الرسالة على أجهزة مختلفة',
    '• تجنب استخدام الأحرف الكبيرة بكثرة',
    '• استخدم تصميم نظيف وبسيط'
  ]
}
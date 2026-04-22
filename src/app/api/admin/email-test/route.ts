// Admin endpoint to test email deliverability and validate improvements
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import {
  sendEnhancedEmail,
  validateEmailContent,
  htmlToText,
  getEmailBestPractices,
  getEmailReputation
} from '@/lib/email-deliverability'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServiceRoleClient()

    // Check admin authorization
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { action, ...params } = await request.json()

    switch (action) {
      case 'test-send':
        return await handleTestSend(params)

      case 'validate-content':
        return await handleValidateContent(params)

      case 'get-best-practices':
        return await handleGetBestPractices()

      case 'get-reputation':
        return await handleGetReputation()

      case 'test-templates':
        return await handleTestTemplates(params)

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Email test API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function handleTestSend(params: {
  to?: string
  subject?: string
  html?: string
  testType?: 'basic' | 'template' | 'custom'
}) {
  const testEmail = params.to || 'first1saudi@gmail.com'

  let subject: string
  let html: string

  switch (params.testType) {
    case 'template':
      subject = 'اختبار قالب الإيميل المحسن · تواصل النخبة'
      html = `
        <div style="direction: rtl; font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0E2855; margin-bottom: 20px;">🧪 اختبار قالب الإيميل المحسن</h2>

          <div style="background: #F7F4ED; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p><strong>هذا اختبار للتحسينات الجديدة:</strong></p>
            <ul>
              <li>✅ هيدرز محسنة لتجنب الـ spam</li>
              <li>✅ نسخة نصية تلقائية</li>
              <li>✅ تتبع فتح الإيميلات</li>
              <li>✅ تحسينات الـ deliverability</li>
              <li>✅ اختبار محتوى مضاد للـ spam</li>
            </ul>
          </div>

          <p>الوقت: ${new Date().toLocaleString('ar')}</p>
          <p>حالة النظام: <span style="color: green;">✅ يعمل</span></p>

          <div style="margin-top: 20px; padding: 12px; background: #E8F5E8; border-radius: 6px;">
            <p style="margin: 0; color: #059669;">إذا وصلك هذا الإيميل في الـ inbox وليس spam، فالتحسينات تعمل بشكل صحيح!</p>
          </div>
        </div>
      `
      break

    case 'custom':
      subject = params.subject || 'اختبار مخصص · تواصل النخبة'
      html = params.html || '<p>محتوى اختبار مخصص</p>'
      break

    default: // basic
      subject = 'اختبار أساسي لنظام الإيميل المحسن'
      html = `
        <div style="direction: rtl; padding: 20px; font-family: Arial, sans-serif;">
          <h3>اختبار سريع لنظام الإيميل</h3>
          <p>هذه رسالة اختبار بسيطة للتأكد من أن نظام الإيميل المحسن يعمل بشكل صحيح.</p>
          <p><strong>الوقت:</strong> ${new Date().toLocaleString('ar')}</p>
          <p><strong>حالة النظام:</strong> ✅ يعمل</p>
        </div>
      `
  }

  try {
    // Validate content first
    const validation = validateEmailContent(subject, html)

    // Send enhanced email
    const success = await sendEnhancedEmail({
      to: testEmail,
      subject,
      html,
      options: {
        category: 'transactional',
        priority: 'normal',
        trackOpens: true,
        trackClicks: false
      }
    })

    return NextResponse.json({
      success,
      validation,
      testDetails: {
        to: testEmail,
        subject,
        htmlLength: html.length,
        textLength: htmlToText(html).length,
        testType: params.testType || 'basic',
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      validation: validateEmailContent(subject, html)
    })
  }
}

async function handleValidateContent(params: {
  subject: string
  html: string
  text?: string
}) {
  const validation = validateEmailContent(params.subject, params.html, params.text)
  const autoText = htmlToText(params.html)

  return NextResponse.json({
    validation,
    suggestions: validation.isSpammy ? [
      'قم بتقليل استخدام الكلمات المحفوفة بالمخاطر',
      'اجعل العنوان أكثر تحديداً وأقل إثارة',
      'تجنب الإفراط في استخدام علامات التعجب',
      'أضف محتوى نصي أكثر تفصيلاً'
    ] : [
      'المحتوى يبدو جيد للتسليم',
      'تأكد من اختبار العرض على أجهزة مختلفة',
      'راقب معدلات الفتح والنقر'
    ],
    autoGeneratedText: autoText,
    textPreview: autoText.substring(0, 200) + (autoText.length > 200 ? '...' : '')
  })
}

async function handleGetBestPractices() {
  const practices = getEmailBestPractices()

  return NextResponse.json({
    practices,
    categories: {
      subject: [
        'استخدم 30-50 حرف للعنوان',
        'اجعل العنوان واضح ومحدد',
        'تجنب الكلمات المحفوفة بالمخاطر',
        'لا تستخدم أحرف كبيرة بكثرة'
      ],
      content: [
        'اكتب باللغة العربية الفصحى',
        'اجعل النص شخصي باستخدام الاسم',
        'استخدم نسبة متوازنة بين النص والصور',
        'أضف call-to-action واضح'
      ],
      technical: [
        'تأكد من وجود نسخة نصية',
        'استخدم HTML صحيح ونظيف',
        'أضف alt text للصور',
        'اختبر على عملاء إيميل مختلفة'
      ]
    }
  })
}

async function handleGetReputation() {
  const reputation = await getEmailReputation()

  return NextResponse.json({
    reputation,
    status: reputation.bounceRate > 0.05 || reputation.spamComplaintRate > 0.003 ? 'warning' : 'good',
    recommendations: reputation.bounceRate > 0.05 ? [
      'معدل الارتداد مرتفع - تحقق من قوائم الإيميلات',
      'قم بتنظيف قاعدة البيانات من الإيميلات غير الصحيحة'
    ] : [
      'السمعة جيدة - استمر في المحافظة على جودة المحتوى',
      'راقب المقاييس بانتظام'
    ]
  })
}

async function handleTestTemplates(params: { templateType?: string }) {
  // Test different email templates with validation
  const templates = [
    {
      name: 'طلب جديد',
      subject: 'طلب نشر جديد · ATH-001',
      html: '<div style="direction:rtl;padding:20px;"><h3>طلب نشر جديد</h3><p>تم استلام طلب نشر جديد يحتاج مراجعة.</p></div>'
    },
    {
      name: 'عرض سعر',
      subject: '💰 وصلك العرض المخصص · ATH-001',
      html: '<div style="direction:rtl;padding:20px;"><h3>العرض جاهز</h3><p>فريقنا انتهى من مراجعة طلبك وأعد العرض المخصص.</p></div>'
    },
    {
      name: 'دفع مؤكد',
      subject: '✅ تم تأكيد دفعك · ATH-001',
      html: '<div style="direction:rtl;padding:20px;"><h3>تم تأكيد الدفع</h3><p>استلمنا دفعك واعتمدناه. طلبك الآن في قائمة التنفيذ.</p></div>'
    }
  ]

  const results = templates.map(template => ({
    ...template,
    validation: validateEmailContent(template.subject, template.html),
    textVersion: htmlToText(template.html)
  }))

  return NextResponse.json({
    templates: results,
    summary: {
      total: results.length,
      spammy: results.filter(r => r.validation.isSpammy).length,
      averageScore: results.reduce((sum, r) => sum + r.validation.score, 0) / results.length
    }
  })
}
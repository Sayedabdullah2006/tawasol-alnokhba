/**
 * Send Reminder Email API Route
 * Allows admins to send reminder emails to clients based on request status
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-server';
import { sendEmailWithRetry } from '@/lib/email-queue';
import { generateRequestNumber } from '@/lib/utils';
import { reminderTemplates, quotedDiscountTemplate } from '@/lib/reminder-templates';

export async function POST(request: NextRequest) {
  try {
    const { requestId, reminderType, discountPct } = await request.json() as {
      requestId: string
      reminderType?: string
      discountPct?: number | null
    };

    if (!requestId) {
      return NextResponse.json(
        { error: 'معرف الطلب مطلوب' },
        { status: 400 }
      );
    }

    const applyDiscount = typeof discountPct === 'number' && discountPct > 0 && discountPct < 100

    console.log(`[SEND_REMINDER] Admin sending reminder for request: ${requestId}, type: ${reminderType}, discount: ${applyDiscount ? discountPct : 'none'}`);

    const supabase = await createServiceRoleClient();

    // Get request details
    const { data: requestData, error: fetchError } = await supabase
      .from('publish_requests')
      .select(`
        id,
        client_name,
        client_email,
        request_number,
        status,
        admin_quoted_price,
        final_total,
        title
      `)
      .eq('id', requestId)
      .single();

    if (fetchError || !requestData) {
      console.error('[SEND_REMINDER] Request not found:', fetchError);
      return NextResponse.json(
        { error: 'الطلب غير موجود' },
        { status: 404 }
      );
    }

    if (!requestData.client_email) {
      console.error('[SEND_REMINDER] No client email found');
      return NextResponse.json(
        { error: 'لا يوجد إيميل للعميل' },
        { status: 400 }
      );
    }

    const requestNumber = generateRequestNumber(requestData.request_number);

    if (applyDiscount && requestData.status !== 'quoted') {
      return NextResponse.json(
        { error: 'الخصم متاح فقط للطلبات بحالة "بانتظار موافقة العميل"' },
        { status: 400 }
      );
    }

    let subject: string
    let html: string
    let newPrice: number | null = null

    if (applyDiscount) {
      const originalPrice = Number(requestData.admin_quoted_price ?? requestData.final_total ?? 0)
      if (originalPrice <= 0) {
        return NextResponse.json(
          { error: 'لا يوجد سعر لهذا العرض ليتم تطبيق الخصم عليه' },
          { status: 400 }
        );
      }
      newPrice = Math.round(originalPrice * (1 - discountPct! / 100) * 100) / 100
      subject = quotedDiscountTemplate.subject(requestNumber, discountPct!)
      html = quotedDiscountTemplate.html(
        requestData.client_name ?? 'عزيزنا',
        requestNumber,
        originalPrice,
        newPrice,
        discountPct!,
      )
    } else {
      const templateType = reminderType || requestData.status;
      const template = reminderTemplates[templateType as keyof typeof reminderTemplates];
      if (!template) {
        console.error('[SEND_REMINDER] No template found for status:', templateType);
        return NextResponse.json(
          { error: 'لا يوجد قالب تذكير لهذه الحالة' },
          { status: 400 }
        );
      }
      subject = template.subject(requestNumber);
      const amount = requestData.final_total || requestData.admin_quoted_price;
      html = template.html(requestData.client_name, requestNumber, amount);
    }

    // Retry-aware send to ride out transient rate limits
    const result = await sendEmailWithRetry({
      to: requestData.client_email,
      subject,
      html,
      context: applyDiscount ? `single-discount-${requestNumber}` : `single-reminder-${requestNumber}`,
      retries: 3,
      enhanced: false,
      category: 'notification',
    })

    if (!result.success) {
      console.error('[SEND_REMINDER] Failed to send email:', result.error);
      return NextResponse.json(
        { error: 'فشل في إرسال الإيميل' },
        { status: 500 }
      );
    }

    console.log(`[SEND_REMINDER] ✅ Reminder sent successfully to ${requestData.client_email}`);

    // Critical update: price changes (separate so a missing nullable column won't drop it)
    if (applyDiscount && newPrice !== null) {
      const { error: priceUpdateError } = await supabase
        .from('publish_requests')
        .update({
          admin_quoted_price: newPrice,
          final_total: newPrice,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (priceUpdateError) {
        console.error('[SEND_REMINDER] Failed to update price:', priceUpdateError);
        return NextResponse.json(
          { error: 'تم إرسال البريد لكن فشل تحديث السعر في الطلب', details: priceUpdateError.message },
          { status: 500 }
        );
      }
    }

    // Non-critical: bump reminder timestamp. Tolerate missing column gracefully.
    const { error: stampError } = await supabase
      .from('publish_requests')
      .update({
        last_reminder_sent: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (stampError) {
      console.warn('[SEND_REMINDER] Could not bump last_reminder_sent (column may be missing):', stampError.message);
    }

    return NextResponse.json({
      success: true,
      message: 'تم إرسال التذكير بنجاح',
      sentTo: requestData.client_email,
      requestNumber,
      priceUpdated: applyDiscount,
      newPrice,
    });

  } catch (error) {
    console.error('[SEND_REMINDER] Exception:', error);
    return NextResponse.json(
      {
        error: 'خطأ في الخادم أثناء إرسال التذكير',
        details: error instanceof Error ? error.message : 'خطأ غير معروف'
      },
      { status: 500 }
    );
  }
}
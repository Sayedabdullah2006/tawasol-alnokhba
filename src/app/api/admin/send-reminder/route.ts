/**
 * Send Reminder Email API Route
 * Allows admins to send reminder emails to clients based on request status
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/email';
import { generateRequestNumber } from '@/lib/utils';
import { reminderTemplates } from '@/lib/reminder-templates';

export async function POST(request: NextRequest) {
  try {
    const { requestId, reminderType } = await request.json();

    if (!requestId) {
      return NextResponse.json(
        { error: 'معرف الطلب مطلوب' },
        { status: 400 }
      );
    }

    console.log(`[SEND_REMINDER] Admin sending reminder for request: ${requestId}, type: ${reminderType}`);

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
    const templateType = reminderType || requestData.status;

    // Get the appropriate template
    const template = reminderTemplates[templateType as keyof typeof reminderTemplates];
    if (!template) {
      console.error('[SEND_REMINDER] No template found for status:', templateType);
      return NextResponse.json(
        { error: 'لا يوجد قالب تذكير لهذه الحالة' },
        { status: 400 }
      );
    }

    console.log(`[SEND_REMINDER] Using template: ${templateType} for request ${requestNumber}`);

    // Prepare email content
    const subject = template.subject(requestNumber);
    const amount = requestData.final_total || requestData.admin_quoted_price;
    const html = template.html(requestData.client_name, requestNumber, amount);

    // Send the reminder email
    const emailSent = await sendEmail(requestData.client_email, subject, html);

    if (!emailSent) {
      console.error('[SEND_REMINDER] Failed to send email');
      return NextResponse.json(
        { error: 'فشل في إرسال الإيميل' },
        { status: 500 }
      );
    }

    console.log(`[SEND_REMINDER] ✅ Reminder sent successfully to ${requestData.client_email}`);

    // Log the reminder in the request record
    const { error: updateError } = await supabase
      .from('publish_requests')
      .update({
        last_reminder_sent: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('[SEND_REMINDER] Failed to update last_reminder_sent:', updateError);
      // Don't fail the request for this, just log it
    }

    return NextResponse.json({
      success: true,
      message: 'تم إرسال التذكير بنجاح',
      sentTo: requestData.client_email,
      reminderType: templateType,
      requestNumber
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
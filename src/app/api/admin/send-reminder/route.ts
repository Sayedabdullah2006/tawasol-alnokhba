/**
 * Send Reminder Email API Route
 * Allows admins to send reminder emails to clients based on request status
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/email';
import { generateRequestNumber } from '@/lib/utils';

// Email templates for different reminder types
const reminderTemplates = {
  pending: {
    subject: (requestNumber: string) => `⏰ تذكير: طلبك ${requestNumber} قيد المراجعة`,
    html: (clientName: string, requestNumber: string) => `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 48px; margin-bottom: 10px;">⏰</div>
            <h2 style="color: #1a5f3f; margin: 0; font-size: 24px;">تذكير بطلبك</h2>
          </div>

          <p style="font-size: 16px; color: #333; line-height: 1.6;">
            مرحباً <strong>${clientName}</strong>،
          </p>

          <p style="font-size: 16px; color: #333; line-height: 1.6;">
            نذكرك بأن طلبك <strong>${requestNumber}</strong> لا يزال قيد المراجعة من قِبل فريقنا المختص.
          </p>

          <div style="background: #e3f2fd; border: 1px solid #2196f3; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
            <div style="font-size: 24px; margin-bottom: 8px;">📋</div>
            <p style="margin: 0; color: #1976d2; font-weight: bold;">جارٍ مراجعة المحتوى</p>
            <p style="margin: 5px 0 0 0; font-size: 14px; color: #1976d2;">سنرسل لك العرض فور الانتهاء</p>
          </div>

          <p style="font-size: 14px; color: #666; line-height: 1.6;">
            نقدر صبرك ونعمل جاهدين لتقديم أفضل خدمة لك. سيتم إشعارك فور جاهزية العرض.
          </p>

          <div style="text-align: center; margin-top: 30px;">
            <p style="font-size: 14px; color: #999; margin: 0;">
              مع تحيات فريق تواصل النخبة
            </p>
          </div>
        </div>
      </div>
    `
  },

  quoted: {
    subject: (requestNumber: string) => `🔔 تذكير: عرضك ${requestNumber} بانتظار موافقتك`,
    html: (clientName: string, requestNumber: string, quotedPrice?: number) => `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 48px; margin-bottom: 10px;">🔔</div>
            <h2 style="color: #e65100; margin: 0; font-size: 24px;">تذكير بعرضك</h2>
          </div>

          <p style="font-size: 16px; color: #333; line-height: 1.6;">
            مرحباً <strong>${clientName}</strong>،
          </p>

          <p style="font-size: 16px; color: #333; line-height: 1.6;">
            نذكرك بأن عرضنا لطلب <strong>${requestNumber}</strong> لا يزال بانتظار موافقتك.
          </p>

          <div style="background: #fff3e0; border: 1px solid #ff9800; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
            <div style="font-size: 24px; margin-bottom: 8px;">💰</div>
            <p style="margin: 0; color: #f57c00; font-weight: bold;">عرض جاهز للموافقة</p>
            ${quotedPrice ? `<p style="margin: 5px 0 0 0; font-size: 16px; color: #f57c00; font-weight: bold;">${quotedPrice.toLocaleString()} ر.س</p>` : ''}
          </div>

          <p style="font-size: 14px; color: #666; line-height: 1.6;">
            يمكنك مراجعة العرض وموافقة عليه من خلال لوحة التحكم الخاصة بك، أو التفاوض على السعر إذا رغبت في ذلك.
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard" style="background: #1a5f3f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
              مراجعة العرض
            </a>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <p style="font-size: 14px; color: #999; margin: 0;">
              مع تحيات فريق تواصل النخبة
            </p>
          </div>
        </div>
      </div>
    `
  },

  approved: {
    subject: (requestNumber: string) => `💳 تذكير: طلبك ${requestNumber} بانتظار إتمام الدفع`,
    html: (clientName: string, requestNumber: string, amount?: number) => `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 48px; margin-bottom: 10px;">💳</div>
            <h2 style="color: #1976d2; margin: 0; font-size: 24px;">تذكير بإتمام الدفع</h2>
          </div>

          <p style="font-size: 16px; color: #333; line-height: 1.6;">
            مرحباً <strong>${clientName}</strong>،
          </p>

          <p style="font-size: 16px; color: #333; line-height: 1.6;">
            نذكرك بأن طلبك <strong>${requestNumber}</strong> بانتظار إتمام الدفع للبدء في التنفيذ.
          </p>

          <div style="background: #e3f2fd; border: 1px solid #2196f3; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
            <div style="font-size: 24px; margin-bottom: 8px;">💳</div>
            <p style="margin: 0; color: #1976d2; font-weight: bold;">جاهز للدفع</p>
            ${amount ? `<p style="margin: 5px 0 0 0; font-size: 18px; color: #1976d2; font-weight: bold;">${amount.toLocaleString()} ر.س</p>` : ''}
          </div>

          <p style="font-size: 14px; color: #666; line-height: 1.6;">
            بمجرد إتمام الدفع، سنبدأ فوراً في تجهيز المحتوى الخاص بك وإرساله للمراجعة.
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard" style="background: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
              إتمام الدفع
            </a>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <p style="font-size: 14px; color: #999; margin: 0;">
              مع تحيات فريق تواصل النخبة
            </p>
          </div>
        </div>
      </div>
    `
  },

  content_review: {
    subject: (requestNumber: string) => `👁️ تذكير: المحتوى ${requestNumber} بانتظار مراجعتك`,
    html: (clientName: string, requestNumber: string) => `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 48px; margin-bottom: 10px;">👁️</div>
            <h2 style="color: #7b1fa2; margin: 0; font-size: 24px;">تذكير بمراجعة المحتوى</h2>
          </div>

          <p style="font-size: 16px; color: #333; line-height: 1.6;">
            مرحباً <strong>${clientName}</strong>،
          </p>

          <p style="font-size: 16px; color: #333; line-height: 1.6;">
            تم إرسال المحتوى المقترح لطلبك <strong>${requestNumber}</strong> وهو الآن بانتظار مراجعتك وموافقتك.
          </p>

          <div style="background: #f3e5f5; border: 1px solid #9c27b0; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
            <div style="font-size: 24px; margin-bottom: 8px;">👁️</div>
            <p style="margin: 0; color: #7b1fa2; font-weight: bold;">جاهز للمراجعة</p>
            <p style="margin: 5px 0 0 0; font-size: 14px; color: #7b1fa2;">راجع المحتوى واعتمده أو اطلب تعديلات</p>
          </div>

          <p style="font-size: 14px; color: #666; line-height: 1.6;">
            يمكنك مراجعة المحتوى المقترح من لوحة التحكم واعتماده للنشر أو طلب أي تعديلات ترغب بها.
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_SITE_URL}/dashboard" style="background: #7b1fa2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
              مراجعة المحتوى
            </a>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <p style="font-size: 14px; color: #999; margin: 0;">
              مع تحيات فريق تواصل النخبة
            </p>
          </div>
        </div>
      </div>
    `
  }
};

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
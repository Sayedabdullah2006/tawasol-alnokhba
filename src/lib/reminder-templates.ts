/**
 * Email templates for reminder messages
 * Shared between single and bulk reminder endpoints
 */

export const reminderTemplates = {
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
}

export type ReminderType = keyof typeof reminderTemplates

// Discounted-quote reminder — used by bulk reminder when admin applies a discount
export const quotedDiscountTemplate = {
  subject: (requestNumber: string, discountPct: number) =>
    `🎯 خصم ${discountPct}% خاص لك على عرضك · ${requestNumber}`,
  html: (
    clientName: string,
    requestNumber: string,
    originalPrice: number,
    newPrice: number,
    discountPct: number,
    options?: { paymentUrl?: string },
  ) => `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
      <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="font-size: 56px; margin-bottom: 8px;">🎯</div>
          <h2 style="color: #c2410c; margin: 0; font-size: 24px;">خصم خاص على عرضك!</h2>
        </div>

        <p style="font-size: 16px; color: #333; line-height: 1.7;">
          مرحباً <strong>${clientName}</strong>،
        </p>

        <p style="font-size: 15px; color: #333; line-height: 1.7;">
          خصصنا لك خصماً <strong style="color:#c2410c;">${discountPct}%</strong>
          على عرض طلبك <strong>${requestNumber}</strong>. السعر تحدّث تلقائياً في حسابك.
        </p>

        <div style="background: linear-gradient(135deg, #fff7ed, #ffedd5); border: 2px solid #fb923c; border-radius: 12px; padding: 22px; margin: 22px 0; text-align: center;">
          <p style="margin: 0 0 6px 0; font-size: 13px; color: #9a3412;">السعر القديم</p>
          <p style="margin: 0 0 14px 0; font-size: 18px; color: #9a3412; text-decoration: line-through;">
            ${originalPrice.toLocaleString('ar-SA')} ر.س
          </p>
          <p style="margin: 0 0 6px 0; font-size: 13px; color: #c2410c; font-weight: bold;">السعر بعد الخصم</p>
          <p style="margin: 0; font-size: 32px; color: #c2410c; font-weight: 900;">
            ${newPrice.toLocaleString('ar-SA')} ر.س
          </p>
          <p style="margin: 12px 0 0 0; font-size: 14px; color: #c2410c;">
            توفير <strong>${(originalPrice - newPrice).toLocaleString('ar-SA')} ر.س</strong>
          </p>
        </div>

        <p style="font-size: 14px; color: #555; line-height: 1.7; text-align: center;">
          ${options?.paymentUrl
            ? 'تم تطبيق الخصم على طلبك المعتمد. يمكنك الآن استكمال الدفع مباشرةً بالسعر الجديد.'
            : 'فرصة محدودة — راجع العرض المحدّث واعتمده الآن من لوحة التحكم.'}
        </p>

        <div style="text-align: center; margin: 26px 0;">
          <a href="${options?.paymentUrl ?? `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`}"
            style="background: #c2410c; color: white; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 15px;">
            ${options?.paymentUrl ? 'استكمال الدفع بالسعر الجديد' : 'مراجعة العرض المحدّث'}
          </a>
        </div>

        <p style="text-align: center; font-size: 12px; color: #999; margin: 20px 0 0 0;">
          مع تحيات فريق تواصل النخبة
        </p>
      </div>
    </div>
  `,
}

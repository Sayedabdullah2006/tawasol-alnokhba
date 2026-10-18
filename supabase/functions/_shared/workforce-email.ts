export type WorkforceMail = {
  email: string;
  name: string;
  kind: string;
  title: string;
  body?: string;
  href: string;
  createdAt: string;
  taskTitle?: string | null;
  client?: string | null;
  dueAt?: string | null;
  deliverable?: string | null;
};
const site = "https://nukhba.media";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const taskKinds = new Set([
  "assigned",
  "updated",
  "deadline",
  "state",
  "reassigned",
  "submitted",
  "approved",
  "changes",
  "comment",
  "attachment",
  "task_activity",
  "due_24h",
  "due_2h",
  "overdue",
]);
const intro: Record<string, string> = {
  welcome:
    "أهلًا بك في فريق تواصل النخبة. ملفك الوظيفي ومهامك وتسليماتك متاحة من لوحتك الخاصة.",
  assigned:
    "أُسندت إليك مهمة جديدة. راجعي المطلوب وموعد التسليم، وارفعي المخرجات داخل المهمة لاعتمادها.",
  due_24h:
    "اقترب موعد التسليم. راجعي المخرجات المتبقية وحدّثي حالة المهمة أو سجلي أي عائق.",
  due_2h:
    "بقيت ساعتان أو أقل على التسليم. أرفقي المخرجات وأرسلي التسليم للمراجعة عند اكتماله.",
  overdue:
    "تجاوزت المهمة موعد التسليم. يلزم تحديث الحالة وتوثيق العائق أو رفع المخرجات للمراجعة.",
  submitted:
    "وصل تسليم جديد ينتظر المراجعة. افتح المهمة لمعاينة الملفات واعتماد التسليم أو طلب تعديل.",
  approved:
    "تم اعتماد التسليم. يمكنك الاطلاع على القرار وسجل المهمة من الرابط أدناه.",
  changes:
    "ورد طلب تعديل على التسليم. راجعي ملاحظات الإدارة داخل المهمة وأعيدي إرسال النسخة المحدثة.",
  employee_request:
    "يوجد تحديث على طلب وظيفي. التفاصيل والقرار أو الإجراء المطلوب متاحة داخل البوابة.",
  profile_request:
    "يوجد تحديث على طلب تعديل بيانات وظيفية. افتح الطلب للاطلاع على التفاصيل.",
  payroll:
    "تم تحديث كشف المستحقات. يمكنك مراجعة التفاصيل المالية من حسابك الخاص بعد تسجيل الدخول.",
  compensation:
    "تم تحديث بيانات الراتب والحوافز. التفاصيل متاحة في ملفك الوظيفي الخاص.",
  document:
    "يوجد تحديث في المستندات الوظيفية. يمكنك معاينة المستند من حسابك الخاص.",
  document_expiry:
    "يلزم مراجعة صلاحية مستند وظيفي وتجديده عند الحاجة. التفاصيل متاحة في الملف الوظيفي.",
  contract_expiry:
    "اقترب انتهاء مدة عقد وظيفي. راجعي بيانات العقد والخطوة المطلوبة مع الإدارة.",
  attendance_settings:
    "تم تحديث إعدادات الدوام. راجعي جدول العمل والساعات من بوابتك الوظيفية.",
  attendance_correction:
    "تم تحديث سجل حضور. يمكنك مراجعة السجل والتفاصيل داخل البوابة.",
  attendance_reminder:
    "يوجد سجل حضور مفتوح لأكثر من 24 ساعة. راجعي السجل وقدمي طلب تصحيح عند الحاجة.",
  employment:
    "تم تحديث الملف الوظيفي. راجعي المعلومات والوصف الوظيفي وبيانات العقد داخل البوابة.",
  approval_reminder:
    "توجد طلبات أو تسليمات معلقة لأكثر من 24 ساعة وتحتاج قرارًا من الإدارة.",
  notifications_ready:
    "تم تفعيل إشعارات العمل والتسليم والطلبات. يمكنك الآن مراجعة مهام الأسبوع ومواعيدها من لوحتك الخاصة.",
};
export function renderWorkforceEmail(mail: WorkforceMail) {
  const href = /^\/(employee|admin\/workforce)(\/|\?|$)/.test(mail.href)
    ? site + mail.href
    : site + "/employee";
  const isTask = taskKinds.has(mail.kind) && !!mail.taskTitle;
  const message =
    intro[mail.kind] ||
    (isTask
      ? "يوجد تحديث على المهمة. راجعي التفاصيل والحالة والملاحظات من الرابط أدناه."
      : "يوجد تحديث وظيفي جديد. يمكنك الاطلاع عليه من بوابتك الخاصة.");
  const date = mail.dueAt
    ? new Date(mail.dueAt).toLocaleString("ar-SA", {
        calendar: "gregory",
        timeZone: "Asia/Riyadh",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";
  const details = isTask
    ? [
        ["المهمة", mail.taskTitle],
        ["العميل / مجال العمل", mail.client],
        ["التسليم — بتوقيت الرياض", date],
        ["المطلوب تسليمه", mail.deliverable],
      ].filter((row): row is [string, string] => !!row[1])
    : [];
  const label = isTask
    ? "فتح المهمة"
    : mail.href.startsWith("/admin/workforce")
      ? "فتح لوحة الموظفين"
      : "فتح بوابتي الوظيفية";
  const subject = `${mail.title.replace(/[\r\n]+/g, " ").slice(0, 180)} | تواصل النخبة`;
  const text = [
    `مرحبًا ${mail.name}،`,
    mail.title,
    message,
    ...details.map(([k, v]) => `${k}: ${v}`),
    `${label}: ${href}`,
    "تواصل النخبة · إشعار من نظام العمل",
  ].join("\n\n");
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background:#f4f6fa;font-family:Tahoma,Arial,sans-serif;color:#0e2855;direction:rtl;text-align:right"><div style="display:none;max-height:0;overflow:hidden">${escape(mail.title)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border-radius:16px;border-top:5px solid #c9a961;overflow:hidden"><tr><td align="center" style="padding:24px;border-bottom:1px solid #e8edf4"><img src="${site}/logo.png" width="170" alt="تواصل النخبة" style="display:block;max-width:170px;height:auto"><p style="margin:12px 0 0;font-size:12px;color:#65748b">بوابة فريق تواصل النخبة</p></td></tr><tr><td dir="rtl" style="padding:28px;text-align:right"><p style="margin:0 0 16px;font-size:15px">مرحبًا ${escape(mail.name)}،</p><h1 style="margin:0 0 16px;font-size:22px;line-height:1.6">${escape(mail.title)}</h1><p style="font-size:15px;line-height:1.9;color:#43536b">${escape(message)}</p>${details.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fc;border-radius:12px"><tr><td dir="rtl" style="padding:18px;text-align:right">${details.map(([key, value]) => `<p style="margin:0 0 4px;font-size:12px;color:#65748b">${escape(key)}</p><p style="margin:0 0 16px;font-size:14px;line-height:1.8;white-space:pre-line">${escape(value)}</p>`).join("")}</td></tr></table>` : ""}<p style="margin:24px 0"><a href="${escape(href)}" style="display:inline-block;background:#0e2855;color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:bold">${label}</a></p><p style="font-size:12px;color:#65748b;line-height:1.8">تعرض التفاصيل بعد تسجيل الدخول إلى حسابك.</p></td></tr><tr><td align="center" style="padding:20px;background:#f8f5ee;font-size:12px;line-height:1.8;color:#65748b"><strong style="color:#0e2855">تواصل النخبة</strong><br>إشعار من نظام العمل · <a href="${site}" style="color:#0e2855">nukhba.media</a></td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}

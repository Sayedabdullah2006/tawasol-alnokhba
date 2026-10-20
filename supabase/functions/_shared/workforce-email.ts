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
  cc?: string[];
  weeklyReport?: WeeklyReport;
};
export type WeeklyReport = {
  periodStart: string; periodEnd: string; asOf: string; month: string;
  completed: number; unfinished: number; pendingReview: number; overdue: number;
  onTime: number; lateSubmissions: number; changesCount: number; repeatedChanges: number;
  weekWorkedMinutes: number; weekRequiredMinutes: number; monthWorkedMinutes: number;
  openTasks: {title:string;dueAt:string|null;pendingReview:boolean}[];
};
const duration = (minutes: number) => `${Math.floor(minutes / 60)} س ${Math.floor(minutes % 60)} د`;
export function weeklyFeedback(report: WeeklyReport) {
  const missing = Math.max(0, report.weekRequiredMinutes - report.weekWorkedMinutes);
  const late = report.overdue > 0 || report.lateSubmissions > 0;
  const lead = !late && report.onTime ? "شكرًا لالتزامك بالمواعيد." : "شكرًا لجهدك هذا الأسبوع.";
  const focus: string[] = [];
  if (late) focus.push("ابدئي بالأقرب للتسليم وشاركي العوائق مبكرًا");
  if (report.repeatedChanges) focus.push("راجعي المتطلبات بقائمة تحقق قبل التسليم");
  else if (report.changesCount) focus.push("استفيدي من ملاحظات المراجعة في النسخة المقبلة");
  if (missing) focus.push("راجعي فترات حضورك ونظّمي وقتك للوصول إلى المستهدف");
  if (focus.length) return [`${lead} ${focus.join("، و")}؛ نحن هنا لدعمك.`];
  if (report.weekRequiredMinutes > 0) return [`${lead} أحسنتِ في تحقيق مستهدف الساعات، واصلي بهذا الإيقاع المتوازن.`];
  return [`${lead} حددي أولوياتك وخطوتك القادمة، ونتطلع لإنجازاتك.`];
}
export function workforceMailCC(mail: WorkforceMail) {
  return mail.kind === "weekly_report" && mail.weeklyReport && mail.cc?.includes("elitecnnct@gmail.com")
    && mail.email.toLowerCase() !== "elitecnnct@gmail.com" ? ["elitecnnct@gmail.com"] : undefined;
}
const site = "https://nukhba.media";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function renderWeeklyEmail(mail: WorkforceMail, weekly: WeeklyReport) {
  const subject = `${mail.title.replace(/[\r\n]+/g, " ").slice(0,180)} | تواصل النخبة`;
  const feedback = weeklyFeedback(weekly)[0];
  const missing = Math.max(0,weekly.weekRequiredMinutes-weekly.weekWorkedMinutes);
  const percent = weekly.weekRequiredMinutes ? Math.min(100,Math.round(weekly.weekWorkedMinutes*100/weekly.weekRequiredMinutes)) : 0;
  const date = (value:string) => new Date(`${value}T12:00:00+03:00`).toLocaleDateString("ar-SA",{calendar:"gregory",day:"numeric",month:"short"});
  const month = new Date(`${weekly.month}-01T12:00:00+03:00`).toLocaleDateString("ar-SA",{calendar:"gregory",month:"long"});
  const cards = [
    {label:"مهام منجزة",value:String(weekly.completed),background:"#e9f7ef",color:"#126541"},
    {label:"غير مكتملة",value:String(weekly.unfinished),background:"#edf3ff",color:"#254d95"},
    {label:"بانتظار المراجعة",value:String(weekly.pendingReview),background:"#f2edff",color:"#6945a3"},
    {label:"مهام متأخرة",value:String(weekly.overdue),background:"#fff0ef",color:"#ae4541"},
    {label:"ساعات الأسبوع",value:duration(weekly.weekWorkedMinutes),background:"#e9f7fc",color:"#17627d"},
    {label:`ساعات ${month}`,value:duration(weekly.monthWorkedMinutes),background:"#fff5de",color:"#876022"},
  ];
  const tiles = [0,2,4].map(index=>`<tr>${cards.slice(index,index+2).map(card=>`<td width="50%" style="width:50%;padding:4px;vertical-align:top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${card.background};border-radius:14px"><tr><td style="padding:12px 14px;text-align:right;color:${card.color}"><p style="margin:0;font-size:12px;line-height:1.5">${escape(card.label)}</p><p class="metric" style="margin:4px 0 0;font-size:26px;line-height:1.25;font-weight:bold;white-space:nowrap">${escape(card.value)}</p></td></tr></table></td>`).join("")}</tr>`).join("");
  const quality = [`${weekly.onTime} تسليم ضمن الموعد`,...(weekly.lateSubmissions?[`${weekly.lateSubmissions} تسليم بعد الموعد`]:[]),...(weekly.changesCount?[`${weekly.changesCount} طلب تعديل`]:[]),...(weekly.repeatedChanges?[`${weekly.repeatedChanges} مهام تكرر إرجاعها`]:[])];
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title><style>@media(max-width:480px){.weekly-pad{padding:16px!important}.metric{font-size:20px!important}.weekly-title{font-size:21px!important}}</style></head><body style="margin:0;background:#eef2f7;color:#102b57;font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 10px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border-radius:20px;overflow:hidden;border:1px solid #dde5ef"><tr><td class="weekly-pad" style="padding:20px 24px;background:#102b57;border-top:4px solid #c9a961"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="text-align:right"><p style="margin:0 0 5px;color:#e6cf99;font-size:11px">تواصل النخبة · ${escape(date(weekly.periodStart))} — ${escape(date(weekly.periodEnd))}</p><h1 class="weekly-title" style="margin:0;color:#fff;font-size:24px;line-height:1.5">أسبوعكِ في لمحة</h1><p style="margin:5px 0 0;color:#d5dfed;font-size:13px">${escape(mail.name)}</p></td><td width="64" style="width:64px;vertical-align:middle"><img src="${site}/logo.png" width="60" alt="تواصل النخبة" style="display:block;width:60px;height:auto;background:#fff;border-radius:12px"></td></tr></table></td></tr><tr><td class="weekly-pad" style="padding:18px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${tiles}</table><div style="margin:12px 4px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:11px;color:#62718a;text-align:right">مستهدف الأسبوع <strong style="color:#102b57">${escape(duration(weekly.weekRequiredMinutes))}</strong></td><td style="font-size:11px;color:#62718a;text-align:left">المتبقي <strong style="color:${missing?"#976819":"#126541"}">${escape(duration(missing))}</strong></td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;background:#e9edf4;border-radius:6px;overflow:hidden"><tr>${percent?`<td width="${percent}%" style="height:6px;background:#c9a961;font-size:1px;line-height:6px">&nbsp;</td>`:""}${percent<100?`<td width="${100-percent}%" style="height:6px;font-size:1px;line-height:6px">&nbsp;</td>`:""}</tr></table></div><p style="margin:14px 4px;color:#62718a;font-size:11px;line-height:1.8">${quality.map(escape).join(" · ")}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ec;border-radius:14px;border-right:3px solid #c9a961"><tr><td style="padding:14px 16px;text-align:right"><p style="margin:0 0 4px;color:#917039;font-size:11px;font-weight:bold">رسالة لكِ</p><p style="margin:0;color:#34445c;font-size:13px;line-height:1.9">${escape(feedback)}</p></td></tr></table><p style="margin:18px 0 0;text-align:center"><a href="${site}/employee" style="display:inline-block;padding:11px 30px;background:#102b57;color:#fff;border-radius:10px;text-decoration:none;font-size:13px;font-weight:bold">فتح لوحتي</a></p></td></tr><tr><td style="padding:12px;text-align:center;border-top:1px solid #edf0f5;color:#7d8a9d;font-size:10px"><a href="${site}" style="color:#7d8a9d;text-decoration:none">nukhba.media</a> · بتوقيت الرياض</td></tr></table></td></tr></table></body></html>`;
  const text = [`${mail.name} — أسبوعكِ في لمحة`,`${weekly.periodStart} — ${weekly.periodEnd}`,...cards.map(card=>`${card.label}: ${card.value}`),`مستهدف الأسبوع: ${duration(weekly.weekRequiredMinutes)} · المتبقي: ${duration(missing)}`,quality.join(" · "),feedback,`فتح لوحتي: ${site}/employee`].join("\n\n");
  return {subject,html,text};
}
const taskKinds = new Set([
  "task_created",
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
  knowledge_file: "أُضيف ملف إلى مركز المعرفة وتمت مشاركته معك.",
  task_created: "أُضيفت مهمة جديدة إلى نظام العمل. يمكنك متابعة المسؤول عنها وموعد تسليمها من لوحة إدارة الفريق.",
  task_activity: "تغيرت حالة مهمة في نظام العمل. تفاصيل التغيير والمسؤول عنها متاحة أدناه وفي لوحة إدارة الفريق.",
  attendance_in: "سُجّل حضور أحد أعضاء الفريق. اسم الموظفة ووقت تسجيل الحضور بتوقيت الرياض موضحان أدناه.",
  attendance_out: "سُجّل انصراف أحد أعضاء الفريق. اسم الموظفة ووقت تسجيل الانصراف بتوقيت الرياض موضحان أدناه.",
  attendance_missing_admin: "لم تسجّل الموظفة حضورها حتى الساعة 10 صباحًا بتوقيت الرياض.",
  attendance_missing: "تذكير بتسجيل الحضور لهذا اليوم. إذا بدأت دوامك، افتحي صفحة الحضور والانصراف وسجّلي حضورك.",
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
  if (mail.kind === "weekly_report" && !mail.weeklyReport) throw new Error("Weekly report snapshot missing");
  const weekly = mail.kind === "weekly_report" ? mail.weeklyReport : undefined;
  if (weekly) return renderWeeklyEmail(mail,weekly);
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
  if (mail.body && (!isTask || mail.body !== mail.taskTitle))
    details.unshift(["التفاصيل", mail.body]);
  const label = mail.kind === "knowledge_file" ? "فتح الملف في مركز المعرفة" : isTask
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

// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- The same source is checked by Next TypeScript and Deno.
// @ts-ignore Explicit extension is required by the deployed Deno module loader.
import {performanceFacts,evaluatePerformance,weeklyTaskActivity,type PerformanceEvidence,type PerformanceSummary} from "./workforce-performance.ts";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- Deno deployment requires explicit extension.
// @ts-ignore Deno deployment requires explicit extension.
import {renderPayrollEmail, type PayrollEmail} from "./workforce-payroll-email.ts";
import type {MeetingCalendarSnapshot} from './workforce-meeting-calendar.ts';
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
  payrollReport?: PayrollEmail;
  meetingCalendar?: MeetingCalendarSnapshot;
};
export type WeeklyReport = {
  performanceEvidence?:PerformanceEvidence[];performance?:PerformanceSummary;evidenceVersion?:2;
  periodStart: string; periodEnd: string; asOf: string; month: string;
  completed: number; unfinished: number; pendingReview: number; overdue: number;
  onTime: number; lateSubmissions: number; changesCount: number; repeatedChanges: number;
  weekWorkedMinutes: number; weekRequiredMinutes: number; monthWorkedMinutes: number;
  openTasks: {title:string;dueAt:string|null;pendingReview:boolean}[];
};
const duration = (minutes: number) => `${Math.floor(minutes / 60)} س ${Math.floor(minutes % 60)} د`;
export function normalizeWeeklyReport(report:WeeklyReport):WeeklyReport{
 if(report.evidenceVersion===2)return report;
 if(!report.performanceEvidence)return {...report,onTime:0,lateSubmissions:0,changesCount:0,repeatedChanges:0};
 const now=new Date(report.asOf),facts=performanceFacts(report.performanceEvidence,now);
 return {...report,...weeklyTaskActivity(facts,report.periodStart,now),evidenceVersion:2,performance:evaluatePerformance(facts,report.month,now)};
}
export function weeklyFeedback(report: WeeklyReport) {
  report=normalizeWeeklyReport(report);
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
  weekly=normalizeWeeklyReport(weekly);
  const subject = `${mail.title.replace(/[\r\n]+/g, " ").slice(0,180)} | تواصل النخبة`;
  const feedback = weeklyFeedback(weekly)[0];
  const missing = Math.max(0,weekly.weekRequiredMinutes-weekly.weekWorkedMinutes);
  const percent = weekly.weekRequiredMinutes ? Math.min(100,Math.round(weekly.weekWorkedMinutes*100/weekly.weekRequiredMinutes)) : 0;
  const date = (value:string) => new Date(`${value}T12:00:00+03:00`).toLocaleDateString("ar-SA",{calendar:"gregory",day:"numeric",month:"short"});
  const month = new Date(`${weekly.month}-01T12:00:00+03:00`).toLocaleDateString("ar-SA",{calendar:"gregory",month:"long"});
  const cards = [
    {label:"مهام منجزة",value:String(weekly.completed),background:"#e9f7ef",color:"#126541"},
    {label:"للتنفيذ",value:String(weekly.unfinished),background:"#edf3ff",color:"#254d95"},
    {label:"بانتظار المراجعة",value:String(weekly.pendingReview),background:"#f2edff",color:"#6945a3"},
    {label:"ساعات الأسبوع",value:duration(weekly.weekWorkedMinutes),background:"#e9f7fc",color:"#17627d"},
  ];
  const tiles = [0,2].map(index=>`<tr>${cards.slice(index,index+2).map(card=>`<td width="50%" style="width:50%;padding:4px;vertical-align:top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${card.background};border-radius:14px"><tr><td style="padding:12px 14px;text-align:right;color:${card.color}"><p style="margin:0;font-size:12px;line-height:1.5">${escape(card.label)}</p><p class="metric" style="margin:4px 0 0;font-size:26px;line-height:1.25;font-weight:bold;white-space:nowrap">${escape(card.value)}</p></td></tr></table></td>`).join("")}</tr>`).join("");
  const evaluation=weekly.performance;
  const evaluationHtml=evaluation?`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;background:#f1eefb;border-radius:14px;color:#49346c"><tr><td style="padding:12px 14px;text-align:right;font-size:12px"><strong>أداء ${escape(month)} حتى ${escape(date(weekly.asOf.slice(0,10)))}</strong><p style="margin:5px 0 0;font-size:11px">${evaluation.score===null?`${evaluation.eligible} من 5 مهام موثقة`:"التزام · جودة · إنجاز"}</p></td><td style="padding:12px 14px;text-align:left;font-size:${evaluation.score===null?'12':'26'}px;font-weight:bold">${evaluation.score??"قيد التكوين"}</td></tr><tr><td colspan="2" style="padding:0 14px 12px;text-align:right;font-size:11px">الالتزام ${evaluation.axes.punctuality===null?'—':evaluation.axes.punctuality+'%'} · الجودة ${evaluation.axes.quality===null?'—':evaluation.axes.quality+'%'} · الإنجاز ${evaluation.axes.completion===null?'—':evaluation.axes.completion+'%'}</td></tr></table>`:"";
  const evaluationText=evaluation?`أداء ${month} حتى ${weekly.asOf.slice(0,10)}: ${evaluation.score??'قيد التكوين'} · الالتزام ${evaluation.axes.punctuality??'—'} · الجودة ${evaluation.axes.quality??'—'} · الإنجاز ${evaluation.axes.completion??'—'}`:"";
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title><style>@media(max-width:480px){.weekly-pad{padding:16px!important}.metric{font-size:20px!important}.weekly-title{font-size:21px!important}}</style></head><body style="margin:0;background:#eef2f7;color:#102b57;font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 10px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border-radius:20px;overflow:hidden;border:1px solid #dde5ef"><tr><td class="weekly-pad" style="padding:20px 24px;background:#102b57;border-top:4px solid #c9a961"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="text-align:right"><p style="margin:0 0 5px;color:#e6cf99;font-size:11px">تواصل النخبة · ${escape(date(weekly.periodStart))} — ${escape(date(weekly.periodEnd))}</p><h1 class="weekly-title" style="margin:0;color:#fff;font-size:24px;line-height:1.5">أسبوعكِ في لمحة</h1><p style="margin:5px 0 0;color:#d5dfed;font-size:13px">${escape(mail.name)}</p></td><td width="64" style="width:64px;vertical-align:middle"><img src="${site}/logo.png" width="60" alt="تواصل النخبة" style="display:block;width:60px;height:auto;background:#fff;border-radius:12px"></td></tr></table></td></tr><tr><td class="weekly-pad" style="padding:18px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${tiles}</table><div style="margin:12px 4px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:11px;color:#62718a;text-align:right">مستهدف الأسبوع <strong style="color:#102b57">${escape(duration(weekly.weekRequiredMinutes))}</strong></td><td style="font-size:11px;color:#62718a;text-align:left">المتبقي <strong style="color:${missing?"#976819":"#126541"}">${escape(duration(missing))}</strong></td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;background:#e9edf4;border-radius:6px;overflow:hidden"><tr>${percent?`<td width="${percent}%" style="height:6px;background:#c9a961;font-size:1px;line-height:6px">&nbsp;</td>`:""}${percent<100?`<td width="${100-percent}%" style="height:6px;font-size:1px;line-height:6px">&nbsp;</td>`:""}</tr></table></div><p style="margin:14px 4px;color:#62718a;font-size:11px;line-height:1.8">${escape(`ساعات ${month}: ${duration(weekly.monthWorkedMinutes)}`)}${weekly.overdue?` · ${weekly.overdue} مهام تحتاج متابعة`:""}</p>${evaluationHtml}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ec;border-radius:14px;border-right:3px solid #c9a961"><tr><td style="padding:14px 16px;text-align:right"><p style="margin:0 0 4px;color:#917039;font-size:11px;font-weight:bold">رسالة لكِ</p><p style="margin:0;color:#34445c;font-size:13px;line-height:1.9">${escape(feedback)}</p></td></tr></table><p style="margin:18px 0 0;text-align:center"><a href="${site}/employee" style="display:inline-block;padding:11px 30px;background:#102b57;color:#fff;border-radius:10px;text-decoration:none;font-size:13px;font-weight:bold">فتح لوحتي</a></p></td></tr><tr><td style="padding:12px;text-align:center;border-top:1px solid #edf0f5;color:#7d8a9d;font-size:10px"><a href="${site}" style="color:#7d8a9d;text-decoration:none">nukhba.media</a> · بتوقيت الرياض</td></tr></table></td></tr></table></body></html>`;
  const text = [`${mail.name} — أسبوعكِ في لمحة`,`${weekly.periodStart} — ${weekly.periodEnd}`,...cards.map(card=>`${card.label}: ${card.value}`),`مستهدف الأسبوع: ${duration(weekly.weekRequiredMinutes)} · المتبقي: ${duration(missing)}`,`ساعات ${month}: ${duration(weekly.monthWorkedMinutes)}`,evaluationText,...(weekly.overdue?[`${weekly.overdue} مهام تحتاج متابعة`]:[]),feedback,`فتح لوحتي: ${site}/employee`].join("\n\n");
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
// Keep the complete event in the portal; mail contains a readable excerpt only.
// This does not limit stored task descriptions or review decisions.
export function workforceEmailContent(mail: WorkforceMail) {
  const clean = (value: string) => value.replace(/\r\n?/g, "\n").trim();
  const title = clean(mail.title).replace(/\n/g, " ");
  const task = taskKinds.has(mail.kind) ? clean(mail.taskTitle || "") : "";
  const lines = clean(mail.body || "").split("\n");
  while (lines.length && (!lines[0].trim() || [title, task].includes(lines[0].trim()))) lines.shift();
  const body = lines.join("\n").trim();
  const shorten = (value: string, limit: number) => value.length > limit
    ? value.slice(0, limit).trimEnd() + "…" : value;
  return {
    title,
    subject: `${shorten(task && !title.includes(task) ? `${title} · ${task}` : title, 140)} | تواصل النخبة`,
    body: shorten(body, 900),
    abbreviated: body.length > 900,
    deliverable: shorten(clean(mail.deliverable || ""), 350),
  };
}
const nextAction: Record<string, string> = {
  assigned: "راجعي المطلوب وموعد التسليم.",
  due_24h: "راجعي المتبقي وشاركي أي عائق داخل المهمة.",
  due_2h: "أرسلي التسليم للمراجعة عند اكتماله.",
  overdue: "حدّثي حالة المهمة وشاركي موعد الإنجاز.",
  submitted: "مراجعة التسليم واعتماده أو إعادته للتعديل.",
  changes: "عدّلي المخرجات حسب الملاحظات ثم أعيدي التسليم.",
  attendance_missing: "إذا بدأتِ العمل، سجّلي حضورك.",
  attendance_missing_admin: "مراجعة حضور الموظفة أو طلبات إجازتها.",
  approval_reminder: "مراجعة العناصر المعلقة واتخاذ القرار.",
  welcome: "أهلًا بكِ في تواصل النخبة. ابدئي من لوحتكِ.",
  meeting_reminder: "الانضمام من نفس جهاز ومتصفح تسجيل الحضور يفعّل حماية جلسة الدوام أثناء الاجتماع.",
  meeting_event: "يفتح رابط الانضمام الاجتماع في المتصفح خلال موعده.",
};
export function renderWorkforceEmail(mail: WorkforceMail) {
  if (mail.kind === "monthly_payroll") {
    if (!mail.payrollReport) throw new Error("Payroll report snapshot missing");
    return renderPayrollEmail(mail.name,mail.payrollReport);
  }
  if (mail.kind === "weekly_report" && !mail.weeklyReport) throw new Error("Weekly report snapshot missing");
  const weekly = mail.kind === "weekly_report" ? mail.weeklyReport : undefined;
  if (weekly) return renderWeeklyEmail(mail,weekly);
  const guestLink = mail.kind === "meeting_guest" && /^https:\/\/(?:[a-z0-9-]+\.)?zoom\.us\/j\/[0-9]{9,11}(?:\?pwd=[A-Za-z0-9._~-]+)?$/.test(mail.href);
  let browserGuestURL = mail.href;
  const guestSiteLink=mail.kind==='meeting_guest'&&/^https:\/\/nukhba\.media\/meetings\/invite\/[0-9a-f-]{36}\?expires=\d{10}&token=[A-Za-z0-9_-]{43}$/i.test(mail.href);
  if(guestLink){const url=new URL(mail.href);url.pathname=`/wc/${url.pathname.split('/')[2]}/join`;url.searchParams.set('prefer','1');browserGuestURL=url.href;}
  let href = guestSiteLink ? mail.href : guestLink ? browserGuestURL : mail.kind === "meeting_guest" ? site + "/meetings" : /^\/(employee|admin\/workforce)(\/|\?|$)/.test(mail.href)
    ? site + mail.href
    : site + "/employee";
  const meetingMail=["meeting_reminder","meeting_event"].includes(mail.kind);
  if(meetingMail&&!/ألغي|إلغاء/.test(mail.title)){
    const url=new URL(href),meeting=url.searchParams.get('meeting');
    if(/^\/(employee|admin\/workforce)\/meetings$/.test(url.pathname)&&meeting&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(meeting)){url.searchParams.set('join','1');href=url.href;}
  }
  const isTask = taskKinds.has(mail.kind) && !!mail.taskTitle;
  const content = workforceEmailContent(mail);
  const message = nextAction[mail.kind] || "";
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
        ["التسليم — بتوقيت الرياض", date],
        ["المطلوب تسليمه", ["assigned", "updated"].includes(mail.kind) ? content.deliverable : ""],
      ].filter((row): row is [string, string] => !!row[1])
    : [];
  if (content.body) details.push(["changes", "approved"].includes(mail.kind) ? ["ملاحظات المراجعة", content.body] : ["التفاصيل", content.body]);
  const admin = mail.href.startsWith("/admin/workforce");
  const label = ["employee_request", "profile_request"].includes(mail.kind)
    ? admin ? "مراجعة الطلب" : "عرض الطلب"
    : mail.kind === "meeting_guest" ? /ألغي|إلغاء/.test(mail.title) ? "تفاصيل الاجتماع" : guestLink||guestSiteLink ? "الانضمام للاجتماع" : "تواصل النخبة"
    : meetingMail ? /ألغي|إلغاء/.test(mail.title) ? "تفاصيل الاجتماع" : "الانضمام من المتصفح"
    : mail.kind.startsWith("attendance_") ? "عرض الحضور"
    : ["payroll", "compensation"].includes(mail.kind) ? "عرض المستحقات"
    : mail.kind === "knowledge_file" ? "فتح الملف في مركز المعرفة" : isTask
    ? "فتح المهمة"
    : mail.href.startsWith("/admin/workforce")
      ? "فتح لوحة الموظفين"
      : "فتح بوابتي الوظيفية";
  const subject = content.subject;
  const text = [
    `مرحبًا ${mail.name}،`,
    content.title,
    message,
    ...details.map(([k, v]) => `${k}: ${v}`),
    content.abbreviated ? "بقية التفاصيل داخل النظام." : "",
    `${label}: ${href}`,
    "تواصل النخبة · إشعار من نظام العمل",
  ].filter(Boolean).join("\n\n");
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background:#f4f6fa;font-family:Tahoma,Arial,sans-serif;color:#0e2855;direction:rtl;text-align:right"><div style="display:none;max-height:0;overflow:hidden">${escape(mail.title)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border-radius:16px;border-top:5px solid #c9a961;overflow:hidden"><tr><td align="center" style="padding:16px;border-bottom:1px solid #e8edf4"><img src="${site}/logo.png" width="88" alt="تواصل النخبة" style="display:block;max-width:88px;height:auto"></td></tr><tr><td dir="rtl" style="padding:20px;text-align:right"><p style="margin:0 0 16px;font-size:15px">مرحبًا ${escape(mail.name)}،</p><h1 style="margin:0 0 16px;font-size:22px;line-height:1.6">${escape(content.title)}</h1>${message ? `<p style="font-size:14px;line-height:1.8;color:#43536b">${escape(message)}</p>` : ""}${details.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fc;border-radius:12px"><tr><td dir="rtl" style="padding:14px;text-align:right">${details.map(([key, value]) => `<p style="margin:0 0 4px;font-size:12px;color:#65748b">${escape(key)}</p><p style="margin:0 0 16px;font-size:14px;line-height:1.8;white-space:pre-line;overflow-wrap:anywhere;word-break:break-word">${escape(value)}</p>`).join("")}</td></tr></table>` : ""}<p style="margin:24px 0"><a href="${escape(href)}" style="display:inline-block;background:#0e2855;color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:bold">${label}</a></p>${content.abbreviated ? `<p style="font-size:12px;color:#65748b">بقية التفاصيل داخل النظام.</p>` : ""}</td></tr><tr><td align="center" style="padding:12px;background:#f8f5ee;font-size:12px;line-height:1.8;color:#65748b"><strong style="color:#0e2855">تواصل النخبة</strong><br>إشعار من نظام العمل · <a href="${site}" style="color:#0e2855">nukhba.media</a></td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}

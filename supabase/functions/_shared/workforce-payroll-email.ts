export type PayrollEmail = {
  month: string; startDate: string; periodStart: string; periodEnd: string;
  gross: string; attendance: string; insurance: string; otherDeductions: string;
  net: string; attendanceThrough: string | null; source: "statement" | "projection";
};
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const date = (s: string) => new Date(`${s}T12:00:00+03:00`).toLocaleDateString("ar-SA", {calendar:"gregory",day:"numeric",month:"long",year:"numeric"});
const money = (s: string) => {
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error("Invalid payroll amount");
  return `${Number(s).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})} ريال`;
};
export function renderPayrollEmail(name: string, p: PayrollEmail) {
  for (const value of [p.gross,p.attendance,p.insurance,p.otherDeductions,p.net]) money(value);
  const cents = (s:string) => Math.round(Number(s)*100);
  if(cents(p.gross)-cents(p.attendance)-cents(p.insurance)-cents(p.otherDeductions)!==cents(p.net)) throw new Error("Payroll totals do not reconcile");
  const month = new Date(`${p.month}-01T12:00:00+03:00`).toLocaleDateString("ar-SA",{calendar:"gregory",month:"long",year:"numeric"});
  const subject = `ملخص مستحقات راتب ${month} | تواصل النخبة`;
  const rows = [
    ["تاريخ المباشرة",date(p.startDate)],
    ["فترة الاستحقاق",`${date(p.periodStart)} — ${date(p.periodEnd)}`],
    ["المستحق عن الفترة",money(p.gross)],
    ["خصم الحضور",money(p.attendance)],
    ["خصم التأمينات الاجتماعية",money(p.insurance)],
    ...(Number(p.otherDeductions)>0?[["استقطاعات أخرى",money(p.otherDeductions)]]:[]),
    ["صافي المستحق",money(p.net)],
  ];
  const note = p.source === "projection" ? "تقدير وفق الراتب والبيانات المسجلة في الموقع وقت إعداد الإشعار، ويخضع لاعتماد كشف الشهر." : "وفق بيانات كشف الشهر المسجلة في الموقع وقت إعداد الإشعار.";
  const attendanceNote = Number(p.attendance)>0 && p.attendanceThrough ? `تسوية الحضور المسجلة حتى ${date(p.attendanceThrough)}.` : "";
  const text = [`الأستاذة ${name}،`,`تحية طيبة،`,`نوضح لكِ مستحقات شهر ${month} وفق تاريخ مباشرتكِ:`,...rows.map(([a,b])=>`${a}: ${b}`),note,attendanceNote,"هذا الإشعار ملخص للمستحقات ولا يؤكد إتمام الإيداع البنكي.","مع التحية،","شركة تواصل النخبة للدعاية والإعلان","https://nukhba.media/employee/finance/overview"].filter(Boolean).join("\n\n");
  const table = rows.map(([label,value],i)=>`<tr style="background:${i===rows.length-1?'#102b57':i%2?'#f4f6fa':'#ffffff'};color:${i===rows.length-1?'#ffffff':'#102b57'}"><th scope="row" align="right" style="padding:14px 12px;text-align:right;font-weight:${i===rows.length-1?'bold':'normal'};font-size:14px;border-bottom:1px solid #e8edf4">${esc(label)}</th><td align="left" style="padding:14px 12px;text-align:left;font-weight:bold;font-size:14px;border-bottom:1px solid #e8edf4"><span dir="auto">${esc(value)}</span></td></tr>`).join("");
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head><body dir="rtl" style="margin:0;background:#eef2f7;direction:rtl;text-align:right;font-family:Tahoma,Arial,sans-serif;color:#102b57"><table role="presentation" width="100%" dir="rtl" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 10px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border-top:5px solid #c9a961"><tr><td dir="rtl" style="padding:24px;background:#102b57;color:#ffffff;text-align:right"><p style="margin:0 0 8px;color:#e4cc94;font-size:13px">شركة تواصل النخبة للدعاية والإعلان</p><h1 style="margin:0;font-size:23px;line-height:1.6">ملخص مستحقات ${esc(month)}</h1></td></tr><tr><td dir="rtl" style="padding:24px;text-align:right"><p style="font-size:15px;line-height:1.8">الأستاذة ${esc(name)}،<br>تحية طيبة،</p><p style="font-size:14px;line-height:1.9">نوضح لكِ مستحقات الشهر وفق تاريخ مباشرتكِ:</p><table dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;direction:rtl">${table}</table><p style="font-size:12px;line-height:1.9;color:#62718a">${esc(note)}${attendanceNote?`<br>${esc(attendanceNote)}`:''}<br>هذا الإشعار ملخص للمستحقات ولا يؤكد إتمام الإيداع البنكي.</p><p style="margin:24px 0"><a href="https://nukhba.media/employee/finance/overview" style="display:inline-block;background:#102b57;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:8px">عرض مستحقاتي</a></p><p style="font-size:13px;line-height:1.8">مع التحية،<br>شركة تواصل النخبة للدعاية والإعلان</p></td></tr><tr><td style="padding:14px;text-align:center;background:#faf6ec;color:#6b7280;font-size:11px">إشعار خاص بالموظفة · nukhba.media</td></tr></table></td></tr></table></body></html>`;
  return {subject,html,text};
}

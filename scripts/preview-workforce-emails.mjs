// Render-only previews: no database, queue, provider or outbound delivery imports.
import {mkdir,writeFile} from 'node:fs/promises';
import {renderWorkforceEmail} from '../supabase/functions/_shared/workforce-email.ts';
const directory=new URL('../.preview/notification-review/',import.meta.url);
await mkdir(directory,{recursive:true});
const task={email:'preview@example.com',name:'نور',taskTitle:'إعداد استراتيجية الشركة',href:'/employee/work/tasks',dueAt:'2026-10-31T14:00:00Z',createdAt:'2026-10-23T09:00:00Z'};
const examples=[
 ['assigned','إسناد مهمة',{...task,kind:'assigned',title:'أُسندت إليك مهمة جديدة',body:task.taskTitle,deliverable:'ملف الاستراتيجية: الأهداف، الخدمات، العملاء المستهدفون، خطة التنفيذ ومؤشرات الأداء.'}],
 ['state','تغيير الحالة',{...task,kind:'state',title:'تغيرت حالة مهمتك',body:task.taskTitle+'\nالحالة السابقة: جديدة\nالحالة الجديدة: قيد التنفيذ'}],
 ['changes','إعادة للتعديل',{...task,kind:'changes',title:'مهمتك تحتاج تعديلًا',body:task.taskTitle+'\nيرجى تحديد مؤشرات الأداء وإضافة جدول التنفيذ.\nمرفقات المراجعة:\nملاحظات الاستراتيجية.pdf'}],
 ['request','قرار طلب',{...task,taskTitle:null,name:'منوه',kind:'employee_request',title:'تم اعتماد طلب خارج دوام',body:'الموظفة: منوه\nنوع الطلب: خارج دوام\nالطلب: استكمال خطة المحتوى\nالفترة: 2026-10-24 17:00 — 2026-10-24 19:00 (الرياض)\nالمبلغ: 46.67 ر.س\nسبب القرار: معتمد لاستكمال الخطة.',href:'/employee/requests/history'}],
 ['attendance','تسجيل الحضور',{...task,taskTitle:null,kind:'attendance_in',name:'المدير',title:'تسجيل حضور موظفة',body:'منوه\nالوقت بتوقيت الرياض: 2026-10-24 09:00',href:'/admin/workforce/attendance'}],
];
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
for(const [key,,mail] of examples) await writeFile(new URL(key+'.html',directory),renderWorkforceEmail(mail).html);
await writeFile(new URL('index.html',directory),`<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>معاينة رسائل الفريق</title><style>body{margin:0;background:#102b57;color:#fff;font:16px Tahoma,Arial}header{padding:24px;max-width:1100px;margin:auto}h1{font-size:24px}main{max-width:1100px;margin:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;padding:0 16px 32px}section{background:#fff;color:#102b57;border-radius:18px;overflow:hidden}h2,p{padding:0 20px}h2{font-size:17px}p{font-size:12px;color:#62718a;line-height:1.8}iframe{width:100%;height:810px;border:0;background:#f4f6fa}a{color:#102b57}</style><header><h1>رسائل الفريق</h1><div>معاينة محلية فقط · لم تُرسل أي رسالة</div></header><main>${examples.map(([key,label,mail])=>`<section><h2>${label}</h2><p>${escape(renderWorkforceEmail(mail).subject)} · <a href="${key}.html">فتح المعاينة</a></p><iframe title="${label}" src="${key}.html"></iframe></section>`).join('')}</main></html>`);
console.log('Rendered five local mail previews; nothing sent.');

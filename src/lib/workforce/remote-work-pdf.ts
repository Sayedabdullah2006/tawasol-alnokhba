import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {Resvg} from '@resvg/resvg-js';
import {PDFDocument} from 'pdf-lib';
import {remoteMinutes,type RemoteQuote,type RemoteSignature} from './remote-work';
const esc=(s:unknown)=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const text=(s:unknown,x:number,y:number,size=20,color='#183452',bold=false)=>`<text x="${x}" y="${y}" font-family="Noto Sans Arabic" font-size="${size}" font-weight="${bold?700:400}" text-anchor="end" fill="${color}">${esc(s)}</text>`;
const date=(s:string)=>new Date(s+'T12:00:00+03:00').toLocaleDateString('ar-SA',{calendar:'gregory',year:'numeric',month:'long',day:'numeric'});
const money=(s:string)=>`${Number(s).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})} ريال`;
function lines(s:string,max=93){const words=s.split(/\s+/),out:string[]=[];let line='';for(const word of words){if((line+' '+word).length>max&&line){out.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)out.push(line);return out;}
export async function renderRemoteAgreement(q:RemoteQuote,signature:RemoteSignature=[],stamp?:string,decision?:{status:string;at:string|null;reason:string|null},preview=false){
 const logo=`data:image/png;base64,${(await readFile(path.join(process.cwd(),'public/logo.png'))).toString('base64')}`;
 const pages:string[]=[];let y=205,body='';
 const header=(page:number)=>`<rect width="1190" height="1684" fill="#fff"/><rect width="1190" height="145" fill="#112b4d"/><image x="55" y="22" width="85" height="100" href="${logo}"/>${text('اتفاق مؤقت للعمل عن بُعد بساعات وأجر مخفضين',1130,66,31,'#edcf8d',true)}${text('تواصل النخبة · ملحق محدد المدة بعقد العمل',1130,109,20,'#fff')}<path d="M55 155 H1135" stroke="#bb9650" stroke-width="3"/>${text(`صفحة ${page} · ${q.ready?'نسخة للمراجعة والتوقيع':'معاينة غير قابلة للإصدار · بيانات ناقصة'}`,1130,1638,17,'#63758a')}${text(`مرجع النسخة: ${q.hash}`,1130,1665,14,'#63758a')}`;
 function flush(){pages.push(header(pages.length+1)+body+(preview?`<rect x="55" y="1555" width="1080" height="42" fill="#fff3cc"/>${text('معاينة معزولة فقط · الاتفاق والتوقيع غير نافذين · لا يغير بيانات الموظفة',1120,1584,18,'#855f16',true)}`:''));body='';y=205;}
 function line(s:string,size=20,bold=false){if(y>1540)flush();body+=text(s,1128,y,size,'#183452',bold);y+=35;}
 function paragraph(s:string){const rows=lines(s);if(y+rows.length*35>1540)flush();for(const v of rows)line(v);y+=8;}
 function heading(s:string){if(y>1360)flush();body+=`<rect x="55" y="${y-27}" width="1080" height="42" rx="6" fill="#eef2f7"/>`+text(s,1115,y,22,'#173958',true);y+=51;}
 function salaryTable(){
  const rows=[['الراتب الأساسي',first.basic,first.basic],['بدل السكن',first.housing,first.housing],['بدل النقل',first.transport_allowance??'0','0'],['بدل المهام الإضافية الثابت',first.extra_allowance??'0','0']];
  const rest=Number(first.agreed_monthly)-Number(first.basic)-Number(first.housing);if(rest>0)rows.push(['بدلات أخرى غير مشمولة',String(rest),String(rest)]);
  rows.push(['إجمالي الراتب الثابت',first.original_monthly,first.agreed_monthly]);
  if(y+55+rows.length*47>1530)flush();
  body+=`<rect x="55" y="${y-28}" width="1080" height="48" rx="5" fill="#173958"/>`+text('البيان',1115,y,20,'#fff',true)+text('قبل الاتفاق · شهريًا',730,y,19,'#fff',true)+text('خلال الاتفاق · مكافئ شهري',370,y,19,'#fff',true);y+=47;
  rows.forEach((r,i)=>{const total=i===rows.length-1;body+=`<rect x="55" y="${y-28}" width="1080" height="47" fill="${total?'#fff2ce':i%2?'#f3f6fa':'#fff'}"/><path d="M55 ${y+19} H1135" stroke="#d9e1eb"/>`+text(r[0],1115,y,19,'#173958',total)+text(money(r[1]),730,y,19,'#173958',total)+text(money(r[2]),370,y,19,'#173958',total);y+=47;});y+=18;
 }
 const company=q.company,first=q.days[0];
 heading('١ · بيانات الطرفين والعقد');
 paragraph(`${company?.legal_name??'بيانات المنشأة غير مكتملة'} · الرقم الوطني الموحد: ${company?.unified_number??'—'}`);
 paragraph(`عنوان المنشأة: ${company?.address??'—'} · الممثل: ${company?.representative??'—'}`);
 paragraph(`بريد المنشأة: ${company?.email??'—'} · الهاتف: ${company?.phone??'—'}`);
 paragraph(`الموظفة: ${q.employee.full_name} · الهوية/الإقامة: ${q.employee.national_id}`);
 paragraph(`المسمى: ${q.employee.job_title} · رقم عقد العمل: ${q.contract_number??'غير موثق بعد'}`);
 paragraph(`عنوان الموظفة: ${q.employee.address} · المدينة: ${q.employee.city}`);
 paragraph(`البريد: ${q.employee.email} · الجوال: ${q.employee.phone}`);
 heading('٢ · الفترة والعمل المتفق عليه');
 paragraph(`الفترة من ${date(q.starts_on)} إلى نهاية ${date(q.ends_on)}، وعددها ${q.calendar_days} يوم تقويم. العودة التلقائية للشروط السابقة بتاريخ ${date(q.returns_on)}.`);
 paragraph(`مكان العمل عن بُعد: ${q.location}. سبب الطلب: ${q.reason}`);
 paragraph(`ساعات العمل المطلوبة في أيام العمل: ${remoteMinutes(first.required_minutes)} بدلًا من ${remoteMinutes(first.regular_minutes)}، من الساعة ${q.starts_time.slice(0,5)} حتى ${first.ends_time.slice(0,5)} بتوقيت الرياض. تُقرب الساعات المطلوبة لأعلى دقيقة.`);
 paragraph(`المهام الأساسية خلال الفترة: ${q.duties}`);
 paragraph('تستمر أيام العمل والراحة وفق الجدول المعتمد. تلتزم الموظفة بالحضور والانصراف وتأكيد الجلسة وأداء المهام الأساسية والسرية. يتوقف تكليفها بالمهام الإضافية المقابلة للبدل الموقوف خلال الفترة.');
 heading('٣ · الأجر والأثر المالي');
 paragraph('يتفق الطرفان على إيقاف صرف بدل النقل وبدل المهام الإضافية الثابت بنسبة ١٠٠٪ خلال الفترة فقط، مقابل عدم الحاجة إلى التنقل وعدم التكليف بالمهام الإضافية المقابلة للبدل.');
 salaryTable();
 paragraph('يبقى الراتب الأساسي وبدل السكن دون تخفيض، وبمجموع لا يقل عن ٤٬٠٠٠ ريال شهريًا قبل الاستقطاعات النظامية.');
 paragraph(`إجمالي أجر الفترة قبل الاتفاق: ${money(q.original_amount)}. قيمة البدلات الموقوفة للفترة: ${money(q.adjustment_amount)}. أجر الفترة المتفق عليه قبل التأمينات والتسويات النظامية: ${money(q.agreed_amount)}.`);
 paragraph('تخفض الساعات بنسبة الانخفاض الفعلية في إجمالي الراتب الثابت، ولا يعامل الفرق المعتمد كغياب أو يحسب مرتين. تحسب أجزاء الشهر بأجره اليومي المعتمد؛ وللشهر الكامل لا يتجاوز إيقاف البدلات قيمتها الشهرية.');
 const denominators=[...new Set(q.days.map(v=>Math.round(Number(v.original_monthly)/Number(v.original))))];paragraph(denominators.length===1?`طريقة احتساب الفترة: الأجر الشهري والبدلات الشهرية ÷ ${denominators[0]} × عدد أيام التقويم المشمولة. قيمة الأجر والبدلات لكل يوم مثبتة في النسخة المعتمدة.`:'طريقة احتساب الفترة: مجموع الأجر اليومي والبدلات اليومية للأيام المشمولة بكل شهر؛ الشهر الكامل يساوي أجره الشهري، وشهر المباشرة الجزئي وفق القسمة على ٣٠.');
 paragraph('لا يشمل الإيقاف العمولات المكتسبة أو المصروفات المعتمدة أو الحقوق السابقة. التأمينات والإجازات والعمل الإضافي وبقية الحقوق وفق الأنظمة والعقد، ولا تتغير نسبتها تلقائيًا بموجب هذا الاتفاق.');
 heading('٤ · السريان والعودة');
 paragraph('يسري الاتفاق بعد توقيع الموظفة واعتماد المدير وقبل بداية الفترة فقط، ولا يطبق بأثر رجعي. تعود شروط الأجر والساعات والمكان السابقة تلقائيًا بعد نهايتها، دون تجديد ضمني. أي تمديد أو تغيير يحتاج اتفاقًا جديدًا وموافقة الطرفين.');
 heading('٥ · إقرار الموظفة');paragraph('أقر بأنني اطلعت على هذا الاتفاق والفترة والمهام والساعات والمبالغ الموضحة فيه، وفهمت أثره المالي، وأوافق عليه بإرادتي. كما أوافق على إيقاف بدل النقل وبدل المهام الإضافية الثابت وعدم تكليفي بالمهام الإضافية المقابلة له خلال الفترة المحددة فقط، وعلى العودة التلقائية للشروط السابقة.');paragraph('تبقى أحكام عقد العمل الأصلية سارية فيما لم يعدله هذا الاتفاق، بما يتوافق مع نظام العمل.');
 heading('٦ · التوقيع والاعتماد');
 if(y>1295)flush();
 body+=`<rect x="610" y="${y}" width="520" height="150" rx="8" fill="#fafbfc" stroke="#c6d0dd"/>`+text('توقيع الموظفة',1110,y+30,19,'#173958',true);
 const paths=signature.map(stroke=>`<path d="${stroke.map((pt,i)=>`${i?'L':'M'}${630+pt[0]*.47},${y+47+pt[1]*.28}`).join(' ')}" fill="none" stroke="#173958" stroke-width="2.2" stroke-linecap="round"/>`).join('');body+=paths;
 body+=`<rect x="55" y="${y}" width="520" height="150" rx="8" fill="#fafbfc" stroke="#c6d0dd"/>`+text('اعتماد المدير',555,y+30,19,'#173958',true)+text(decision?.status==='approved'?'معتمد إلكترونيًا من المدير':decision?.status==='rejected'?'رُفض الطلب · الاتفاق غير نافذ':decision?.status==='cancelled'?'أُلغي الطلب · الاتفاق غير نافذ':'بانتظار اعتماد المدير',555,y+79,20)+text(decision?.at?new Date(decision.at).toLocaleDateString('ar-SA',{calendar:'gregory',timeZone:'Asia/Riyadh'}):'لا يسري الاتفاق قبل الاعتماد',555,y+115,17);
 y+=182;paragraph(stamp?`وقّعت الموظفة من حسابها بتاريخ ${new Date(stamp).toLocaleString('ar-SA',{calendar:'gregory',timeZone:'Asia/Riyadh'})}.`:'نسخة للمراجعة؛ لا تتضمن توقيعًا نافذًا قبل إرسال الطلب.');
 flush();
 const pdf=await PDFDocument.create();for(const svg of pages){const png=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1190" height="1684">${svg}</svg>`,{font:{fontFiles:[path.join(process.cwd(),'public/fonts/NotoSansArabic-Variable.ttf')],loadSystemFonts:false}}).render().asPng();const page=pdf.addPage([595.28,841.89]);page.drawImage(await pdf.embedPng(png),{x:0,y:0,width:595.28,height:841.89});}
 pdf.setTitle('اتفاق مؤقت للعمل عن بُعد - '+q.employee.full_name);pdf.setAuthor(q.company?.legal_name??'تواصل النخبة');return Buffer.from(await pdf.save());
}

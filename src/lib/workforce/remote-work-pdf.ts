import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {Resvg} from '@resvg/resvg-js';
import {PDFDocument} from 'pdf-lib';
import {remoteMinutes,remoteReturnCommitment,type RemoteQuote,type RemoteSignature} from './remote-work';
import {WorkforceError} from './validation';
const esc=(s:unknown)=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
// Explicit RTL embedding keeps punctuation and labels in reading order; isolate Latin identifiers.
const rtl=(s:unknown)=>'\u202B'+String(s??'—').replace(/\+?[A-Za-z0-9][A-Za-z0-9@._:+/\-]*/g,token=>'\u2066'+token+'\u2069')+'\u202C';
const text=(s:unknown,x:number,y:number,size=20,color='#183452',bold=false)=>`<text x="${x}" y="${y}" font-family="Noto Sans Arabic" font-size="${size}" font-weight="${bold?700:400}" text-anchor="end" fill="${color}">${esc(rtl(s))}</text>`;
const date=(s:string)=>new Date(s+'T12:00:00+03:00').toLocaleDateString('ar-SA',{calendar:'gregory',year:'numeric',month:'long',day:'numeric'});
const money=(s:string)=>`${Number(s).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})} ر.س`;
function lines(s:string,max=108){const out:string[]=[];let line='';for(const word of s.split(/\s+/)){if((line+' '+word).length>max&&line){out.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)out.push(line);return out;}
/** A fixed, readable one-page agreement. Long input is rejected, never clipped or shrunk. */
export async function renderRemoteAgreement(q:RemoteQuote,signature:RemoteSignature=[],stamp?:string,decision?:{status:string;at:string|null;reason:string|null},preview=false){
 const logo=`data:image/png;base64,${(await readFile(path.join(process.cwd(),'public/logo.png'))).toString('base64')}`;
 const first=q.days[0],company=q.company;let body='',y=184;
 function heading(s:string){body+=`<rect x="55" y="${y-24}" width="1080" height="35" rx="6" fill="#eef2f7"/>`+text(s,1115,y,21,'#173958',true);y+=37;}
 function paragraph(s:string,size=19){const bullet=s.startsWith('• ');if(bullet)body+=`<circle cx="1120" cy="${y-6}" r="3" fill="#183452"/>`;for(const row of lines(bullet?s.slice(2):s,bullet?104:108)){body+=text(row,bullet?1104:1125,y,size);y+=27;}y+=3;}
 heading('١ · طرفا الاتفاق');
 paragraph(`${company?.legal_name??'بيانات المنشأة غير مكتملة'} · الرقم الوطني الموحد: ${company?.unified_number??'—'}`);
 paragraph(`الممثل: ${company?.representative??'—'} · العنوان: ${company?.address??'—'}`);
 paragraph(`التواصل: ${company?.email??'—'} · ${company?.phone??'—'}`);
 paragraph(`الموظفة: ${q.employee.full_name} · الهوية/الإقامة: ${q.employee.national_id} · عقد العمل: ${q.contract_number??'غير موثق'}`);
 paragraph(`المسمى: ${q.employee.job_title} · العنوان: ${q.employee.city}، ${q.employee.address}`);
 paragraph(`التواصل: ${q.employee.email} · ${q.employee.phone}`);
 heading('٢ · مدة الاتفاق والعمل');
 paragraph(`من ${date(q.starts_on)} إلى ${date(q.ends_on)} (${q.calendar_days} يوم تقويم) · العودة للشروط السابقة: ${date(q.returns_on)}.`);
 paragraph(`المكان: ${q.location} · سبب الطلب: ${q.reason}`);
 paragraph(`الدوام اليومي: ${remoteMinutes(first.required_minutes)} بدلًا من ${remoteMinutes(first.regular_minutes)} · ${q.starts_time.slice(0,5)} إلى ${first.ends_time.slice(0,5)} بتوقيت الرياض.`);
 paragraph(`المهام الأساسية: ${q.duties}`);
 heading('٣ · الأجر المتفق عليه');
 const rows=[['الراتب الأساسي',first.basic,first.basic],['بدل السكن',first.housing,first.housing],['بدل النقل',first.transport_allowance??'0','0'],['بدل المهام الإضافية الثابت',first.extra_allowance??'0','0']];
 const other=Number(first.agreed_monthly)-Number(first.basic)-Number(first.housing);if(other>0)rows.push(['بدلات أخرى غير مشمولة',String(other),String(other)]);
 rows.push(['إجمالي الراتب الثابت',first.original_monthly,first.agreed_monthly]);
 body+=`<rect x="55" y="${y-25}" width="1080" height="34" rx="5" fill="#173958"/>`+text('البيان',1115,y,19,'#fff',true)+text('قبل الاتفاق · شهريًا',725,y,18,'#fff',true)+text('خلال الاتفاق · مكافئ شهري',370,y,18,'#fff',true);y+=34;
 for(const [i,r] of rows.entries()){const total=i===rows.length-1;body+=`<rect x="55" y="${y-25}" width="1080" height="34" fill="${total?'#fff2ce':i%2?'#f3f6fa':'#fff'}"/>`+text(r[0],1115,y,19,'#173958',total)+text(money(r[1]),725,y,19,'#173958',total)+text(money(r[2]),370,y,19,'#173958',total);y+=34;}y+=10;
 const amounts=[['أجر الفترة قبل الاتفاق',q.original_amount],['البدلات الموقوفة للفترة',q.adjustment_amount],['أجر الفترة المتفق عليه',q.agreed_amount]];
 amounts.forEach(([label,value],i)=>{const x=785-i*365;body+=`<rect x="${x}" y="${y-18}" width="350" height="76" rx="9" fill="${i===2?'#e8f3f1':'#f1f4f8'}"/>`+text(label,x+330,y+5,18,'#4a6178')+text(money(value),x+330,y+37,24,'#173958',true);});y+=83;
 heading('٤ · شروط الاتفاق');
 const denominators=[...new Set(q.days.map(v=>Math.round(Number(v.original_monthly)/Number(v.original))))];
 paragraph('• يوقف بدلا النقل والمهام الإضافية الثابت بنسبة ١٠٠٪ للفترة فقط، مع وقف التنقل والمهام الإضافية المقابلة لهما. الأساسي والسكن محفوظان وبمجموع شهري لا يقل عن ٤٬٠٠٠ ريال.');
 paragraph(`• تخفض الساعات بنسبة الانخفاض الفعلية في إجمالي الراتب وتقرب لأعلى دقيقة؛ الفرق المعتمد لا يعد غيابًا ولا يحتسب مرتين. ${denominators.length===1?`أجر الفترة = الأجر الشهري ÷ ${denominators[0]} × أيام التقويم المشمولة.`:'أجر الفترة هو مجموع الأجر اليومي المعتمد لكل شهر مشمول.'}`);
 paragraph('• مبالغ الأجر قبل التأمينات والتسويات النظامية؛ لا يشمل الإيقاف العمولات المكتسبة أو المصروفات المعتمدة أو الحقوق السابقة. وتبقى أيام الراحة والإجازات والعمل الإضافي وفق العقد والأنظمة.');
 paragraph('• تلتزم الموظفة بالحضور والانصراف وتأكيد الجلسة والمهام والسرية. يسري الاتفاق بتوقيعها واعتماد المدير قبل بدايته، دون أثر رجعي؛ وتعود الشروط السابقة تلقائيًا بعد نهايته. أي تمديد يتطلب اتفاقًا جديدًا.');
 heading('٥ · الإقرار والتوقيع');
 paragraph('أقر باطلاعي على الفترة والمهام والساعات والمبالغ أعلاه، وفهم أثرها المالي وموافقتي عليها بإرادتي. '+remoteReturnCommitment+' وتبقى أحكام عقد العمل سارية فيما لم يعدله هذا الاتفاق، بما يتوافق مع نظام العمل.');
 if(y>1375)throw new WorkforceError('التفاصيل أطول من مساحة الاتفاق ذي الصفحة الواحدة؛ اختصري سبب الطلب والمهام والمكان مع إبقاء المعنى واضحًا.');
 const boxY=y;body+=`<rect x="610" y="${boxY}" width="520" height="130" rx="8" fill="#fafbfc" stroke="#c6d0dd"/><rect x="55" y="${boxY}" width="520" height="130" rx="8" fill="#fafbfc" stroke="#c6d0dd"/>`+text('توقيع الموظفة',1110,boxY+28,19,'#173958',true)+text('اعتماد المدير',555,boxY+28,19,'#173958',true);
 if(signature.length){
  const points=signature.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),width=Math.max(1,Math.max(...xs)-minX),height=Math.max(1,Math.max(...ys)-minY);
  // Fit the saved ink proportionally within the signature area, clear of the label and timestamp.
  const scale=Math.min(470/width,57/height),left=630+(470-width*scale)/2,top=boxY+39+(57-height*scale)/2;
  body+=signature.map(stroke=>`<path d="${stroke.map((pt,i)=>`${i?'L':'M'}${left+(pt[0]-minX)*scale},${top+(pt[1]-minY)*scale}`).join(' ')}" fill="none" stroke="#173958" stroke-width="2.2" stroke-linecap="round"/>`).join('');
 }
 const signed=stamp?new Date(stamp).toLocaleString('ar-SA',{calendar:'gregory',timeZone:'Asia/Riyadh'}):'يوقّع إلكترونيًا من حساب الموظفة';
 body+=text(signed,1110,boxY+115,15)+text(decision?.status==='approved'?'معتمد إلكترونيًا':decision?.status==='rejected'?'مرفوض · غير نافذ':decision?.status==='cancelled'?'ملغى · غير نافذ':'بانتظار اعتماد المدير',555,boxY+72,20)+text(decision?.at?new Date(decision.at).toLocaleDateString('ar-SA',{calendar:'gregory',timeZone:'Asia/Riyadh'}):'لا يسري قبل الاعتماد',555,boxY+110,16);
 const header=`<defs><filter id="white-logo" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/></filter></defs><rect width="1190" height="1684" fill="#fff"/><rect width="1190" height="140" fill="#112b4d"/><image x="1015" y="19" width="115" height="103" filter="url(#white-logo)" href="${logo}"/>${text('اتفاق مؤقت للعمل عن بُعد',970,62,34,'#edcf8d',true)}${text('ملحق محدد المدة بعقد العمل · ساعات وأجر مخفضان',970,105,21,'#fff')}<path d="M55 151 H1135" stroke="#bb9650" stroke-width="3"/>`;
 const footer=(preview?`<rect x="55" y="1550" width="1080" height="36" rx="5" fill="#fff3cc"/>${text('معاينة للمراجعة فقط · الاتفاق والتوقيع غير نافذين · لا تتغير البيانات الحقيقية',1120,1575,16,'#855f16',true)}`:'')+text(`مرجع النسخة: ${q.hash}`,1130,1620,14,'#63758a')+text(q.ready?'صفحة ١ من ١':'معاينة غير قابلة للإصدار · بيانات ناقصة',1130,1650,16,'#63758a');
 const png=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1190" height="1684">${header}${body}${footer}</svg>`,{font:{fontFiles:[path.join(process.cwd(),'public/fonts/NotoSansArabic-Variable.ttf')],loadSystemFonts:false}}).render().asPng();
 const pdf=await PDFDocument.create(),page=pdf.addPage([595.28,841.89]);page.drawImage(await pdf.embedPng(png),{x:0,y:0,width:595.28,height:841.89});pdf.setTitle('اتفاق مؤقت للعمل عن بُعد - '+q.employee.full_name);pdf.setAuthor(company?.legal_name??'تواصل النخبة');return Buffer.from(await pdf.save());
}

import {dateField, textField, WorkforceError} from './validation';
export type RemoteInput={starts_on:string;ends_on:string;starts_time:string;location:string;duties:string;reason:string};
export type RemoteSignature=number[][][];
export type RemoteDay={day:string;amount:string;original:string;basic:string;housing:string;transport_allowance:string;extra_allowance:string;stopped_allowances:string;original_monthly:string;agreed_monthly:string;required_minutes:number;ends_time:string;regular_minutes:number;workday:boolean};
export type RemoteQuote={version:string;employee_id:string;employee:{full_name:string;national_id:string;job_title:string;phone:string;email:string;address:string;city:string;start_date:string;contract_end:string};company:{legal_name:string;unified_number:string;address:string;representative:string;email:string;phone:string;source:string}|null;contract_number:string|null;missing:string[];ready:boolean;starts_on:string;ends_on:string;returns_on:string;starts_time:string;reason:string;location:string;duties:string;calendar_days:number;allowance_stop_percent:number;wage_reduction_percent:number;original_amount:string;adjustment_amount:string;agreed_amount:string;days:RemoteDay[];hash:string};
export type RemoteDetails={snapshot:RemoteQuote;signature:RemoteSignature;signed_at:string;signed_by:string};
export function remoteInput(raw:unknown):RemoteInput{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new WorkforceError('بيانات الاتفاق غير صحيحة');
 const v=raw as Record<string,unknown>;
 if(typeof v.starts_time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.starts_time))throw new WorkforceError('حدد وقت بداية العمل');
 return {starts_on:dateField(v.starts_on)!,ends_on:dateField(v.ends_on)!,starts_time:v.starts_time,location:textField(v.location,'مكان العمل عن بُعد',3,500),reason:textField(v.reason,'سبب الطلب',3,5000),duties:textField(v.duties,'المهام الأساسية',3,5000)};
}
export function remoteSignature(raw:unknown):RemoteSignature{
 if(!Array.isArray(raw)||raw.length<1||raw.length>50)throw new WorkforceError('أكملي رسم توقيع واضح');
 let count=0;
 for(const stroke of raw){if(!Array.isArray(stroke)||stroke.length<2||stroke.length>1000)throw new WorkforceError('التوقيع غير صحيح');for(const pt of stroke){if(!Array.isArray(pt)||pt.length!==2||!pt.every(Number.isFinite)||pt[0]<0||pt[0]>1000||pt[1]<0||pt[1]>300)throw new WorkforceError('نقاط التوقيع غير صحيحة');count++;}}
 if(count<10||count>3000)throw new WorkforceError('أكملي رسم توقيع واضح');return raw as RemoteSignature;
}
export const remoteMinutes=(n:number)=>`${Math.floor(n/60)} س${n%60?` و${n%60} د`:''}`;
export const remoteMoney=(v:string)=>Number(v).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})+' ر.س';
export const remoteReturnCommitment='وألتزم بالعودة إلى العمل بشكل كامل، وفق مكان العمل وساعات الدوام والشروط السابقة، فور انتهاء الفترة المعتمدة، ما لم يُعتمد اتفاق جديد.';
export const remoteAcknowledgment='اطّلعت على ملف الاتفاق والأرقام والفترة، وأوافق على إيقاف بدل النقل وبدل المهام الإضافية الثابت وإيقاف تكليفي بالمهام الإضافية المحددة خلال الفترة فقط، وعلى الأجر الموضح، مع بقاء ساعات دوامي المعتادة دون تخفيض. '+remoteReturnCommitment;
export const remoteAcknowledgmentForQuote=(q:RemoteQuote)=>q.days[0].required_minutes===q.days[0].regular_minutes?remoteAcknowledgment:'اطّلعت على ملف الاتفاق والأرقام والفترة، وأوافق على إيقاف بدل النقل وبدل المهام الإضافية الثابت وإيقاف تكليفي بالمهام الإضافية المحددة خلال الفترة فقط، وعلى الساعات والأجر الموضحين. '+remoteReturnCommitment;

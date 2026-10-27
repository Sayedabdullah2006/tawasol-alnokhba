export const UNPAID_LEAVE_NOTICE='يُرجى التأكد من المدة المطلوبة؛ بعد موافقة المدير تصبح الإجازة نهائية ولا يمكن إلغاؤها أو التراجع عنها. تُخصم قيمة جميع أيام الفترة المعتمدة من مستحقاتك، بما فيها أيام الراحة.';
export function requireUnpaidLeaveAcknowledgment(kind:string,type:string,acknowledged:unknown){
 if(kind==='leave'&&type==='unpaid'&&acknowledged!=='true')throw new Error('أكّدي اطلاعك على خصم فترة الإجازة غير المدفوعة قبل إرسال الطلب');
}
export type UnpaidLeaveEstimate={calendar_days:number;amount:string;starts_on:string;ends_on:string};
export function unpaidLeaveDates(starts:string,ends:string){
 const day=(value:string)=>{const n=Date.parse(value);if(!Number.isFinite(n))throw Error('فترة الإجازة غير صحيحة');return new Date(n+3*3600000).toISOString().slice(0,10);};
 return {p_starts:day(starts),p_ends:day(ends)};
}

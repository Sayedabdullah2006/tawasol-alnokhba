export const UNPAID_LEAVE_NOTICE='يُرجى التأكد من المدة المطلوبة؛ بعد موافقة المدير تصبح الإجازة نهائية ولا يمكن إلغاؤها أو التراجع عنها. تُخصم قيمة جميع أيام الفترة المعتمدة من مستحقاتك، بما فيها أيام الراحة.';
export function requireUnpaidLeaveAcknowledgment(kind:string,type:string,acknowledged:unknown){
 if(kind==='leave'&&type==='unpaid'&&acknowledged!=='true')throw new Error('أكّدي اطلاعك على خصم فترة الإجازة غير المدفوعة قبل إرسال الطلب');
}

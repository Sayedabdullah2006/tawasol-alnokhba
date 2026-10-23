export const MEDICAL_REPORT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp';
export const MEDICAL_REPORT_MIMES = ['application/pdf','image/png','image/jpeg','image/webp'];
export const leaveTypeLabel = (type: string | undefined) =>
  type === 'sick' ? 'مرضية' : type === 'unpaid' ? 'بدون راتب' : 'سنوية';
export function requireMedicalReport(kind: string, leaveType: string, files: {mime: string}[]) {
  if (kind === 'leave' && leaveType === 'sick' && !files.some(file => MEDICAL_REPORT_MIMES.includes(file.mime)))
    throw new Error('أرفقي التقرير الطبي بصيغة PDF أو صورة');
}

export const SALES_FILE_LIMIT = 20 * 1024 * 1024;
export const SALES_FILE_BUCKET = 'workforce-sales-files';
export type SalesFile = {id:string;opportunity_id:string;filename:string;mime_type:string;size_bytes:number;purpose:string;created_by:string;created_at:string;canArchive:boolean};
export const salesFilePurposes:Record<string,string> = {general:'مستند عميل',quote:'عرض سعر',contract:'عقد',collection:'إثبات تحصيل'};

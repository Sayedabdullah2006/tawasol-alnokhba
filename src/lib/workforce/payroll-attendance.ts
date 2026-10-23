export type AttendanceSettlement = {
 starts_on: string; through: string | null; required_seconds: number; credited_seconds: number;
 missing_seconds: number; days: number; hourly_rate: string | null; calculated_amount: string;
 applied_amount?: string; unapplied_amount?: string;
 missing_days: {day:string;required_seconds:number;credited_seconds:number;missing_seconds:number;hourly_rate:string}[];
};
export type DailyPayrollAccrual = {
 starts_on:string;through:string|null;as_of:string;closed:boolean;gross_amount:string;
 insurance_amount:string;other_amount:string;attendance_amount:string;total_amount:string;current_credited_seconds:number;
};
export type PayrollCardData = {
 month: string; status: "draft"|"approved"|"paid"; total_amount: string; paid_amount: string;
 gross_amount: string; basic_amount: string; allowances_amount: string; attendance_amount: string;
 attendance_details: AttendanceSettlement;
 deductions?: {kind:"insurance"|"other";amount:string;title?:string;reference?:string}[];
 insurance_details?:{rate:string;basis_amount:string;amount:string;reference:string}|null;
 daily_accrual?:DailyPayrollAccrual;
 overtime_amount?:string;
 reimbursement_amount?:string;
 reimbursements?:ExpenseReimbursement[];
};
export type ExpenseReimbursement={request_id:string;title:string;amount:string;approved_at:string;invoices:{id:string;filename:string;mime_type:string}[]};

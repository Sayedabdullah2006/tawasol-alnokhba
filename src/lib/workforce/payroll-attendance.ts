export type AttendanceSettlement = {
 starts_on: string; through: string | null; required_seconds: number; credited_seconds: number;
 missing_seconds: number; days: number; hourly_rate: string | null; calculated_amount: string;
 applied_amount?: string; unapplied_amount?: string;
 missing_days: {day:string;required_seconds:number;credited_seconds:number;missing_seconds:number;hourly_rate:string}[];
};
export type PayrollCardData = {
 month: string; status: "draft"|"approved"|"paid"; total_amount: string; paid_amount: string;
 gross_amount: string; basic_amount: string; allowances_amount: string; attendance_amount: string;
 attendance_details: AttendanceSettlement;
};

import type {AttendanceSummary,AttendancePeriod} from "./attendance-summary";
import type {PayrollCardData} from "./payroll-attendance";
import type {LeaveBalance} from "./leave";
export type WorkSummary={employee:{id:string;full_name:string};summary:AttendanceSummary;open:AttendancePeriod|null;payroll:PayrollCardData|null;leave:LeaveBalance};

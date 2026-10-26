export type WeeklyHours = {
 enabled:boolean;starts_on?:string;as_of?:string;credited_seconds?:number;applied_seconds?:number;
 current_week?:WeeklyHoursWeek|null;weeks:WeeklyHoursWeek[];
 days:{day:string;week_start:string;required_seconds:number;attendance_seconds:number;base_credited_seconds:number;generated_seconds:number;unused_seconds:number;applied_seconds:number;missing_seconds:number}[];
 transfers:{source_day:string;target_day:string;seconds:number}[];
};
export type WeeklyHoursWeek={starts_on:string;ends_on:string;generated_seconds:number;applied_seconds:number;attendance_seconds:number;credited_seconds:number;target_seconds:number;available_seconds:number;expired_seconds:number};

import {paidHoliday,type PaidCalendarDay} from './calendar';
export const DEFAULT_WORKDAYS = [0, 1, 2, 3, 4, 6];
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export type AttendancePeriod = { checked_in: string; checked_out: string | null;
  credit_request_id?: string | null;
  policy_version?: number; cutoff_at?: string | null; last_seen_at?: string | null;
  next_confirmation_at?: string | null; break_started_at?: string | null; break_paid_until?: string | null;
  unpaid_periods?: {start:string;end:string}[] };
export type AttendanceSummary = ReturnType<typeof summarizeAttendance>;

export function riyadhDate(now: Date) {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
}
export function monthBounds(month: string) {
  const [year, number] = month.split("-").map(Number);
  return {
    first: `${month}-01`,
    next: new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10),
    last: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10),
  };
}
const midnight = (date: string) => Date.parse(`${date}T00:00:00+03:00`);

/** Merge corrections/overlaps, clip overnight shifts, and round only the daily/monthly total. */
export function attendanceEnd(period: AttendancePeriod, now: number) {
  const start = Date.parse(period.checked_in);
  if (period.checked_out) return Math.min(now,Date.parse(period.checked_out));
  let end = Math.min(now,start+DAY);
  if (period.policy_version === 1) {
    end=Math.min(end,Date.parse(period.cutoff_at!));
    const seen=Math.max(Date.parse(period.last_seen_at!),period.break_paid_until?Date.parse(period.break_paid_until):0);
    if(now>=seen+5*MINUTE) end=Math.min(end,seen);
    const confirmation=Date.parse(period.next_confirmation_at!);
    if(!period.break_started_at && now>=confirmation+5*MINUTE) end=Math.min(end,confirmation);
  }
  return end;
}
export function attendanceRanges(period: AttendancePeriod, now: number): number[][] {
  let ranges=[[Date.parse(period.checked_in),attendanceEnd(period,now)]];
  const exclusions=[...(period.unpaid_periods??[])];
  if(period.break_started_at && period.break_paid_until) exclusions.push({start:period.break_paid_until,end:new Date(now).toISOString()});
  for(const exclusion of exclusions) {
    const lo=Date.parse(exclusion.start),hi=Date.parse(exclusion.end);
    ranges=ranges.flatMap(([a,b])=>hi<=a||lo>=b?[[a,b]]:[[a,Math.min(b,lo)],[Math.max(a,hi),b]]).filter(([a,b])=>b>a);
  }
  return ranges;
}
export function workedSeconds(periods: AttendancePeriod[], from: number, until: number, now: number) {
  const ranges = periods.flatMap(period => attendanceRanges(period,now).map(([start,end])=>[Math.max(start,from),Math.min(end,until,now)]))
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a[0] - b[0]);
  let total = 0, previousEnd = from;
  for (const [start, end] of ranges) {
    total += Math.max(0, end - Math.max(start, previousEnd));
    previousEnd = Math.max(previousEnd, end);
  }
  return total / 1000;
}

export function summarizeAttendance({ periods, startDate, month, now, dailyMinutes = 480, workdays = DEFAULT_WORKDAYS, paidCalendarDays = [], excusedDays = [] }: {
  periods: AttendancePeriod[]; startDate: string; month: string; now: Date; dailyMinutes?: number; workdays?: number[]; paidCalendarDays?: PaidCalendarDay[]; excusedDays?: string[];
}) {
  const bounds = monthBounds(month), today = riyadhDate(now);
  const startsOn = startDate > bounds.first ? startDate : bounds.first;
  const from = midnight(startsOn), until = midnight(bounds.next), dayStart = midnight(today);
  let workdayCount = 0,paidHolidayMinutes=0,approvedLeaveMinutes=0;
  const excused=new Set(excusedDays);
  for (let day = from; day < until; day += DAY) {
    if (workdays.includes(new Date(day + 12 * 60 * MINUTE).getUTCDay())) {
      const date=new Date(day+12*60*MINUTE).toISOString().slice(0,10);
      if(paidHoliday(date,paidCalendarDays)){if(date<=today)paidHolidayMinutes+=dailyMinutes;}
      else if(excused.has(date)){if(date<=today)approvedLeaveMinutes+=dailyMinutes;}
      else workdayCount++;
    }
  }
  const monthlySeconds = workedSeconds(periods, from, until, now.getTime());
  const todaySeconds = workedSeconds(periods, Math.max(from, dayStart), Math.min(until, dayStart + DAY), now.getTime());
  const targetMinutes = workdayCount * dailyMinutes;
  const workedMinutes = Math.floor(monthlySeconds / 60), todayMinutes = Math.floor(todaySeconds / 60);
  return {
    month, today, asOf: now.toISOString(), startsOn, endsOn: bounds.last,
    workdayCount, dailyMinutes, targetMinutes, workedMinutes,paidHolidayMinutes,approvedLeaveMinutes,
    remainingMinutes: Math.max(0, targetMinutes - workedMinutes),
    extraMinutes: Math.max(0, workedMinutes - targetMinutes),
    monthlySeconds, todaySeconds, todayMinutes,
    approvedMissingMinutes: Math.floor(workedSeconds(periods.filter(p=>!!p.credit_request_id),from,until,now.getTime())/60),
    todayPeriods: periods.filter(period => {
      if(period.credit_request_id)return false;
      const start = Date.parse(period.checked_in), end = attendanceEnd(period,now.getTime());
      return end > Math.max(from, dayStart) && start < Math.min(until, dayStart + DAY, now.getTime());
    }).length,
    paidHoliday:paidHoliday(today,paidCalendarDays),
    dayOff: !!paidHoliday(today,paidCalendarDays)||!workdays.includes(new Date(`${today}T12:00:00Z`).getUTCDay()),
  };
}

/** Advance only a running session; never count the gaps between check-out and the next check-in. */
export function liveAttendance(summary: AttendanceSummary, open: (Omit<AttendancePeriod,'checked_out'> & {checked_out?:string|null}) | null, now: number) {
  const asOf = Date.parse(summary.asOf), tick = Math.max(asOf, now);
  const bounds = monthBounds(summary.month);
  const period=open?{...open,checked_out:open.checked_out??null}:null;
  const delta = (from: number, until: number) => period ? workedSeconds([period],from,until,tick)-workedSeconds([period],from,until,asOf) : 0;
  const workedMinutes = Math.floor((summary.monthlySeconds + delta(midnight(summary.startsOn), midnight(bounds.next))) / 60);
  const todayMinutes = Math.floor((summary.todaySeconds + delta(Math.max(midnight(summary.startsOn), midnight(summary.today)), midnight(summary.today) + DAY)) / 60);
  return { ...summary, workedMinutes, todayMinutes,
    remainingMinutes: Math.max(0, summary.targetMinutes - workedMinutes),
    extraMinutes: Math.max(0, workedMinutes - summary.targetMinutes),
    needsCorrection: !!open && open.policy_version!==1 && tick > Date.parse(open.checked_in) + DAY,
    isPresent: !!period && !period.checked_out && attendanceEnd(period,tick)>=tick,
  };
}

export function attendanceDuration(minutes: number) {
  const value = Math.max(0, Math.floor(minutes));
  return `${Math.floor(value / 60).toLocaleString("en-US")} س ${value % 60} د`;
}

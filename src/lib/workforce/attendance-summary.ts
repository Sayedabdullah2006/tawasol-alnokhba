export const DEFAULT_WORKDAYS = [0, 1, 2, 3, 4, 6];
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export type AttendancePeriod = { checked_in: string; checked_out: string | null };
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
function workedSeconds(periods: AttendancePeriod[], from: number, until: number, now: number) {
  const ranges = periods.map(period => {
    const start = Date.parse(period.checked_in);
    const end = period.checked_out ? Date.parse(period.checked_out) : Math.min(now, start + DAY);
    return [Math.max(start, from), Math.min(end, until, now)];
  }).filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a[0] - b[0]);
  let total = 0, previousEnd = from;
  for (const [start, end] of ranges) {
    total += Math.max(0, end - Math.max(start, previousEnd));
    previousEnd = Math.max(previousEnd, end);
  }
  return total / 1000;
}

export function summarizeAttendance({ periods, startDate, month, now, dailyMinutes = 480, workdays = DEFAULT_WORKDAYS }: {
  periods: AttendancePeriod[]; startDate: string; month: string; now: Date; dailyMinutes?: number; workdays?: number[];
}) {
  const bounds = monthBounds(month), today = riyadhDate(now);
  const startsOn = startDate > bounds.first ? startDate : bounds.first;
  const from = midnight(startsOn), until = midnight(bounds.next), dayStart = midnight(today);
  let workdayCount = 0;
  for (let day = from; day < until; day += DAY) {
    if (workdays.includes(new Date(day + 12 * 60 * MINUTE).getUTCDay())) workdayCount++;
  }
  const monthlySeconds = workedSeconds(periods, from, until, now.getTime());
  const todaySeconds = workedSeconds(periods, Math.max(from, dayStart), Math.min(until, dayStart + DAY), now.getTime());
  const targetMinutes = workdayCount * dailyMinutes;
  const workedMinutes = Math.floor(monthlySeconds / 60), todayMinutes = Math.floor(todaySeconds / 60);
  return {
    month, today, asOf: now.toISOString(), startsOn, endsOn: bounds.last,
    workdayCount, dailyMinutes, targetMinutes, workedMinutes,
    remainingMinutes: Math.max(0, targetMinutes - workedMinutes),
    extraMinutes: Math.max(0, workedMinutes - targetMinutes),
    monthlySeconds, todaySeconds, todayMinutes,
    todayPeriods: periods.filter(period => {
      const start = Date.parse(period.checked_in), end = period.checked_out ? Date.parse(period.checked_out) : Math.min(now.getTime(), start + DAY);
      return end > Math.max(from, dayStart) && start < Math.min(until, dayStart + DAY, now.getTime());
    }).length,
    dayOff: !workdays.includes(new Date(`${today}T12:00:00Z`).getUTCDay()),
  };
}

/** Advance only a running session; never count the gaps between check-out and the next check-in. */
export function liveAttendance(summary: AttendanceSummary, open: { checked_in: string } | null, now: number) {
  const asOf = Date.parse(summary.asOf), tick = Math.max(asOf, now);
  const end = open ? Math.min(tick, Date.parse(open.checked_in) + DAY) : asOf;
  const bounds = monthBounds(summary.month);
  const delta = (from: number, until: number) => open ? Math.max(0, Math.min(end, until) - Math.max(asOf, Date.parse(open.checked_in), from)) / 1000 : 0;
  const workedMinutes = Math.floor((summary.monthlySeconds + delta(midnight(summary.startsOn), midnight(bounds.next))) / 60);
  const todayMinutes = Math.floor((summary.todaySeconds + delta(Math.max(midnight(summary.startsOn), midnight(summary.today)), midnight(summary.today) + DAY)) / 60);
  return { ...summary, workedMinutes, todayMinutes,
    remainingMinutes: Math.max(0, summary.targetMinutes - workedMinutes),
    extraMinutes: Math.max(0, workedMinutes - summary.targetMinutes),
    needsCorrection: !!open && tick > Date.parse(open.checked_in) + DAY,
  };
}

export function attendanceDuration(minutes: number) {
  const value = Math.max(0, Math.floor(minutes));
  return `${Math.floor(value / 60).toLocaleString("en-US")} س ${value % 60} د`;
}

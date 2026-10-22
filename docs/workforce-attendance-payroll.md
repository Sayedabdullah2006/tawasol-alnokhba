# Automatic attendance settlement

Pending release; requires `20261022213937_linked_work_sessions.sql`, then `20261022221900_automatic_attendance_payroll.sql` and matching application code. Do not migrate production for a preview.

## Rules approved for this release

- Settlement starts in October 2026, clipped to each employee's joining date. Management explicitly approved back-calculating October from the old attendance records.
- Old flexible days retain attendance after 17:00. `payroll_attendance_policy.cutoff_on` defaults to the first full Riyadh day after rollout. The new managed sessions also enforce their own 17:00 cutoff immediately.
- Historical flexible days close at midnight. New days close at 17:00 Riyadh. Neither an unfinished day nor future days create shortages.
- Each completed scheduled day is evaluated separately, with at most the configured daily attendance target credited for ordinary salary. Extra hours on a different day do not erase a shortage; raw attendance and the monthly progress card still preserve all genuinely recorded time.
- Friday/default nonwork days, approved leave, and company paid-calendar exceptions are exempt. Approved permissions merge with attendance to avoid double credit. Test-run requests are excluded.
- Founding Day (22 February) and National Day (23 September) are exempt. Variable Eid/other paid holidays must be populated in `wf_paid_calendar_days` by the company administrator/service before the affected dates. Attendance `daily_minutes` must reflect any reduced schedule applicable to that employee (including Ramadan).
- Hourly rate uses the full contractual monthly basic salary plus fixed allowances, divided by 30 and 8. The effective compensation version for each day is used. An already prorated joining-month statement is never prorated again. Incentives and insurance do not change the hourly rate.
- Missing seconds are multiplied by the unrounded hourly rate; round the month total once to halalas. Merge overlapping periods; preserve the paid 30-minute break and exclude excess break time using the shared attendance credit ranges.
- Amounts are computed and applied automatically without manager approval of the settlement. Existing overall payroll approval/payment recording remains in place.
- Manual insurance/other deductions and incentives remain separate. The automatic adjustment cannot make a net balance negative or reduce it below already recorded payments. Any unapplied excess is visible in the tooltip. Fully paid statements are frozen; historical paid corrections require a separate financial adjustment, not a rewrite of paid history.

## One authoritative ledger

The before-write trigger calculates `attendance_amount`, `attendance_details`, `deductions_amount`, and `total_amount`. Client-supplied totals cannot bypass it. `wf_attendance_payroll_snapshot` validates the actual actor and ownership, refreshes the statement, and returns the same totals used in the employee card, manager payroll editor, finance details, and history. Missing current/past monthly statements initialize silently from fixed salary terms and joining-date proration. Existing monthly basic/allowance snapshots are preserved.

`wf_refresh_attendance_payroll` runs each minute through pg_cron. Foreground cards refresh each minute and after attendance changes. Changes/corrections therefore update without a separate finance approval. Repeated unchanged refreshes do not increment the version or duplicate the audit trail. Payments recalculate under the payroll row lock before validating the payable balance.

Automatic calculation writes only the payroll row and `wf_payroll_attendance_audit`; it never creates a notification or mail job. Normal explicit payroll save/approve/payment notifications retain their existing behavior. No test globally disables real notifications.

All financial records remain owner/admin only. Noor's task-management/review authority does not grant Monwa's financial data. Sensitive RPCs are service-only, validate the actor, and use invoker privileges. Calendar exceptions expose only date/title.

## Preview and verification

```powershell
node --import ./tests/helpers/register-ts.mjs --test tests/workforce-payroll-attendance.test.mjs tests/workforce-work-session.test.mjs tests/workforce-attendance-summary.test.mjs tests/workforce-attendance-export.test.mjs tests/workforce-weekly-report.test.mjs
node --import ./tests/helpers/register-ts.mjs scripts/workforce-session-preview.mjs
```

The localhost preview uses the exact SQL migration in in-memory PostgreSQL. `.preview/payroll-current.json` is an ignored, local, minimal read-only export of the two employees' names, joining dates, salary terms, monthly statement, attendance and open task titles. No passwords, emails, service keys or production write connection are present in the adapter. “الوضع الحالي” is read-only and uses this export; “تجربة التحديث” runs disposable fixtures. Tests close their databases; resetting the preview replaces only its isolated database. No external mail/notification infrastructure is loaded. The actual shared card has no expandable accounting section: details appear on pointer hover/focus on the information icon and dismiss with Escape or pointer exit.

Before release, verify production grants, cron installation/schedules and that paid-calendar exceptions are populated. The fixture covers actual migration functions and realistic constraints, but does not clone every existing production trigger or replace a deployment smoke check.

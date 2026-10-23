# Approved missing work hours

The employee chooses a completed Riyadh work day and the number of missing hours under Requests → Missing hours. Attachments are optional. Only the administrator can approve or reject; the employee may cancel a pending request. The current day becomes eligible after 17:00. Future dates, dates before joining, Fridays, configured days off and official holidays cannot receive ordinary hours through this request.

Approval uses the existing request decision RPC and employee transaction lock. It calculates the union of already credited attendance, paid break rules and approved permission, then checks the requested minutes against the daily target capped at eight hours. Approved leave and fully paid payroll months block approval. Rejection/cancellation create no attendance entries.

The shared attendance ledger receives closed `source='missing-hours'` entries linked by `credit_request_id`. Internal intervals allocate only unoccupied gaps in the 09:00–17:00 accounting window; these are accounting allocations, not observed check-in/out times. Actual punches are preserved. Views label the credits explicitly and hide their accounting timestamps. Excel separates them from actual attendance and groups fragments by request. The same ledger feeds employee/admin dashboards, remaining monthly hours, payroll hour settlement and weekly reporting without a parallel financial balance or extra wage item. Historical eligibility and salary rules remain unchanged.

Retries cannot reapprove a processed request or reinsert an allocation. The database validates the cumulative daily limit after acquiring the employee lock; all allocations and the request decision commit atomically. Subsequent attendance corrections cannot overlap these credits. Leave cannot be approved over existing manual credits without reconciliation. Paid payroll records are not silently rewritten.

Private attendance/request RLS is unchanged. Helpers and posting functions are service-only, security-invoker functions. A genuine approval produces the existing request decision notification with date/hours; it does not also produce a second attendance-correction notification. Financial request types remain unavailable in production test mode.

Tests use disposable PGlite databases and a notification delivery sink, never production records or email workers:

`node --experimental-transform-types --import ./tests/helpers/register-ts.mjs --test tests/workforce-missing-hours.test.mjs tests/workforce-attendance-export.test.mjs`

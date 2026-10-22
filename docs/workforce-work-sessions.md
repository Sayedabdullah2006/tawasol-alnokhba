# Attendance linked to work — release preview

Implemented locally on 23 October 2026. **Not deployed; production schema and employee records are unchanged.**

## Rules

- Riyadh server time determines every transition. New check-ins are rejected at/after 17:00; new-policy sessions stop at 17:00 regardless of browser state.
- Attendance and task time are separate ledgers. Task time is a subset of attendance, never added to it. One open attendance and one active task/activity/break per employee.
- After check-in the employee selects a task using “بدء العمل”, or names an administrative activity. Time before selection remains unallocated attendance.
- Starting a new task atomically closes the previous task period. Only actual assignees/co-assignees may start a task; review, done, blocked, deleted/archived work and unmet dependencies are rejected.
- Breaks stop the task timer. The first 1,800 actual break seconds per Riyadh day are credited toward the eight-hour company target across all check-ins. Unused break allowance is never added. Excess break time is excluded until explicit resume; no automatic return to work.
- Confirmation is due after one hour and every hour after confirmation. Break duration postpones the next confirmation. Five minutes without confirmation closes attendance retroactively at its due time.
- The original browser sends a heartbeat every minute. Five minutes without one closes attendance at the last heartbeat, not at the timeout. A paid break protects the remaining paid break interval from heartbeat expiry. After closure a new explicit check-in is required.
- Reading the dashboard from another browser/device does not send heartbeat extensions. Device credentials are HttpOnly session cookies, compared as server hashes. Multiple tabs of the same browser share one attendance session; obsolete session IDs cannot stop a new session.
- Mobile user agents cannot check in. **This is browser restriction, not hardware attestation.** The web app cannot distinguish power-off, browser closure and network failure, or prove a human is at the keyboard. A different device identity can also be spoofed by an authorized user; strict hardware requirements need a managed native agent.
- Task submission/review, reassignment, archive and board/column archive stop affected task periods. Attendance remains open without an active task until a next task/activity or check-out.
- Approved attendance corrections clip or archive linked task-time periods and append revisions. Managed task times cannot be edited through the manual time endpoint. Corrections under the new policy cannot exceed 17:00 or move a managed period to another day.
- Closed historical attendance keeps its original rules. An open legacy session can be checked out before beginning the first new-policy session; historical periods are not silently reclassified.
- Dashboards, Excel and weekly reports use credited attendance ranges, subtracting excess breaks and merging overlaps. Financial/payroll calculations and employee job data are not changed by this feature.

## Local verification

Requires Node 24 and `npm ci` (PGlite is pinned as a dev dependency).

```powershell
node --import ./tests/helpers/register-ts.mjs --test tests/workforce-work-session.test.mjs tests/workforce-attendance-summary.test.mjs tests/workforce-attendance-export.test.mjs tests/workforce-weekly-report.test.mjs
node --import ./tests/helpers/register-ts.mjs scripts/workforce-session-preview.mjs
npm run dev -- --port 3113
```

Open `http://localhost:3113/card/work-session-preview`. The page is development-only (404 in production). Its local HTTP adapter binds to loopback port 3122, uses synthetic IDs and in-memory PostgreSQL, and has no mail provider, notification worker, production credentials or database connection. Tests destroy each in-memory database. The preview’s reset action clears its temporary attendance data.

The preview and tests load the exact migration file. Only their isolated fixture replaces `workforce_private.work_now()` with a simulated clock; no simulated clock or timestamp input exists in the shipped RPC.

## Release after user approval

1. Finish any legacy open sessions deliberately; do not rewrite historical closed periods.
2. Apply `20261022213937_linked_work_sessions.sql`, then deploy the matching application. Confirm `pg_cron` is installed and `workforce-close-work-sessions` is scheduled every minute. The scheduler calls SQL only, not an email/HTTP worker.
3. Verify current production grants/RLS and cron job state read-only, and run deployment diagnostics. The isolated fixture validates new SQL and realistic table constraints, but is not a clone of every production trigger or a multi-connection concurrency benchmark.
4. Confirm the new check-in UI and monthly summaries using a separately isolated/silent test target. Never run the old production-mutating attendance script: its legacy RPC is intentionally disabled.
5. Remove the development preview route before a later production release if it is no longer needed. It is already inaccessible under `NODE_ENV=production`.

The application must not be deployed without the schema. Do not run this migration against production merely to show the preview.

# Sick leave

Implemented 2026-10-23. Request kind remains `leave`; subtype `sick` is separate from annual and unpaid leave.

- Employee uploads a PDF or PNG/JPEG/WebP medical certificate; the upload handler validates file contents before private storage. Database validation also requires private request-path metadata and a server-generated SHA-256. The manager reviews the report before approval. Existing owner/admin RLS protects the request and attachment download; task delegation does not grant medical access. Reports are not copied to shared knowledge folders.
- Saudi Labor Law Article 117: calendar days 1–30 at full actual wage, 31–90 at 75%, 91–120 without wage, continuous or intermittent. A request exceeding the remaining 120-day entitlement cannot be approved. Overlapping approved leave is rejected by the existing decision RPC, which locks the employee before approval. Retroactive requests recalculate subsequent bands deterministically.
- The sick year starts at the first sick date. Article 10 defaults to the Hijri calendar absent a contrary contract/work regulation. Exact Umm al-Qura month boundaries from ICU cover 2019–2102, including unequal month lengths; the anniversary clamps day 30 to day 29 when necessary. Dates beyond the calendar fail closed. This policy does not infer a Gregorian contractual exception from Gregorian UI/payroll months.
- Only approved real requests affect pay. Future days do not reduce today's entitlement. Daily wage uses the effective basic salary plus fixed allowances divided by 30. Official holiday overlap receives full holiday pay under implementing regulation Article 24. Sick days never consume annual leave movements, and are excluded from absence penalties and attendance targets without generating worked hours or punches. Existing attendance reminders and weekly reports already excuse approved leave.
- The existing attendance adjustment contains the sick wage adjustment exactly once; `attendance_details.sick_leave` itemizes dates, cycle, ordinal, rate, and amount. Cards split the same total into hour and medical wage adjustments, respecting the existing available-balance cap. Insurance, overtime, reimbursements, and recorded incentives retain their existing independent rules.
- Fully paid payroll records are immutable. A backdated sick approval beginning before a paid month is blocked with an explicit settlement message, rather than silently rewriting paid wages or historical sick bands. A financial reconciliation is required before such an approval.
- Rejection/cancellation do not credit pay. Employees can cancel pending requests; approved certificates cannot be directly altered. Financial leave testing remains blocked in live scoped test runs. Tests use disposable in-memory PostgreSQL and never call production notification/email workers.

## Sources

- [HRSD: Article 117](https://www.hrsd.gov.sa/شروط-العمل-وظروفه)
- [HRSD: Article 10](https://prod.hrsd.gov.sa/التعريفات/الأحكام-العامة)
- [HRSD: implementing regulations, Article 24](https://www.hrsd.gov.sa/sites/default/files/2025-02/اللائحة%20التنفيذية%20لنظام%20العمل%20وملحقاتها.pdf)

## Verification

`node --experimental-transform-types --import ./tests/helpers/register-ts.mjs --test tests/workforce-sick-leave.test.mjs`

Covers both employees' report visibility, manager-only approval, required medical evidence, no annual balance use, split/contiguous sick days, 30/90/120 boundaries, Hijri renewal, overlap and 121st-day rejection, retroactive bands, immutable paid periods, daily/monthly payroll idempotency, official holiday pay, rejected/cancelled requests, no fake worked hours, and the nonduplicating payroll display.

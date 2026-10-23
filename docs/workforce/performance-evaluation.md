# Employee task evaluation

Historical work is reconstructed read-only from original command receipts, timely scheduling edits and own submissions. Tasks without reliable dates or ownership remain raw indicators. Unknown historical return reasons never become attributed faults. Tasks due before joining are excluded from grades. New unfinished/unsubmitted work is enrolled prospectively at activation; no old personal delivery is fabricated.

## Scope and access

- Employee: own card only, even while switching the attendance/payroll team selector.
- Administrator: each employee's monthly card in the collapsed Team Pulse section.
- Delegated task reviewer: configure/review independent tasks, but cannot configure,
  review or grant an exception on a task to which she is assigned. Delegation does not
  grant access to other employees' aggregate evaluations.
- The three evidence tables have RLS (own employee or administrator reads). Mutations
  run through service-only RPCs after server authentication and task visibility checks.
- No performance value changes salary, incentives, attendance or leave.

## Calculation

Final score = punctuality × 40% + quality × 35% + completion × 25%.
Task size is automatic from scheduled working minutes: up to 1 working day = small (1),
2–5 days = medium (2), over 5 = large (3). A working day is 480 minutes;
Fridays and fixed paid holidays do not increase the size. Scheduling changes before
any submission/contribution and before the deadline can recalculate the baseline.
After either boundary the planned weight freezes; an approved deadline exception
cannot increase its weight or extend a colleague's assessment deadline.

Shared tasks divide that weight equally: 1/N per participant. Responsibilities are
optional. Every participant's delivery, return classification and revision deadline
remain independent. Five reliably approved tasks are still required for a final
score. Adding someone after deliveries does not invent a historic personal score.

- Punctuality uses the first **complete** personal delivery against the original
  assessment deadline, then subsequent personal delivery rounds against their own
  revision deadlines. Each eight working hours of delay removes 25 points, floored
  at zero. Working delay is 09:00–17:00 Riyadh, excluding Fridays and the two fixed
  national holidays. Round scores are averaged per task, then task-size weighted.
- Quality is 100 minus 20 per attributable requirements return, floored at zero.
  Improvements, scope changes and a colleague's return do not reduce quality.
  Unknown return classifications make a task ineligible for a numeric grade.
- Completion is accepted weight / actionable due weight. Pending manager review,
  future deadlines and revisions not yet due are outside its denominator. Open
  overdue work carries into subsequent months. Completed archives retain evidence;
  unfinished archives are excluded.
- Pending approval at a selected month's end remains pending in that historical
  view, even if reviewed later. Approved deadline exceptions are selected as of
  that month's end, rather than silently rewriting historical reports.

## Task workflow

The contribution section shows automatic size and equal share. An independent manager may add optional contribution details. A normal deadline edit does not reset the assessment baseline. A documented
exception requires an independent manager/reviewer; it records the previous/new
deadline, reason, approver and time and updates the actual task deadline.

Each evaluated shared-task participant explicitly submits her own contribution.
For automatically enrolled shared work, global submission
checks their personal records atomically. Historical shared tasks without personal evidence retain their workflow and remain ungraded. Duplicate carried-forward deliveries do not dilute punctuality. Personal rounds use task-local
ordinals, not the globally allocated submission identity. An unaffected participant's
contribution is carried forward when a colleague must make changes.

Return decisions require category, affected participants and a revision deadline.
Only a requirements return may mark a submission incomplete. Reassignment remains
available before returning a pending task. The core task command retains its CAS,
idempotency, silent deletion and notification behavior. The new return deadline is
applied in the **same** task update as the state transition, avoiding a second notice.

## Verification and release boundary

`tests/performance.test.mjs` covers the pure scoring rules. `tests/performance-db.test.mjs`
runs the shipped migration and existing task/review/notification commands in isolated
PGlite databases, with the real test-notification guard and no network/provider.
Fixtures are discarded when each database closes. No production records are created.

The development-only `/card/performance-preview` uses read-only local fixture data;
optional illustrative grades are explicitly labelled. Links/actions that could write
are blocked in this preview. It returns 404 in a production build.

The migration and code must be published together **after** preview approval. Applying
only the application without the schema would make the dashboard evidence queries fail.

## Saturday email

`workforce-performance.ts` is the single pure engine used by the Next server and
Deno mail renderer. The weekly snapshot includes the same service-only evidence.
Four weekly tiles show completed work, actionable work, pending review and hours;
monthly hours and the monthly assessment are clearly labelled separately. One
motivation message uses only attributable classified returns and reliable timing.
The existing Saturday 09:00 Riyadh schedule, manager CC and duplicate guards remain
unchanged. Preview routes render HTML only and are disabled outside development.

# Attendance-gated work actions

Employee work mutations require a live managed attendance session, the same browser device,
no active break, and no pending continuation confirmation. Server time, the five-minute
disconnect limit, and the session cutoff remain authoritative. Admin actions are exempt.

All workforce HTTP mutations await `assertMutation`. Personal leave, permission, overtime
requests, missing hours, attendance correction, administrative help, letters and payroll
questions remain available off duty, as do reading, password changes and session controls.
Expense and advance submissions require attendance. Operational RPCs also enforce the gate;
task ownership, delegation and review restrictions are checked by their existing commands.

After 17:00, an approved overtime request covering the current instant permits a separate
check-in, ending no later than the approved interval. Friday and paid-holiday check-in
restrictions remain unchanged. Overtime sessions are linked to the request and excluded
from ordinary attendance credit in SQL, dashboard calculations and regular attendance exports.
The existing approved-overtime payroll entry remains the sole financial credit.

Read-only preview: `/card/action-access-preview` (development only). No production writes,
notifications or emails are made by the isolated PGlite tests or preview adapters.

Validation: `node --experimental-transform-types --import ./tests/helpers/register-ts.mjs --test tests/workforce-action-access.test.mjs`

# Workforce production testing

Production tests MUST be silent. Never disable the global notification worker.

1. The signed-in manager starts a silent run under Workforce → Notifications → Test mode.
2. Staff explicitly join using its employee link. Confirm the amber test indicator before creating anything.
3. API clients must use `quietWorkforceTestHeaders(runId)` on every workforce request, authenticated as the real authorized participant. Never mint admin sessions or change passwords.
4. Test mode covers tasks (including their attachments, submissions, decisions and reminders) and general administrative requests. Requests that change money, attendance or leave are rejected in this mode; use isolated/rolled-back tests for them.
5. Existing real records cannot be relabelled as tests. A test marker is immutable and survives run expiry/end, so background reminders stay silent.
6. Runs expire after two hours. Expired/ended browser sessions fail closed for creation until explicitly left. Manager finish closes the run; staff leave clears only their own browser mode.
7. Remove only the recorded test IDs and their Storage objects. Clear test rows before deleting their run (FK protects retained fixtures).
8. Old production flags no longer allow legacy test suites to run on production. Do not run old ignored `.workforce-test` scripts against production; migrate them to this protocol first.

Verification must assert zero notification AND outbox rows for test IDs, including aggregate reminders, and use a rolled-back control record to prove real notifications still enqueue. Do not send a real control email.

For the HR/financial portion, `supabase/tests/workforce_hr_finance_rollback.sql`
exercises both active employee actors, all nine request kinds, attendance,
leave, compensation, insurance deductions, payroll approvals and recorded
payments, profile decisions and document archive/restore. It always rolls back.
Its transaction-local `workforce.notification_wake=1` prevents a worker wake;
uncommitted notifications/outbox rows are never visible to the delivery worker.
Never replace its rollback with a commit, and never run it through a helper
that splits statements into separate transactions. This is domain verification,
not a claim that these mutations are supported by the live browser test mode.
Read employee pages/APIs as each real account; test real credentials by normal
sign-in, never by resetting passwords or invoking password email/reauth flows.

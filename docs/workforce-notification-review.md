# Workforce mail review — local, not deployed

The shared workforce renderer now uses the event title, task name, relevant changes and one action. It omits repeated task titles and generic explanatory paragraphs. Deliverables appear on assignment/detail updates only. Task status messages include the old and new state; request messages include the employee, type, period, amount where applicable and decision reason. Comment/file notices identify the actual comment or filename and reach all assigned employees, within the existing task audience.

Mail shows at most 900 characters of the event body and 350 of a deliverable. Longer event bodies include a notice to read the rest in the portal. Stored review reasons remain unrestricted and unchanged. The weekly report design and manager CC remain unchanged.

`20261022234236_workforce_notification_clarity.sql` is pending after the other October workforce migrations. It normalizes task-change keys by recipient, task and version, so assignment/owner/shared triggers cannot produce duplicate inbox entries and email deliveries for the same mutation. Submission/review decisions remain separate actionable events; the shared-task state trigger skips those transitions. Comments, uploads and subsequent task versions remain separate events. No old deliveries are replayed or rewritten. Existing reminder keys, provider retry/idempotency logic and silent-test guards remain in place.

Verification uses PGlite with actual notification/queue triggers, a no-op wake function and no mail-provider transport. The fixture is discarded on completion; no live account or data is changed. Tests cover event content, long notes/HTML escaping, overlapping triggers, shared submissions/returns, unchanged request saves, comment/file recipients and silent test resources. Existing knowledge and weekly mail tests also pass.

Run:

```powershell
node --experimental-transform-types --import ./tests/helpers/register-ts.mjs --test tests/workforce-notification-clarity.test.mjs tests/workforce-knowledge-notifications.test.mjs tests/workforce-weekly-report.test.mjs
node scripts/preview-workforce-emails.mjs
```

Preview output is ignored under `.preview/notification-review/`; the generator imports no database, queue or delivery client. To release, apply the migration and deploy both the app and the `workforce-notifications` Edge Function (the template is imported by that function). Deploying the app alone does not update email rendering. No release or provider send was performed during this review. Client-order transactional templates are outside this workforce change.

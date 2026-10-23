# Work expense reimbursements — pending local release

The existing `expenses` request is labeled **تعويض مصروفات العمل** throughout the selector, navigation and request mail. The employee supplies a positive amount and at least one PDF/image invoice. Existing private attachment preview/download endpoints retain their request RLS boundary. Newly uploaded attachment hashes are computed from validated bytes on the server, never accepted from the form.

On manager approval, `expense_details` captures the posting month and approval time. An already fully paid month is skipped; the request carries into the next available month without changing the historical paid statement. The employee row lock matches payroll save/pay, preventing approval from routing into a month being paid concurrently. Historical approvals before this release are not automatically credited again. Legacy pending invoice hashes are verified from private storage before approval; a request without an invoice must be cancelled and resubmitted with one.

`reimbursement_amount` and `reimbursements` are separate from salary `gross_amount`, overtime, incentives, insured wages and attendance deductions. The net balance constraint is `salary gross + reimbursement = payable total + deductions`. The daily balance adds the approved reimbursement without prorating it or using it to cover hour deficits. The read-only detail lists source requests and invoice links; the payroll editor cannot manually change generated reimbursement entries. Team-summary delegates receive the total only, without invoice metadata or access to another employee's request files.

Recalculation sums unique approved request records, rather than incrementing a balance. Request version checks block repeated approval. Invoice byte hashes are checked under ordered advisory locks across pending/approved claims, including another employee's claim and renamed files. Rejected/cancelled claims may be resubmitted. This is exact-file duplicate detection; it does not claim OCR matching of altered invoice images. Approved financial fields and invoices are immutable. Test-run records remain excluded from real finance.

Apply `20261022235359_approved_expense_reimbursements.sql` **after** the other pending October workforce migrations, before publishing the app. It creates no outbound notification jobs and backfills no approvals. Normal requests retain the existing event notifications; no global notification setting was disabled.

Verification:

```powershell
node --experimental-transform-types --import ./tests/helpers/register-ts.mjs --test tests/workforce-expenses.test.mjs tests/workforce-overtime.test.mjs tests/workforce-daily-payroll.test.mjs tests/workforce-notification-clarity.test.mjs
```

24 isolated tests pass, including both employees, required/duplicate invoices, employee approval denial, repeated approval, separate insurance/hour calculation, overtime coexistence, payroll edits, full/partial payment, paid-month carry-forward and silent test isolation. Test databases are destroyed on completion. TypeScript and targeted ESLint checks pass.

The development-only `/card/expenses-preview` uses `scripts/workforce-expense-preview.mjs` on loopback port 3124, a disposable database and local file map, with no cloud or mail client. UI verification covered missing-invoice validation, PDF upload/preview/download, manager approval, Noor's immediate 150 SAR increase and Monwa's isolated view. The local sample remains only for visual review; no real account, request, payroll or storage object was changed. No deployment was performed.

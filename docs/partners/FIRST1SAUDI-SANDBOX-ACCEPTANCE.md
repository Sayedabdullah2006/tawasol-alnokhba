# First1Saudi isolated acceptance lane

The central source includes invoice download, all canonical order/payment state definitions, orders/{id}/state, and unified OIDC identity. Acceptance is additive and must never deploy an older archive.

## Runtime

- API origin: https://nukhba.media
- Temporary partner: awwal-saudi-qa-89e69cacaf
- Key ID: acceptance
- Expires: 2026-11-06T19:16:30.919Z (22:16:30 Saudi time)
- Publisher: a91880b6-2252-4aa7-807d-a53eb734771f
- Exact return base: https://first1saudi.net/services/orders/return
- notifications=false, auto_studio=false, sandbox_only=true
- Production PARTNER_PAYMENT_MODE stays live. Test keys use only PARTNER_MOYASAR_TEST_SECRET_KEY and PARTNER_MOYASAR_TEST_PUBLISHABLE_KEY. Missing/wrong prefixes fail closed; never fallback to live.

Credentials are ONLY in the ignored local file:
C:\Users\sayed\.codex\worktrees\partner-deploy\influencers\.env.first1saudi-acceptance

Read the four NUKHBA_ORIGIN / NUKHBA_PARTNER_ID / NUKHBA_KEY_ID / NUKHBA_PARTNER_SECRET values into private acceptance-server configuration. Do not publish the file, send secrets in chat, log them, commit them, or switch the public production partner. NUKHBA_SANDBOX_CLIENT_JSON is central operator configuration, not browser data. OIDC remains on the main awwal-saudi identity channel, not this temporary payment partner.

## Isolation and contract

Existing signed endpoints, ownership, HMAC, nonce and Idempotency behavior remain. The acceptance partner routes orders, quotes, checkout sessions, payment receipts, discount codes, files and non-fiscal PDFs to distinct partner_sandbox_* tables and partner-sandbox-files private bucket. These tables have no production rows or production triggers. Their only grants are service_role; no public/client policies. Request numbers use a separate sandbox sequence. No sandbox row enters publish_requests, service_invoices, operational admin order lists, accounting, automatic studio or production notification jobs. The resource adapter rejects unknown table/RPC/bucket access.

The current canonical status renderer runs on the isolated data. Checkout records persist payment_mode=sandbox, with a DB constraint forbidding live mode. Hosted checkout, payment confirmation and the authenticated Moyasar webhook resolve that stored context and use test credentials. Expired/removed/invalid partner configuration blocks new API calls and pending checkout verification. Atomic settlement permits one applied result even with callback/webhook retries. Sandbox webhooks do not enter production webhook_logs.

No public purchase gate is opened. First1Saudi must keep purchase disabled and enable only its private acceptance path for the two QA users. Maintain distinct external_customer_id values. Never overwrite live HMAC settings, live Moyasar keys or live orders for testing.

## Original PDF positive test

After a successful TEST payment, call the same signed GET orders/{id}/invoice using responseType:'pdf'. It uses the current central service invoice renderer and stores one immutable original PDF in partner_sandbox_invoices. Repeated downloads return exactly those bytes. The filename/number starts SANDBOX-, the PDF has a visible TEST ONLY / NON-FISCAL mark, and X-Document-Environment is sandbox. This is an acceptance document, not a financial invoice. It does NOT insert into service_invoices, use its sequence, write its production bucket or email a fiscal invoice. Before test settlement it returns INVOICE_NOT_AVAILABLE; another customer receives ORDER_NOT_FOUND.

## Operator staging for the customer review tests

Run from the CENTRAL repository, privately. The tool reads existing local credentials; never transfer Supabase service credentials to WordPress.

node scripts/partner-acceptance-admin.mjs information REQUEST_UUID
node scripts/partner-acceptance-admin.mjs review REQUEST_UUID OPTIONAL_LOCAL_PNG_OR_JPEG
node scripts/partner-acceptance-admin.mjs complete REQUEST_UUID

All three require that the request exists in partner_sandbox_orders and belongs to this exact temporary partner. Review uploads a private QA design if an image is supplied, then stages central content_review. Use it again after a customer change request to stage a revised review. The image URL lasts two hours; restage when expired. It does not change any production state definitions or real customer request.

## Revoke and clean

Stop the First1Saudi acceptance attempt first. Then:

node scripts/partner-acceptance-admin.mjs revoke

This removes only this partner from PARTNER_SANDBOX_CLIENTS_JSON and requests a redeployment. Wait for successful deploy and confirm the old signed catalog request returns 401. Until then the current running instance may still have the previous environment. Expiry also denies it automatically at the time above, including pending hosted checkout verification.

After stopping tests and revocation, run:

node scripts/partner-acceptance-admin.mjs cleanup

This removes only this partner's private QA objects, PDF copies, receipts, file rows, checkout sessions, quotes, orders and nonce records. It never deletes production orders/invoices/accounts or resets any production sequence. Keep safe test-result JSON separately. Then remove the acceptance secret from the First1Saudi runtime and securely delete its local copy when no longer needed. Keep central isolated schema for future QA lanes.

Renewal requires a newly approved short acceptance window and updated server configuration; no automatic lifetime extension.

## Verification limits

Central API tests use real isolated database/storage, real PDF renderer, and simulated Moyasar responses. They verify failed/paid settlement, provider test-key selection, missing-key rejection, duplicate settlement and authenticated webhook replay. Live deployment smoke verifies the published API, private ownership and sandbox checkout context without charging. First1Saudi must still complete a real Moyasar TEST 3DS success and rejection on version 1.4.1, return flow and its full browser acceptance suite. Do not report those browser/provider tests as passed before running them.

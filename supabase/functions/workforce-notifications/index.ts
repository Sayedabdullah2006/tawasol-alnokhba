import { createClient } from "npm:@supabase/supabase-js@2.103.3";
import {
  renderWorkforceEmail,
  workforceMailCC,
  type WorkforceMail,
} from "../_shared/workforce-email.ts";

const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
  auth: { persistSession: false },
});
const json = (value: unknown, status = 200) => Response.json(value, { status });
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  // Opaque sb_secret API keys cannot use the gateway's legacy JWT verifier.
  // Authenticate with a service-only DB function; never accept an unsigned JWT.
  const credential = req.headers.get("x-workforce-secret") || "";
  if (credential.length < 32 || credential.length > 1024)
    return json({ error: "Forbidden" }, 403);
  const authorized = await db.rpc("wf_validate_notification_worker", {
    p_token: credential,
  });
  if (authorized.error || authorized.data !== true)
    return json({ error: "Forbidden" }, 403);
  const apiKey =
    Deno.env.get("Resend_Key") ||
    Deno.env.get("RESEND_KEY") ||
    Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ error: "Mail provider unavailable" }, 503);
  const claim = await db.rpc("wf_claim_notification_deliveries", {
    p_limit: 8,
  });
  if (claim.error) return json({ error: "Queue unavailable" }, 503);
  const token = claim.data?.token;
  const items = (claim.data?.deliveries || []) as {
    id: string;
    snapshot: WorkforceMail;
    externalMeeting?: boolean;
  }[];
  if (token && items.length < 8) {
    const guests = await db.rpc("wf_claim_meeting_guest_deliveries", {p_token:token,p_limit:8-items.length});
    if (!guests.error) items.push(...(guests.data || []));
  }
  let sent = 0,
    failed = 0;
  try {
    for (const item of items) {
      let outcome = "retry",
        provider: string | null = null,
        error: string | null = null;
      try {
        const email = renderWorkforceEmail(item.snapshot);
        const result = await fetch("https://api.resend.com/emails", {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `workforce/${item.id}`,
          },
          body: JSON.stringify({
            from: "تواصل النخبة <noreply@nukhba.media>",
            to: [item.snapshot.email],
            cc: workforceMailCC(item.snapshot),
            reply_to: "support@nukhba.media",
            subject: email.subject,
            html: email.html,
            text: email.text,
            headers: {
              "Auto-Submitted": "auto-generated",
              "X-Entity-Ref-ID": item.id,
            },
          }),
        });
        const receipt = await result.json().catch(() => ({}));
        if (result.ok && typeof receipt.id === "string") {
          outcome = "sent";
          provider = receipt.id;
        } else {
          error = `Mail provider HTTP ${result.status}`;
          outcome =
            result.status === 429 ||
            result.status >= 500 ||
            result.status === 409
              ? "retry"
              : "failed";
        }
      } catch {
        error = "Mail provider request timed out or failed";
      }
      const finished = await db.rpc(item.externalMeeting ? "wf_finish_meeting_guest_delivery" : "wf_finish_notification_delivery", {
        p_id: item.id,
        p_token: token,
        p_result: outcome,
        p_provider: provider,
        p_error: error,
      });
      if (finished.error || finished.data !== true) failed++;
      else if (outcome === "sent") sent++;
      else failed++;
      // Stay below the provider's normal per-second limit; other systems use it too.
      await new Promise((resolve) => setTimeout(resolve, 650));
    }
  } finally {
    if (token)
      await db.rpc("wf_release_notification_worker", { p_token: token });
  }
  console.log(
    JSON.stringify({
      event: "workforce_mail_batch",
      claimed: items.length,
      sent,
      failed,
    }),
  );
  return json({ claimed: items.length, sent, failed });
});

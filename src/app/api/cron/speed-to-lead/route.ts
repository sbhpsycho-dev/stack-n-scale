/**
 * /api/cron/speed-to-lead
 *
 * Runs every 5 minutes (Vercel cron: "* /5 * * * *").
 * Scans all uncontacted leads in the STL pending hash and fires
 * Discord alerts to #alerts at 15-min and 30-min thresholds.
 *
 * Alert logic:
 *   ≥ 15 min  → ⚠️  warning  (fires once, deduplicated by KV flag)
 *   ≥ 30 min  → 🚨  escalation (fires once, deduplicated by KV flag)
 *
 * Leads are removed from the pending hash when:
 *   - An outbound message is sent   (handleOutboundContact in GHL webhook)
 *   - An appointment is booked      (handleAppointment in GHL webhook)
 *   - The lead replies              (not auto-cleared; rep is still responsible)
 */

import { kv } from "@vercel/kv";
import { verifyCronSecret } from "@/lib/cron-auth";
import { sendWebhookEmbed, buildSTLAlertEmbed } from "@/lib/discord";
import {
  getPendingLeads,
  hasAlertBeenSent,
  markAlertSent,
} from "@/lib/lead-pipeline";

export const runtime = "nodejs";

// Resolve webhook URL from env or KV
async function alertsWebhookUrl(): Promise<string> {
  return (
    process.env.DISCORD_WEBHOOK_ALERTS ||
    (await kv.get<string>("sns:config:DISCORD_WEBHOOK_ALERTS")) ||
    ""
  );
}

export async function GET(req: Request) {
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const pending = await getPendingLeads();
  const contactIds = Object.keys(pending);

  if (!contactIds.length) {
    return Response.json({ ok: true, checked: 0 });
  }

  const alertsUrl = await alertsWebhookUrl();
  const now = Date.now();

  let fired15 = 0;
  let fired30 = 0;

  for (const contactId of contactIds) {
    const entry = pending[contactId];
    const ageMs  = now - new Date(entry.createdAt).getTime();
    const ageMin = ageMs / 60_000;

    // ── 30-min escalation (check first so we don't also send the 15-min alert)
    if (ageMin >= 30) {
      const alreadySent = await hasAlertBeenSent(contactId, 30);
      if (!alreadySent) {
        await markAlertSent(contactId, 30);
        void sendWebhookEmbed(
          alertsUrl,
          buildSTLAlertEmbed({
            name:            entry.name,
            phone:           entry.phone,
            minutesElapsed:  30,
            contactId,
          })
        );
        fired30++;
      }
      // If 30-min already sent, nothing more to do for this lead
      continue;
    }

    // ── 15-min warning
    if (ageMin >= 15) {
      const alreadySent = await hasAlertBeenSent(contactId, 15);
      if (!alreadySent) {
        await markAlertSent(contactId, 15);
        void sendWebhookEmbed(
          alertsUrl,
          buildSTLAlertEmbed({
            name:            entry.name,
            phone:           entry.phone,
            minutesElapsed:  15,
            contactId,
          })
        );
        fired15++;
      }
    }
  }

  console.log(
    `[cron/speed-to-lead] checked=${contactIds.length} fired15=${fired15} fired30=${fired30}`
  );

  return Response.json({
    ok:      true,
    checked: contactIds.length,
    fired15,
    fired30,
  });
}

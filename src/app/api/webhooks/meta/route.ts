import { createHmac, timingSafeEqual } from "crypto";
import { deduplicateNotif } from "@/lib/notif-dedup";
import { sendWebhookEmbed, buildMetaLeadEmbed } from "@/lib/discord";

export const runtime = "nodejs";

// ── Types ─────────────────────────────────────────────────────────────────────

type MetaLeadField = { name: string; values: string[] };

type MetaLeadgenChange = {
  value: {
    leadgen_id: string;
    page_id: string;
    form_id?: string;
    ad_id?: string;
    ad_name?: string;
    form_name?: string;
  };
  field: string;
};

type MetaLeadgenPayload = {
  object: string;
  entry: Array<{
    id: string;
    changes: MetaLeadgenChange[];
  }>;
};

type MetaLeadData = {
  id: string;
  field_data: MetaLeadField[];
  ad_id?: string;
  ad_name?: string;
  form_id?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fieldVal(fields: MetaLeadField[], key: string): string | undefined {
  return fields.find(f => f.name.toLowerCase() === key)?.values?.[0];
}

/**
 * Verify Meta's HMAC-SHA256 signature.
 * Meta sends: x-hub-signature-256: sha256=<hex_digest>
 */
async function verifyMetaSignature(body: string, sigHeader: string): Promise<boolean> {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return false;

  const [algo, hex] = sigHeader.split("=");
  if (algo !== "sha256" || !hex) return false;

  const expected = createHmac("sha256", appSecret).update(body).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(hex));
  } catch {
    return false; // length mismatch → reject
  }
}

// ── Lead processing ───────────────────────────────────────────────────────────

async function processMetaLeads(payload: MetaLeadgenPayload): Promise<void> {
  const accessToken = process.env.META_PAGE_ACCESS_TOKEN ?? "";
  const webhookUrl  = process.env.DISCORD_WEBHOOK_NEW_LEADS ?? "";

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;

      const { leadgen_id, ad_name } = change.value;

      // Atomic dedup — prevent double-notifications on Meta retry deliveries
      const isNew = await deduplicateNotif("meta.leadgen", leadgen_id);
      if (!isNew) continue;

      // Fetch full lead field data from Meta Graph API
      let leadData: MetaLeadData | null = null;
      if (accessToken) {
        try {
          const res = await fetch(
            `https://graph.facebook.com/v21.0/${leadgen_id}` +
            `?fields=field_data,ad_id,ad_name,form_id` +
            `&access_token=${encodeURIComponent(accessToken)}`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (res.ok) leadData = (await res.json()) as MetaLeadData;
        } catch {
          // Proceed with partial data from the webhook payload
        }
      }

      const fields    = leadData?.field_data ?? [];
      const firstName = fieldVal(fields, "first_name") ?? "";
      const lastName  = fieldVal(fields, "last_name")  ?? "";
      const fullName  = fieldVal(fields, "full_name")  ?? [firstName, lastName].filter(Boolean).join(" ");
      const name      = fullName.trim() || "Unknown";
      const email     = fieldVal(fields, "email");
      const phone     = fieldVal(fields, "phone_number") ?? fieldVal(fields, "phone");

      void sendWebhookEmbed(webhookUrl, buildMetaLeadEmbed({
        name,
        email,
        phone,
        adName:   leadData?.ad_name ?? ad_name,
        formName: change.value.form_name,
      }));
    }
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

/**
 * GET — Meta webhook subscription verification.
 * Meta calls this once when you register the webhook in the App Dashboard.
 */
export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/**
 * POST — Meta lead event receipt.
 * Acks immediately (Meta expects fast 200) then processes leads async.
 */
export async function POST(req: Request): Promise<Response> {
  // Raw body must be read BEFORE JSON.parse — needed for HMAC verification
  const rawBody   = await req.text();
  const sigHeader = req.headers.get("x-hub-signature-256") ?? "";

  const isValid = await verifyMetaSignature(rawBody, sigHeader);
  if (!isValid) return new Response("Unauthorized", { status: 401 });

  let payload: MetaLeadgenPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Fire-and-forget — ack immediately so Meta doesn't retry
  void processMetaLeads(payload);

  return new Response("ok", { status: 200 });
}

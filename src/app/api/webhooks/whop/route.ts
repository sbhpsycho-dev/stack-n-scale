import { kv } from "@vercel/kv";
import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { createContact } from "@/lib/ghl";
import { triggerEmail, triggerCampaign } from "@/lib/email";
import { setupClientFolder } from "@/lib/drive";
import type { CoachingClient } from "@/lib/coaching-types";
import type { Lead } from "@/lib/lead-types";
import type { Deal } from "@/lib/deal-types";
import { calculatePayouts } from "@/lib/payout-calc";
import { syncDealToSheets } from "@/lib/sheets-sync";
import { triggerScenario } from "@/lib/make";
import { webhookUrl } from "@/lib/discord";

export const runtime = "nodejs";

const WHOP_FEE_RATE = 0.03; // 3% on free plan — set to 0 if on a paid Whop plan

/** LPUSH that self-heals if the key holds a wrong type (deletes + retries). */
async function kvSafeLpush(key: string, value: string): Promise<void> {
  try {
    await kv.lpush(key, value);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("WRONGTYPE")) {
      await kv.del(key);
      await kv.lpush(key, value);
    } else {
      throw e;
    }
  }
}

// Whop uses the Standard Webhooks / Svix spec.
// Headers: svix-id, svix-timestamp, svix-signature
// Secret format: whsec_<base64> — strip prefix, base64-decode to get key bytes.
// Signed content: svix-id + "." + svix-timestamp + "." + rawBody
// Expected sig: base64(HMAC-SHA256(keyBytes, signedContent))
// svix-signature may contain multiple sigs: "v1,<b64> v1,<b64>" — any match passes.
function verifyWhopSignature(
  rawBody: string,
  svixId: string | null,
  svixTimestamp: string | null,
  svixSignature: string | null,
  secret: string,
): boolean {
  if (!svixId || !svixTimestamp || !svixSignature) return false;
  try {
    let keyBytes: Buffer;
    if (secret.startsWith("whsec_")) {
      keyBytes = Buffer.from(secret.slice(6), "base64");
    } else if (secret.startsWith("ws_")) {
      keyBytes = Buffer.from(secret.slice(3), "hex");
    } else {
      keyBytes = Buffer.from(secret);
    }
    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
    const expected = createHmac("sha256", keyBytes).update(signedContent).digest("base64");
    return svixSignature.split(" ").some(part => {
      const sig = part.startsWith("v1,") ? part.slice(3) : part;
      if (sig.length !== expected.length) return false;
      return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    });
  } catch {
    return false;
  }
}

type WhopUser = {
  id?: string;
  email?: string;
  name?: string;
  username?: string;
};

type WhopPayload = {
  event?: string;
  data?: {
    // Payment / refund / dispute fields
    id?: string;
    final_amount?: number; // in cents
    amount?: number;       // refund/dispute may use this
    reason?: string;
    user?: WhopUser;
    membership?: { id?: string; user?: WhopUser };
    // Optional attribution fields passed through Make.com
    lead_source?: string;
    offer?: string;
    dm_setter?: string;
    setter?: string;
    closer?: string;
  };
  // Drive folder IDs pre-created by Make.com
  drive_folder_id?: string;
  drive_folder_url?: string;
  drive_id_verification_folder_id?: string;
  drive_onboarding_folder_id?: string;
  drive_notes_folder_id?: string;
};

export async function POST(req: Request) {
  try {
    return await handleWhop(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[whop] Unhandled error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

async function handleWhop(req: Request) {
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 500 });

  const rawBody = await req.text();

  // Direct from Whop: verify Svix signature
  // Via Make.com proxy: accept x-webhook-secret shared secret (same env var)
  const svixId        = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  const proxySecret   = req.headers.get("x-webhook-secret");

  const authorized = svixId
    ? verifyWhopSignature(rawBody, svixId, svixTimestamp, svixSignature, secret)
    : proxySecret === secret;

  if (!authorized) return new Response("Unauthorized", { status: 401 });

  let payload: WhopPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Route by event type
  const event = payload.event ?? "payment_succeeded";
  if (event === "refund_created")           return handleRefund(payload);
  if (event === "dispute_created")          return handleDispute(payload);
  if (event === "membership_deactivated")   return handleMembershipDeactivated(payload);
  if (event !== "payment_succeeded" && event !== "payment.succeeded") {
    return new Response("ok", { status: 200 });
  }

  const paymentId = payload.data?.id;
  const amountCents = payload.data?.final_amount ?? 0;
  const user = payload.data?.user;
  const email = user?.email?.toLowerCase().trim();
  const rawName = (user?.name ?? user?.username ?? "").trim();

  if (!email || !rawName) return new Response("Missing email or name", { status: 400 });

  // Dedupe on payment_id
  if (paymentId) {
    const paymentKey = `sns:whop:payment:${paymentId}`;
    const alreadyProcessed = await kv.get(paymentKey);
    if (alreadyProcessed) return new Response("ok", { status: 200 });
    await kv.set(paymentKey, true, { ex: 60 * 60 * 24 * 7 });
  }

  // ── Deal record ──────────────────────────────────────────────────────────────
  if (amountCents > 0) {
    const dealDate    = new Date().toISOString();
    const grossAmount = amountCents / 100;
    const processorFee = parseFloat((grossAmount * WHOP_FEE_RATE).toFixed(2));
    const dealId      = paymentId ? `whop-${paymentId}` : `whop-anon-${randomUUID()}`;

    const deal: Deal = {
      id:           dealId,
      date:         dealDate.split("T")[0],
      clientName:   rawName,
      clientEmail:  email,
      offer:        ((payload.data?.offer === "10K" ? "10K" : "5K")) as Deal["offer"],
      grossAmount,
      processor:    "whop",
      processorFee,
      netAmount:    grossAmount - processorFee,
      leadSource:   (payload.data?.lead_source === "organic" ? "organic" : "ad") as Deal["leadSource"],
      dmSetter:     payload.data?.dm_setter ?? null,
      setter:       payload.data?.setter    ?? null,
      closer:       payload.data?.closer    ?? null,
      payouts:      {} as Deal["payouts"],
      payoutStatus: "pending",
      notes:        "",
    };
    deal.payouts = calculatePayouts(deal);

    const dedupKey = `sns:whop:deal:${dealId}`;
    const alreadyStored = !(await kv.set(dedupKey, true, { nx: true, ex: 60 * 60 * 24 * 7 }));
    if (!alreadyStored) {
      await kv.set(`sns:deals:${dealId}`, deal);
      await kvSafeLpush("sns:deals:index", dealId);
      const dealPayload = {
        id:           deal.id,
        date:         deal.date,
        clientName:   deal.clientName,
        offer:        deal.offer,
        grossAmount:  deal.grossAmount,
        netAmount:    deal.netAmount,
        leadSource:   deal.leadSource,
        processor:    deal.processor,
        dmSetter:     deal.dmSetter ?? null,
        setter:       deal.setter   ?? null,
        closer:       deal.closer   ?? null,
        payouts:      deal.payouts,
        payoutStatus: deal.payoutStatus,
        notes:        deal.notes ?? null,
      };
      triggerScenario("MAKE_DEAL_WEBHOOK_URL", dealPayload).catch(() => {});
      if (!process.env.MAKE_DEAL_WEBHOOK_URL) {
        syncDealToSheets(deal).catch(e => console.error("[sheets]", e));
      }
    }
  }

  const clientKey = `sns:coaching:client:${email}`;
  const existing = await kv.get<CoachingClient>(clientKey);
  if (existing) return new Response("ok", { status: 200 });

  const [firstName, ...rest] = rawName.split(" ");
  const lastName = rest.join(" ") || undefined;

  // 1. GHL contact
  let ghlContactId = "";
  try {
    const contact = await createContact({ firstName, lastName, email, phone: undefined, tags: ["coaching-client"] });
    ghlContactId = contact.id;
  } catch (e) {
    console.error("GHL createContact error:", e);
  }

  // 2. Google Drive folders
  let driveFolder: CoachingClient["driveFolder"] = null;
  if (payload.drive_folder_id) {
    driveFolder = {
      id:                      payload.drive_folder_id,
      url:                     payload.drive_folder_url ?? `https://drive.google.com/drive/folders/${payload.drive_folder_id}`,
      idVerificationFolderId:  payload.drive_id_verification_folder_id ?? "",
      onboardingFolderId:      payload.drive_onboarding_folder_id ?? "",
      notesFolderId:           payload.drive_notes_folder_id ?? "",
      docs:                    {},
    };
  } else if (process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID) {
    try {
      const folders = await setupClientFolder(rawName);
      driveFolder = {
        url:                     folders.folderUrl,
        id:                      folders.folderId,
        idVerificationFolderId:  folders.idVerificationFolderId,
        onboardingFolderId:      folders.onboardingFolderId,
        notesFolderId:           folders.notesFolderId,
        docs:                    folders.docs,
      };
    } catch (e) {
      console.error("Drive folder setup error:", e);
    }
  }

  // 3. Store in KV
  const now = new Date().toISOString();
  const client: CoachingClient = {
    ghlContactId,
    name:           rawName,
    email,
    phone:          undefined,
    status:         "payment_received",
    createdAt:      now,
    idVerification: "pending",
    driveFolder,
  };
  await kv.set(clientKey, client);

  // 3b. Lead record
  const leadId = randomUUID();
  const lead: Lead = {
    id: leadId, name: rawName, email,
    source: "whop", state: "opted_in",
    createdAt: now, updatedAt: now, contactHistory: [],
  };
  await kv.set(`sns:leads:${leadId}`, lead);
  await kvSafeLpush("sns:leads:index", leadId);

  // 4. Emails + campaign
  const SKOOL_LINK = "https://www.skool.com/stack-n-scale-enterprises-2384";
  const APP_URL = (process.env.NEXTAUTH_URL ?? "https://stack-n-scale.vercel.app").replace(/\/$/, "");
  const idVerificationUrl = `${APP_URL}/onboarding/id-submit?email=${encodeURIComponent(email)}&name=${encodeURIComponent(rawName)}`;
  triggerEmail("welcome", email, rawName, {
    driveFolderUrl: driveFolder?.url,
    skoolLink: SKOOL_LINK,
  }).catch(e => console.error("Welcome email error:", e));
  triggerEmail("id_verification_request", email, rawName, { idVerificationUrl })
    .catch(e => console.error("ID verification request email error:", e));
  triggerCampaign(email, rawName, amountCents, "whop").catch(e => console.error("Campaign trigger error:", e));

  // 5. Discord notifications
  const amountDollars = (amountCents / 100).toFixed(2);
  const formatted = `$${Number(amountDollars).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  const [paymentUrl, dealClosedUrl, newClientUrl] = await Promise.all([
    webhookUrl("DISCORD_WEBHOOK_PAYMENT"),
    webhookUrl("DISCORD_WEBHOOK_DEAL_CLOSED"),
    webhookUrl("DISCORD_WEBHOOK_NEW_CLIENT"),
  ]);
  const discordNotifications = [
    {
      url: paymentUrl,
      body: { content: `💰 New payment received from **${rawName}** — ${formatted}` },
    },
    {
      url: dealClosedUrl,
      body: { content: `🔥 **DEAL CLOSED — NEW CLIENT**\n**${rawName}** just joined the program!\nAmount: **${formatted}**\n@Coach @Admin — onboarding is firing automatically.` },
    },
    {
      url: newClientUrl,
      body: {
        embeds: [{
          title: "🎉 NEW CLIENT ONBOARDED",
          description: `Welcome **${rawName}** to the program!`,
          color: 16737792,
          fields: [
            { name: "Amount", value: formatted,  inline: true },
            { name: "Email",  value: email,       inline: true },
            { name: "Source", value: "Whop",      inline: true },
            { name: "Status", value: "✅ Payment confirmed\n✅ GHL contact tagged\n✅ Drive folder created\n✅ Welcome + Onboarding emails sent", inline: false },
          ],
          footer: { text: "@Coach — reach out within 24 hours to book their kickoff call" },
        }],
      },
    },
  ];

  Promise.all(
    discordNotifications
      .filter(n => n.url)
      .map(n =>
        fetch(n.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(n.body),
          signal: AbortSignal.timeout(5000),
        }).catch(e => console.error("Discord webhook error:", e))
      )
  ).catch(() => {});

  return new Response("ok", { status: 200 });
}

// ── Lightweight event handlers ────────────────────────────────────────────────

async function postDiscord(envVar: string, body: object): Promise<void> {
  const url = await webhookUrl(envVar);
  if (!url) return;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  }).catch(e => console.error("Discord webhook error:", e));
}

async function handleRefund(payload: WhopPayload): Promise<Response> {
  const user = payload.data?.user;
  const name  = user?.name ?? user?.username ?? "Unknown";
  const email = user?.email ?? "—";
  const cents = payload.data?.amount ?? payload.data?.final_amount ?? 0;
  const formatted = `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  await postDiscord("DISCORD_WEBHOOK_PAYMENT", {
    embeds: [{
      title: "⚠️ REFUND ISSUED — WHOP",
      color: 0xFF4444,
      fields: [
        { name: "Client",  value: name,      inline: true },
        { name: "Email",   value: email,     inline: true },
        { name: "Amount",  value: formatted, inline: true },
        { name: "Reason",  value: payload.data?.reason ?? "—", inline: false },
      ],
      footer: { text: "Review deal record and update payout status if needed." },
    }],
  });
  return new Response("ok", { status: 200 });
}

async function handleDispute(payload: WhopPayload): Promise<Response> {
  const user = payload.data?.user;
  const name  = user?.name ?? user?.username ?? "Unknown";
  const email = user?.email ?? "—";
  const cents = payload.data?.amount ?? payload.data?.final_amount ?? 0;
  const formatted = cents > 0 ? `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—";
  await postDiscord("DISCORD_WEBHOOK_PAYMENT", {
    embeds: [{
      title: "🚨 CHARGEBACK / DISPUTE — WHOP",
      color: 0xFF0000,
      fields: [
        { name: "Client",  value: name,      inline: true },
        { name: "Email",   value: email,     inline: true },
        { name: "Amount",  value: formatted, inline: true },
      ],
      footer: { text: "@Admin — respond to this dispute ASAP in your Whop dashboard." },
    }],
  });
  return new Response("ok", { status: 200 });
}

async function handleMembershipDeactivated(payload: WhopPayload): Promise<Response> {
  const user = payload.data?.membership?.user ?? payload.data?.user;
  const name  = user?.name ?? user?.username ?? "Unknown";
  const email = user?.email ?? "—";
  await postDiscord("DISCORD_WEBHOOK_NEW_CLIENT", {
    embeds: [{
      title: "🔴 MEMBERSHIP DEACTIVATED — WHOP",
      color: 0x888888,
      fields: [
        { name: "Client", value: name,  inline: true },
        { name: "Email",  value: email, inline: true },
      ],
      footer: { text: "Client's Whop access has been removed." },
    }],
  });
  return new Response("ok", { status: 200 });
}

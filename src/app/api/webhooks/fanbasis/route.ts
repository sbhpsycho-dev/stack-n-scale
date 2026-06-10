import { kv } from "@vercel/kv";
import { randomUUID, timingSafeEqual, createHash } from "crypto";
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

function verifyFanbasisSecret(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

function getFanbasisDealId(paymentId: string | undefined, email: string, amount: number, date: string): string {
  if (paymentId) return `fanbasis-${paymentId}`;
  // Deterministic fallback: hash of email + amount + date (rounded to day)
  const day = date.split("T")[0]; // "2026-05-26"
  const hash = createHash("sha256")
    .update(`${email}:${amount}:${day}`)
    .digest("hex")
    .slice(0, 16);
  return `fanbasis-anon-${hash}`;
}

// Accepts two shapes:
//   Native Fanbasis: { payment_id, buyer: { email, name }, amount }
//   Zapier flat:     { payment_id, email, name, amount }
type FanbasisPayload = {
  payment_id?: string;
  // native nested
  buyer?: { email?: string; name?: string };
  // zapier flat
  email?: string;
  name?: string;
  // amount in cents — Make.com sends as amount_cents, direct callers may use amount
  amount_cents?: number;
  amount?: number;
  currency?: string;
  // Optional — Drive folder IDs pre-created by Make.com
  drive_folder_id?:                 string;
  drive_folder_url?:                string;
  drive_id_verification_folder_id?: string;
  drive_onboarding_folder_id?:      string;
  drive_notes_folder_id?:           string;
};

export async function POST(req: Request) {
  try {
    return await handleFanbasis(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[fanbasis] Unhandled error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

async function handleFanbasis(req: Request) {
  const secret = process.env.FANBASIS_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 500 });
  const provided = req.headers.get("x-webhook-secret");
  if (!verifyFanbasisSecret(provided, secret)) return new Response("Unauthorized", { status: 401 });

  let payload: FanbasisPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Support both native nested and Zapier flat shapes
  const email = (payload.buyer?.email ?? payload.email)?.toLowerCase().trim();
  const rawName = (payload.buyer?.name ?? payload.name)?.trim() ?? "";
  const amountCents = payload.amount_cents ?? payload.amount ?? 0;

  if (!email || !rawName) return new Response("Missing email or name", { status: 400 });

  // Dedupe on payment_id if present (prevents double-fire on retries)
  if (payload.payment_id) {
    const paymentKey = `sns:fanbasis:payment:${payload.payment_id}`;
    const alreadyProcessed = await kv.get(paymentKey);
    if (alreadyProcessed) return new Response("ok", { status: 200 });
    await kv.set(paymentKey, true, { ex: 60 * 60 * 24 * 7 });
  }

  // ── Deal record ────────────────────────────────────────────────────────────────
  if (amountCents > 0) {
    const dealDate    = new Date().toISOString();
    const grossAmount = amountCents / 100;
    const dealId      = getFanbasisDealId(payload.payment_id, email, grossAmount, dealDate);
    const deal: Deal  = {
      id:           dealId,
      date:         dealDate.split("T")[0],
      clientName:   rawName,
      offer:        ((payload as Record<string, string>).offer === "10K" ? "10K" : "5K") as Deal["offer"],
      grossAmount,
      processor:    "fanbasis",
      processorFee: 0,
      netAmount:    grossAmount,
      leadSource:   ((payload as Record<string, string>).lead_source === "organic" ? "organic" : "ad") as Deal["leadSource"],
      dmSetter:     (payload as Record<string, string>).dm_setter   ?? null,
      setter:       (payload as Record<string, string>).setter      ?? null,
      closer:       (payload as Record<string, string>).closer      ?? null,
      payouts:      {} as Deal["payouts"],
      payoutStatus: "pending",
      notes:        "",
    };
    deal.payouts = calculatePayouts(deal);
    // Idempotency check: skip if this deal ID was already stored
    const dedupKey = `sns:fanbasis:deal:${dealId}`;
    const alreadyStored = !(await kv.set(dedupKey, true, { nx: true, ex: 60 * 60 * 24 * 7 }));
    if (!alreadyStored) {
      await kv.set(`sns:deals:${dealId}`, deal);
      await kvSafeLpush("sns:deals:index", dealId);
      // Dual-path: Make.com (primary) + direct Sheets (fallback while migrating)
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
        setter:       deal.setter ?? null,
        closer:       deal.closer ?? null,
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
    name: rawName,
    email,
    phone: undefined,
    status: "payment_received",
    createdAt: now,
    idVerification: "pending",
    driveFolder,
  };
  await kv.set(clientKey, client);

  // 3b. Create lead record for follow-up tracking
  const leadId = randomUUID();
  const lead: Lead = {
    id: leadId, name: rawName, email,
    source: "fanbasis", state: "opted_in",
    createdAt: now, updatedAt: now, contactHistory: [],
  };
  await kv.set(`sns:leads:${leadId}`, lead);
  await kvSafeLpush("sns:leads:index", leadId);

  // 4. Welcome + onboarding email + campaign sequence
  const SKOOL_LINK = "https://www.skool.com/stack-n-scale-enterprises-2384";
  const APP_URL = (process.env.NEXTAUTH_URL ?? "https://stack-n-scale.vercel.app").replace(/\/$/, "");
  const idVerificationUrl = `${APP_URL}/onboarding/id-submit?email=${encodeURIComponent(email)}&name=${encodeURIComponent(rawName)}`;
  triggerEmail("welcome", email, rawName, {
    driveFolderUrl: driveFolder?.url,
    skoolLink: SKOOL_LINK,
  }).catch(e => console.error("Welcome email error:", e));
  triggerEmail("id_verification_request", email, rawName, { idVerificationUrl })
    .catch(e => console.error("ID verification request email error:", e));
  triggerCampaign(email, rawName, amountCents, "fanbasis").catch(e => console.error("Campaign trigger error:", e));

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
            { name: "Source", value: "Fanbasis",  inline: true },
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

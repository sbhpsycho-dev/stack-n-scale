import { after } from "next/server";
import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import { createContact } from "@/lib/ghl";
import { triggerEmailTracked, triggerCampaign } from "@/lib/email";
import { setupClientFolder } from "@/lib/drive";
import type { CoachingClient } from "@/lib/coaching-types";
import type { Lead } from "@/lib/lead-types";
import type { Deal } from "@/lib/deal-types";
import { calculatePayouts } from "@/lib/payout-calc";
import { syncDealToSheets } from "@/lib/sheets-sync";
import { triggerScenario } from "@/lib/make";
import { webhookUrl } from "@/lib/discord";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeTier, packageLabel, verifyWhopSignature, type StudentTier } from "@/lib/whop";

export const runtime = "nodejs";

const WHOP_FEE_RATE = 0.03; // 3% on Whop's free plan — set to 0 on a paid plan
const SKOOL_LINK = "https://www.skool.com/stack-n-scale-enterprises-2384";
const VIP_GOLD = 16766720;     // 0xFFD700
const BRAND_ORANGE = 16737792; // matches the existing new-client embed

type WhopUser = { id?: string; email?: string; name?: string; username?: string };

type WhopPayload = {
  event?: string;
  data?: {
    id?: string;
    final_amount?: number; // cents
    amount?: number;       // refund/dispute may use this
    reason?: string;
    user?: WhopUser;
    membership?: { id?: string; user?: WhopUser };
    // plan/product name (best-effort across Whop payload shapes)
    plan?: { name?: string };
    product?: { name?: string };
    offer?: string;
    // optional attribution passed through Make.com
    lead_source?: string;
    dm_setter?: string;
    setter?: string;
    closer?: string;
  };
  // Drive folder IDs optionally pre-created by Make.com
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
    console.error("[whop-webhook] Unhandled error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function handleWhop(req: Request) {
  // ── 1. Receive & verify ──────────────────────────────────────────────────────
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 500 });

  const rawBody = await req.text();
  const svixId        = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  const proxySecret   = req.headers.get("x-webhook-secret");

  // Record-only mode: when called by the Make.com scenario (which owns the customer-facing
  // emails + Discord), skip notifications here and just persist deal/client/lead + the
  // Supabase idempotency row so the SNS dashboards keep working. Header `x-skip-notify: 1`
  // or query `?notify=0`.
  const skipNotify =
    req.headers.get("x-skip-notify") === "1" ||
    new URL(req.url).searchParams.get("notify") === "0";

  // Direct from Whop → verify Svix signature. Via Make.com proxy → shared-secret header.
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

  // Route by event type — non-payment events post a lightweight Discord alert.
  const event = payload.event ?? "payment_succeeded";
  if (event === "refund_created")         return handleRefund(payload);
  if (event === "dispute_created")        return handleDispute(payload);
  if (event === "membership_deactivated") return handleMembershipDeactivated(payload);
  if (event !== "payment_succeeded" && event !== "payment.succeeded") {
    return new Response("ok", { status: 200 });
  }

  // Parse: name, email, amount, plan
  const paymentId   = payload.data?.id;
  const amountCents = payload.data?.final_amount ?? 0;
  const amount      = amountCents / 100;
  const user        = payload.data?.user;
  const email       = user?.email?.toLowerCase().trim();
  const rawName     = (user?.name ?? user?.username ?? "").trim();
  const planName    = payload.data?.plan?.name ?? payload.data?.product?.name ?? payload.data?.offer ?? null;

  if (!email || !rawName) return new Response("Missing email or name", { status: 400 });

  // ── 3. Determine student tier from amount paid ───────────────────────────────
  const tier = computeTier(amount);

  // ── 2. Idempotency (Supabase, insert-first) ──────────────────────────────────
  // Idempotency key: Whop payment id, falling back to the Svix delivery id.
  const idempotencyKey = paymentId ?? svixId ?? randomUUID();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data: inserted, error } = await supabase
      .from("payments")
      .upsert(
        {
          whop_event_id:  idempotencyKey,
          customer_name:  rawName,
          customer_email: email,
          amount,
          amount_cents:   amountCents,
          plan_name:      planName,
          tier,
          status:         "processing",
          raw:            payload,
        },
        { onConflict: "whop_event_id", ignoreDuplicates: true }
      )
      .select("id");

    if (error) {
      // DB failure is non-critical to Whop — log and continue without dedup guarantee.
      console.error("[whop-webhook] payments upsert error:", error.message);
    } else if (!inserted || inserted.length === 0) {
      // Conflict on whop_event_id → already processed. Stop, no duplicate side effects.
      return new Response("ok", { status: 200 });
    }
  } else {
    console.warn("[whop-webhook] Supabase not configured — processing without idempotency log");
  }

  // ── 4–6. Heavy work runs after the 200 (matches the Stripe route pattern). ────
  after(async () => {
    const flags = { idEmailOk: false, welcomeEmailOk: false, discordOk: false };
    try {
      await processOnboarding(payload, { email, rawName, amountCents, amount, tier, planName, paymentId }, flags, skipNotify);
      await updatePaymentRow(idempotencyKey, { ...flags, status: "completed" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[whop-webhook] post-response processing error:", msg);
      await updatePaymentRow(idempotencyKey, { ...flags, status: "error", error: msg });
    }
  });

  return new Response("ok", { status: 200 });
}

type PaymentCtx = {
  email: string;
  rawName: string;
  amountCents: number;
  amount: number;
  tier: StudentTier;
  planName: string | null;
  paymentId?: string;
};

/** GHL contact, Drive folders, deal/client/lead records, the two emails, and Discord. */
async function processOnboarding(
  payload: WhopPayload,
  ctx: PaymentCtx,
  flags: { idEmailOk: boolean; welcomeEmailOk: boolean; discordOk: boolean },
  skipNotify = false,
) {
  const { email, rawName, amountCents, amount, tier, planName, paymentId } = ctx;

  // ── Deal record (feeds payouts / dashboards / sheets) ────────────────────────
  if (amountCents > 0) {
    const grossAmount  = amount;
    const processorFee = parseFloat((grossAmount * WHOP_FEE_RATE).toFixed(2));
    const dealId       = paymentId ? `whop-${paymentId}` : `whop-anon-${randomUUID()}`;
    const deal: Deal = {
      id:           dealId,
      date:         new Date().toISOString().split("T")[0],
      clientName:   rawName,
      clientEmail:  email,
      offer:        (payload.data?.offer === "10K" ? "10K" : "5K") as Deal["offer"],
      grossAmount,
      processor:    "whop",
      processorFee,
      netAmount:    parseFloat((grossAmount - processorFee).toFixed(2)),
      leadSource:   (payload.data?.lead_source === "organic" ? "organic" : "ad") as Deal["leadSource"],
      dmSetter:     payload.data?.dm_setter ?? null,
      setter:       payload.data?.setter    ?? null,
      closer:       payload.data?.closer    ?? null,
      payouts:      {} as Deal["payouts"],
      payoutStatus: "pending",
      notes:        "",
    };
    deal.payouts = calculatePayouts(deal);

    const dealStored = await kv.set(`sns:whop:deal:${dealId}`, true, { nx: true, ex: 60 * 60 * 24 * 7 });
    if (dealStored) {
      await kv.set(`sns:deals:${dealId}`, deal);
      await kvSafeLpush("sns:deals:index", dealId);
      const dealPayload = {
        id: deal.id, date: deal.date, clientName: deal.clientName, offer: deal.offer,
        grossAmount: deal.grossAmount, netAmount: deal.netAmount, leadSource: deal.leadSource,
        processor: deal.processor, dmSetter: deal.dmSetter, setter: deal.setter,
        closer: deal.closer, payouts: deal.payouts, payoutStatus: deal.payoutStatus, notes: deal.notes,
      };
      triggerScenario("MAKE_DEAL_WEBHOOK_URL", dealPayload).catch(() => {});
      if (!process.env.MAKE_DEAL_WEBHOOK_URL) {
        syncDealToSheets(deal).catch(e => console.error("[sheets]", e));
      }
    }
  }

  // ── Client + Lead records (skip expensive work if client already exists) ─────
  const clientKey = `sns:coaching:client:${email}`;
  const existing = await kv.get<CoachingClient>(clientKey);
  if (!existing) {
    const [firstName, ...rest] = rawName.split(" ");
    const lastName = rest.join(" ") || undefined;

    let ghlContactId = "";
    try {
      const contact = await createContact({ firstName, lastName, email, tags: ["coaching-client"] });
      ghlContactId = contact.id;
    } catch (e) {
      console.error("GHL createContact error:", e);
    }

    let driveFolder: CoachingClient["driveFolder"] = null;
    if (payload.drive_folder_id) {
      driveFolder = {
        id:                     payload.drive_folder_id,
        url:                    payload.drive_folder_url ?? `https://drive.google.com/drive/folders/${payload.drive_folder_id}`,
        idVerificationFolderId: payload.drive_id_verification_folder_id ?? "",
        onboardingFolderId:     payload.drive_onboarding_folder_id ?? "",
        notesFolderId:          payload.drive_notes_folder_id ?? "",
        docs:                   {},
      };
    } else if (process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID) {
      try {
        const folders = await setupClientFolder(rawName);
        driveFolder = {
          url:                    folders.folderUrl,
          id:                     folders.folderId,
          idVerificationFolderId: folders.idVerificationFolderId,
          onboardingFolderId:     folders.onboardingFolderId,
          notesFolderId:          folders.notesFolderId,
          docs:                   folders.docs,
        };
      } catch (e) {
        console.error("Drive folder setup error:", e);
      }
    }

    const now = new Date().toISOString();
    const client: CoachingClient = {
      ghlContactId, name: rawName, email, phone: undefined,
      status: "payment_received", createdAt: now, idVerification: "pending", driveFolder,
    };
    // Atomic create — guards against concurrent deliveries racing on the same client.
    const created = await kv.set(clientKey, client, { nx: true });
    if (created) {
      const leadId = randomUUID();
      const lead: Lead = {
        id: leadId, name: rawName, email, source: "whop", state: "opted_in",
        createdAt: now, updatedAt: now, contactHistory: [],
      };
      await kv.set(`sns:leads:${leadId}`, lead);
      await kvSafeLpush("sns:leads:index", leadId);
    }
  }

  // Record-only mode (called by the Make.com scenario, which sends emails + Discord itself):
  // stop here so we don't double-notify the client. Deal/client/lead + payments row are persisted.
  if (skipNotify) return;

  // ── 4. Two emails (tracked) ──────────────────────────────────────────────────
  const APP_URL = (process.env.NEXTAUTH_URL ?? "https://stack-n-scale.vercel.app").replace(/\/$/, "");
  const idVerificationUrl = `${APP_URL}/onboarding/id-submit?email=${encodeURIComponent(email)}&name=${encodeURIComponent(rawName)}`;
  const driveFolderUrl = existing?.driveFolder?.url;

  // a) ID Verification email (onboarding forms live in the Make.com template)
  flags.idEmailOk = await triggerEmailTracked("id_verification_request", email, rawName, { idVerificationUrl });
  // b) Welcome email (school/login link via Skool)
  flags.welcomeEmailOk = await triggerEmailTracked("welcome", email, rawName, { skoolLink: SKOOL_LINK, driveFolderUrl });
  triggerCampaign(email, rawName, amountCents, "whop").catch(e => console.error("Campaign trigger error:", e));

  // ── 5. "New Client" Discord embed → DISCORD_WEBHOOK_URL ──────────────────────
  flags.discordOk = await postNewClientEmbed({ rawName, email, tier, amount, planName, ...flags });

  // Preserved legacy notifications (payment / deal-closed / new-client channels).
  await postLegacyNotifications(rawName, email, amount);
}

/** Builds + posts the brief's "New Client" embed. VIP is visually distinct. */
async function postNewClientEmbed(args: {
  rawName: string; email: string; tier: StudentTier; amount: number; planName: string | null;
  idEmailOk: boolean; welcomeEmailOk: boolean;
}): Promise<boolean> {
  const url = await webhookUrl("DISCORD_WEBHOOK_URL");
  if (!url) {
    console.warn("DISCORD_WEBHOOK_URL not set — skipping New Client embed");
    return false;
  }

  const isVip = args.tier === "VIP Student";
  const studentType = isVip ? `👑 **${args.tier}**` : args.tier;
  const pkg = args.planName ? `${args.planName} (${packageLabel(args.amount)})` : packageLabel(args.amount);

  let onboarding: string;
  if (args.idEmailOk && args.welcomeEmailOk) {
    onboarding = "✅ All onboarding forms and ID verifications have been sent.";
  } else {
    const failed: string[] = [];
    if (!args.idEmailOk) failed.push("ID Verification email");
    if (!args.welcomeEmailOk) failed.push("Welcome email");
    onboarding = `⚠️ Failed to send: ${failed.join(" + ")}. Send manually.`;
  }

  const embed = {
    title: "New Client",
    color: isVip ? VIP_GOLD : BRAND_ORANGE,
    fields: [
      { name: "Name",         value: args.rawName,  inline: true },
      { name: "Email",        value: args.email,    inline: true },
      { name: "Student Type", value: studentType,   inline: true },
      { name: "Package",      value: pkg,           inline: true },
      { name: "Onboarding",   value: onboarding,    inline: false },
    ],
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (e) {
    console.error("New Client embed error:", e);
    return false;
  }
}

/** The payment / deal-closed / new-client channel pings carried over from the old route. */
async function postLegacyNotifications(rawName: string, email: string, amount: number) {
  const formatted = `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const [paymentUrl, dealClosedUrl, newClientUrl] = await Promise.all([
    webhookUrl("DISCORD_WEBHOOK_PAYMENT"),
    webhookUrl("DISCORD_WEBHOOK_DEAL_CLOSED"),
    webhookUrl("DISCORD_WEBHOOK_NEW_CLIENT"),
  ]);
  const notifications = [
    { url: paymentUrl, body: { content: `💰 New payment received from **${rawName}** — ${formatted}` } },
    { url: dealClosedUrl, body: { content: `🔥 **DEAL CLOSED — NEW CLIENT**\n**${rawName}** just joined the program!\nAmount: **${formatted}**\n@Coach @Admin — onboarding is firing automatically.` } },
    {
      url: newClientUrl,
      body: {
        embeds: [{
          title: "🎉 NEW CLIENT ONBOARDED",
          description: `Welcome **${rawName}** to the program!`,
          color: BRAND_ORANGE,
          fields: [
            { name: "Amount", value: formatted, inline: true },
            { name: "Email",  value: email,     inline: true },
            { name: "Source", value: "Whop",    inline: true },
          ],
          footer: { text: "@Coach — reach out within 24 hours to book their kickoff call" },
        }],
      },
    },
  ];
  await Promise.all(
    notifications.filter(n => n.url).map(n =>
      fetch(n.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(n.body),
        signal: AbortSignal.timeout(5000),
      }).catch(e => console.error("Discord webhook error:", e))
    )
  );
}

/** Patch the payments row with send/post outcomes. No-op if Supabase isn't configured. */
async function updatePaymentRow(
  whopEventId: string,
  patch: { idEmailOk?: boolean; welcomeEmailOk?: boolean; discordOk?: boolean; status: string; error?: string },
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase
    .from("payments")
    .update({
      id_email_sent:      patch.idEmailOk ?? false,
      welcome_email_sent: patch.welcomeEmailOk ?? false,
      discord_posted:     patch.discordOk ?? false,
      status:             patch.status,
      error:              patch.error ?? null,
    })
    .eq("whop_event_id", whopEventId);
  if (error) console.error("[whop-webhook] payments update error:", error.message);
}

// ── Lightweight non-payment event handlers (Discord alert only) ────────────────

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
  const cents = payload.data?.amount ?? payload.data?.final_amount ?? 0;
  await postDiscord("DISCORD_WEBHOOK_PAYMENT", {
    embeds: [{
      title: "⚠️ REFUND ISSUED — WHOP",
      color: 0xFF4444,
      fields: [
        { name: "Client", value: user?.name ?? user?.username ?? "Unknown", inline: true },
        { name: "Email",  value: user?.email ?? "—", inline: true },
        { name: "Amount", value: `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, inline: true },
        { name: "Reason", value: payload.data?.reason ?? "—", inline: false },
      ],
      footer: { text: "Review deal record and update payout status if needed." },
    }],
  });
  return new Response("ok", { status: 200 });
}

async function handleDispute(payload: WhopPayload): Promise<Response> {
  const user = payload.data?.user;
  const cents = payload.data?.amount ?? payload.data?.final_amount ?? 0;
  await postDiscord("DISCORD_WEBHOOK_PAYMENT", {
    embeds: [{
      title: "🚨 CHARGEBACK / DISPUTE — WHOP",
      color: 0xFF0000,
      fields: [
        { name: "Client", value: user?.name ?? user?.username ?? "Unknown", inline: true },
        { name: "Email",  value: user?.email ?? "—", inline: true },
        { name: "Amount", value: cents > 0 ? `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—", inline: true },
      ],
      footer: { text: "@Admin — respond to this dispute ASAP in your Whop dashboard." },
    }],
  });
  return new Response("ok", { status: 200 });
}

async function handleMembershipDeactivated(payload: WhopPayload): Promise<Response> {
  const user = payload.data?.membership?.user ?? payload.data?.user;
  await postDiscord("DISCORD_WEBHOOK_NEW_CLIENT", {
    embeds: [{
      title: "🔴 MEMBERSHIP DEACTIVATED — WHOP",
      color: 0x888888,
      fields: [
        { name: "Client", value: user?.name ?? user?.username ?? "Unknown", inline: true },
        { name: "Email",  value: user?.email ?? "—", inline: true },
      ],
      footer: { text: "Client's Whop access has been removed." },
    }],
  });
  return new Response("ok", { status: 200 });
}

/** LPUSH that self-heals if the key holds a plain array (migrates existing entries). */
async function kvSafeLpush(key: string, value: string): Promise<void> {
  try {
    await kv.lpush(key, value);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("WRONGTYPE")) {
      const existing = (await kv.get<string[]>(key)) ?? [];
      await kv.del(key);
      const merged = [...new Set([...existing, value])];
      if (merged.length > 0) await kv.lpush(key, ...merged);
    } else {
      throw e;
    }
  }
}

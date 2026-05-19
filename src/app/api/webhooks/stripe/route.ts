import { after } from "next/server";
import Stripe from "stripe";
import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import { createContact } from "@/lib/ghl";
import { triggerEmail, triggerCampaign } from "@/lib/email";
import { setupClientFolder } from "@/lib/drive";
import type { CoachingClient } from "@/lib/coaching-types";
import type { Lead } from "@/lib/lead-types";
import type { Deal } from "@/lib/deal-types";
import { calculatePayouts } from "@/lib/payout-calc";
import { syncDealToSheets } from "@/lib/sheets-sync";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return new Response("ok", { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const email = session.customer_details?.email?.toLowerCase().trim();
  const rawName = session.customer_details?.name?.trim() ?? "";
  const phone = session.customer_details?.phone ?? undefined;

  if (!email || !rawName) return new Response("Missing customer info", { status: 400 });

  const amountTotal = session.amount_total ?? 0;

  // ── Deal record — idempotent on session.id, fires for new AND returning clients
  const dealId = `stripe-${session.id}`;
  if (amountTotal > 0 && !(await kv.get(`sns:deals:${dealId}`))) {
    const grossAmount  = amountTotal / 100;
    const processorFee = parseFloat((grossAmount * 0.029 + 0.30).toFixed(2));
    const deal: Deal = {
      id:           dealId,
      date:         new Date(session.created * 1000).toISOString().split("T")[0],
      clientName:   rawName,
      offer:        (session.metadata?.offer === "10K" ? "10K" : "5K") as Deal["offer"],
      grossAmount,
      processor:    "stripe",
      processorFee,
      netAmount:    parseFloat((grossAmount - processorFee).toFixed(2)),
      leadSource:   (session.metadata?.leadSource === "organic" ? "organic" : "ad") as Deal["leadSource"],
      dmSetter:     session.metadata?.dmSetter   ?? null,
      setter:       session.metadata?.setter     ?? null,
      closer:       session.metadata?.closer     ?? null,
      payouts:      {} as Deal["payouts"],
      payoutStatus: "pending",
      notes:        session.metadata?.notes      ?? "",
    };
    deal.payouts = calculatePayouts(deal);
    await kv.set(`sns:deals:${dealId}`, deal);
    const idx = (await kv.get<string[]>("sns:deals:index")) ?? [];
    await kv.set("sns:deals:index", [dealId, ...idx]);
    syncDealToSheets(deal).catch(e => console.error("Sheets sync error:", e));
  }

  const clientKey = `sns:coaching:client:${email}`;

  // Fast-path: skip expensive API calls if client already exists
  const existing = await kv.get<CoachingClient>(clientKey);
  if (existing) return new Response("ok", { status: 200 });

  const [firstName, ...rest] = rawName.split(" ");
  const lastName = rest.join(" ") || undefined;

  let ghlContactId = "";
  try {
    const contact = await createContact({ firstName, lastName, email, phone, tags: ["coaching-client"] });
    ghlContactId = contact.id;
  } catch (e) {
    console.error("GHL createContact error:", e);
  }

  let driveFolder: CoachingClient["driveFolder"] = null;
  if (process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID) {
    try {
      const folders = await setupClientFolder(rawName);
      driveFolder = {
        url: folders.folderUrl,
        id: folders.folderId,
        idVerificationFolderId: folders.idVerificationFolderId,
        onboardingFolderId: folders.onboardingFolderId,
        notesFolderId: folders.notesFolderId,
        docs: folders.docs,
      };
    } catch (e) {
      console.error("Drive folder setup error:", e);
    }
  }

  const client: CoachingClient = {
    ghlContactId,
    name: rawName,
    email,
    phone,
    status: "id_pending",
    createdAt: new Date().toISOString(),
    idVerification: "pending",
    driveFolder,
  };

  // Atomic set — only creates if key does not exist (prevents duplicate clients on concurrent events)
  const created = await kv.set(clientKey, client, { nx: true });
  if (!created) return new Response("ok", { status: 200 });

  // Create lead record for follow-up tracking
  const leadId = randomUUID();
  const lead: Lead = {
    id: leadId, name: rawName, email, phone,
    source: "stripe", state: "opted_in",
    createdAt: client.createdAt, updatedAt: client.createdAt, contactHistory: [],
  };
  await kv.set(`sns:leads:${leadId}`, lead);
  const leadIndex = (await kv.get<string[]>("sns:leads:index")) ?? [];
  await kv.set("sns:leads:index", [leadId, ...leadIndex]);

  after(async () => {
    const SKOOL_LINK = "https://www.skool.com/stack-n-scale-enterprises-2384";
    const APP_URL = (process.env.NEXTAUTH_URL ?? "https://stack-n-scale.vercel.app").replace(/\/$/, "");
    const idVerificationUrl = `${APP_URL}/onboarding/id-submit?email=${encodeURIComponent(email)}&name=${encodeURIComponent(rawName)}`;
    await triggerEmail("welcome", email, rawName, { skoolLink: SKOOL_LINK }).catch(e => console.error("Welcome email error:", e));
    await triggerEmail("id_verification_request", email, rawName, { idVerificationUrl }).catch(e => console.error("ID verification request email error:", e));
    await triggerCampaign(email, rawName, amountTotal, "stripe").catch(e => console.error("Campaign trigger error:", e));

    const amountDollars = (amountTotal / 100).toFixed(2);
    const formatted = `$${Number(amountDollars).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

    const discordNotifications = [
      {
        url: process.env.DISCORD_WEBHOOK_PAYMENT ?? "",
        body: { content: `💰 New payment received from **${rawName}** — ${formatted}` },
      },
      {
        url: process.env.DISCORD_WEBHOOK_DEAL_CLOSED ?? "",
        body: { content: `🔥 **DEAL CLOSED — NEW CLIENT**\n**${rawName}** just joined the program!\nAmount: **${formatted}**\n@Coach @Admin — onboarding is firing automatically.` },
      },
      {
        url: process.env.DISCORD_WEBHOOK_NEW_CLIENT ?? "",
        body: {
          embeds: [{
            title: "🎉 NEW CLIENT ONBOARDED",
            description: `Welcome **${rawName}** to the program!`,
            color: 16737792,
            fields: [
              { name: "Amount",  value: formatted,                   inline: true },
              { name: "Email",   value: email,                       inline: true },
              { name: "Status",  value: "✅ Payment confirmed\n✅ GHL contact tagged\n✅ Drive folder created\n✅ Welcome + Verification emails sent", inline: false },
            ],
            footer: { text: "@Coach — reach out within 24 hours to book their kickoff call" },
          }],
        },
      },
    ];

    await Promise.all(
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
    );
  });

  return new Response("ok", { status: 200 });
}

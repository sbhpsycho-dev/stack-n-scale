import Stripe from "stripe";
import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import { createContact } from "@/lib/ghl";
import { triggerEmail, triggerCampaign } from "@/lib/email";
import { setupClientFolder } from "@/lib/drive";
import type { CoachingClient } from "@/lib/coaching-types";
import type { Lead } from "@/lib/lead-types";

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

  const clientKey = `sns:coaching:client:${email}`;
  const existing = await kv.get<CoachingClient>(clientKey);

  // Skip if already created — Stripe can fire duplicate events
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
    status: "payment_received",
    createdAt: new Date().toISOString(),
    idVerification: "pending",
    driveFolder,
  };

  await kv.set(clientKey, client);

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

  const SKOOL_LINK = "https://www.skool.com/stack-n-scale-enterprises-2384";
  triggerEmail("welcome", email, rawName, { skoolLink: SKOOL_LINK }).catch(e => console.error("Welcome email error:", e));
  triggerCampaign(email, rawName, session.amount_total ?? 0, "stripe").catch(e => console.error("Campaign trigger error:", e));

  // Fire all three Discord notifications non-blocking
  const amountDollars = ((session.amount_total ?? 0) / 100).toFixed(2);
  const formatted = `$${Number(amountDollars).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  const discordNotifications = [
    // Payment alert
    {
      url: process.env.DISCORD_WEBHOOK_PAYMENT ?? "",
      body: { content: `💰 New payment received from **${rawName}** — ${formatted}` },
    },
    // Deal closed
    {
      url: process.env.DISCORD_WEBHOOK_DEAL_CLOSED ?? "",
      body: { content: `🔥 **DEAL CLOSED — NEW CLIENT**\n**${rawName}** just joined the program!\nAmount: **${formatted}**\n@Coach @Admin — onboarding is firing automatically.` },
    },
    // New client onboarded embed
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

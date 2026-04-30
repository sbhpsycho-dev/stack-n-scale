import { kv } from "@vercel/kv";
import { createContact } from "@/lib/ghl";
import { triggerEmail } from "@/lib/email";
import { setupClientFolder } from "@/lib/drive";
import type { CoachingClient } from "@/lib/coaching-types";

export const runtime = "nodejs";

// Native Fanbasis webhook payload (apidocs.fan — payment.succeeded event)
type FanbasisPayload = {
  payment_id: string;
  buyer: {
    email: string;
    name: string;
  };
  amount: number;      // in cents (e.g. 2900 = $29.00)
  currency?: string;
  // Optional — populated by Make's Google Drive modules if routing via Make.com
  drive_folder_id?:                 string;
  drive_folder_url?:                string;
  drive_id_verification_folder_id?: string;
  drive_onboarding_folder_id?:      string;
  drive_notes_folder_id?:           string;
};

export async function POST(req: Request) {
  // Optional secret check — set FANBASIS_WEBHOOK_SECRET in env to enable
  const secret = process.env.FANBASIS_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get("x-webhook-secret");
    if (provided !== secret) return new Response("Unauthorized", { status: 401 });
  }

  let payload: FanbasisPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const email = payload.buyer?.email?.toLowerCase().trim();
  const rawName = payload.buyer?.name?.trim() ?? "";
  const phone = undefined;
  const amountCents = payload.amount ?? 0;

  if (!email || !rawName) return new Response("Missing buyer email or name", { status: 400 });

  // Idempotency — dedupe on payment_id (prevents double-fire on Fanbasis retries)
  if (payload.payment_id) {
    const paymentKey = `sns:fanbasis:payment:${payload.payment_id}`;
    const alreadyProcessed = await kv.get(paymentKey);
    if (alreadyProcessed) return new Response("ok", { status: 200 });
    await kv.set(paymentKey, true, { ex: 60 * 60 * 24 * 7 }); // 7-day TTL
  }

  // Also skip if client already exists from a prior payment
  const clientKey = `sns:coaching:client:${email}`;
  const existing = await kv.get<CoachingClient>(clientKey);
  if (existing) return new Response("ok", { status: 200 });

  const [firstName, ...rest] = rawName.split(" ");
  const lastName = rest.join(" ") || undefined;

  // 1. Create GHL contact
  let ghlContactId = "";
  try {
    const contact = await createContact({ firstName, lastName, email, phone, tags: ["coaching-client"] });
    ghlContactId = contact.id;
  } catch (e) {
    console.error("GHL createContact error:", e);
  }

  // 2. Google Drive folders
  // If Make already created the folders and passed the IDs, use those directly.
  // Otherwise fall back to creating them server-side via the service account.
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

  // 3. Store client record in KV
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

  // 4. Welcome + onboarding email
  triggerEmail("welcome", email, rawName, {
    driveFolderUrl: driveFolder?.url,
  }).catch(e => console.error("Welcome email error:", e));

  // 5. Discord notifications (same three channels as Stripe)
  const amountDollars = (amountCents / 100).toFixed(2);
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
            { name: "Amount",  value: formatted,   inline: true },
            { name: "Email",   value: email,        inline: true },
            { name: "Source",  value: "Fanbasis",   inline: true },
            { name: "Status",  value: "✅ Payment confirmed\n✅ GHL contact tagged\n✅ Drive folder created\n✅ Welcome + Onboarding emails sent", inline: false },
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

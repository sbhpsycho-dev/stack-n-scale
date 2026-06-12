import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import { createContact } from "@/lib/ghl";
import { triggerEmail, triggerCampaign } from "@/lib/email";
import { setupClientFolder } from "@/lib/drive";
import { calculatePayouts } from "@/lib/payout-calc";
import { syncDealToSheets } from "@/lib/sheets-sync";
import type { CoachingClient } from "@/lib/coaching-types";
import type { Lead } from "@/lib/lead-types";
import type { Deal } from "@/lib/deal-types";
import { webhookUrl } from "@/lib/discord";

const SKOOL_LINK = "https://www.skool.com/stack-n-scale-enterprises-2384";

export async function triggerOnboarding(opts: {
  name: string;
  email: string;
  amountCents: number;
  programType: "standard" | "vip";
  paymentId: string;
  source?: string;
  driveFolder?: {
    id: string;
    url?: string;
    idVerificationFolderId?: string;
    onboardingFolderId?: string;
    notesFolderId?: string;
  };
}): Promise<{ ok: boolean; error?: string }> {
  const { name: rawName, email, amountCents, paymentId, source = "discord", driveFolder: preDriveFolder } = opts;

  try {
    // Dedupe — prevent double-processing
    const seenKey = `sns:payment:seen:${paymentId}`;
    const alreadySeen = await kv.get(seenKey);
    if (alreadySeen) return { ok: true };
    await kv.set(seenKey, true, { ex: 60 * 60 * 24 * 7 });

    // Deal record
    if (amountCents > 0) {
      const dealId     = `${source}-${paymentId}`;
      const grossAmount = amountCents / 100;
      const offer: Deal["offer"] = grossAmount >= 9000 ? "10K" : "5K";
      const deal: Deal = {
        id:           dealId,
        date:         new Date().toISOString().split("T")[0],
        clientName:   rawName,
        offer,
        grossAmount,
        processor:    source as Deal["processor"],
        processorFee: 0,
        netAmount:    grossAmount,
        leadSource:   "organic",
        dmSetter:     null,
        setter:       null,
        closer:       null,
        payouts:      {} as Deal["payouts"],
        payoutStatus: "pending",
        notes:        "",
      };
      deal.payouts = calculatePayouts(deal);
      await kv.set(`sns:deals:${dealId}`, deal);
      const idx = (await kv.get<string[]>("sns:deals:index")) ?? [];
      await kv.set("sns:deals:index", [dealId, ...idx]);
      syncDealToSheets(deal).catch(e => console.error("Sheets sync error:", e));
    }

    // Skip if client already exists
    const clientKey = `sns:coaching:client:${email}`;
    const existing  = await kv.get<CoachingClient>(clientKey);
    if (existing) return { ok: true };

    const [firstName, ...rest] = rawName.split(" ");
    const lastName = rest.join(" ") || undefined;

    // GHL contact
    let ghlContactId = "";
    try {
      const contact = await createContact({ firstName, lastName, email, phone: undefined, tags: ["coaching-client"] });
      ghlContactId = contact.id;
    } catch (e) {
      console.error("GHL createContact error:", e);
    }

    // Drive folders
    let driveFolder: CoachingClient["driveFolder"] = null;
    if (preDriveFolder?.id) {
      driveFolder = {
        id:                     preDriveFolder.id,
        url:                    preDriveFolder.url ?? `https://drive.google.com/drive/folders/${preDriveFolder.id}`,
        idVerificationFolderId: preDriveFolder.idVerificationFolderId ?? "",
        onboardingFolderId:     preDriveFolder.onboardingFolderId ?? "",
        notesFolderId:          preDriveFolder.notesFolderId ?? "",
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

    // Store CoachingClient in KV
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

    // Lead record
    const leadId = randomUUID();
    const lead: Lead = {
      id: leadId, name: rawName, email,
      source: (source ?? "stripe") as "fanbasis" | "stripe" | "whop", state: "opted_in",
      createdAt: now, updatedAt: now, contactHistory: [],
    };
    await kv.set(`sns:leads:${leadId}`, lead);
    const leadIndex = (await kv.get<string[]>("sns:leads:index")) ?? [];
    await kv.set("sns:leads:index", [leadId, ...leadIndex]);

    // Welcome email + campaign
    triggerEmail("welcome", email, rawName, {
      driveFolderUrl: driveFolder?.url,
      skoolLink:      SKOOL_LINK,
    }).catch(e => console.error("Welcome email error:", e));
    triggerCampaign(email, rawName, amountCents, (source ?? "stripe") as "fanbasis" | "stripe" | "whop").catch(e => console.error("Campaign trigger error:", e));

    // Discord notifications
    const amountFormatted = `$${(amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const [paymentUrl, dealClosedUrl, newClientUrl] = await Promise.all([
      webhookUrl("DISCORD_WEBHOOK_PAYMENT"),
      webhookUrl("DISCORD_WEBHOOK_DEAL_CLOSED"),
      webhookUrl("DISCORD_WEBHOOK_NEW_CLIENT"),
    ]);
    const notifications = [
      {
        url:  paymentUrl,
        body: { content: `💰 New payment received from **${rawName}** — ${amountFormatted}` },
      },
      {
        url:  dealClosedUrl,
        body: { content: `🔥 **DEAL CLOSED — NEW CLIENT**\n**${rawName}** just joined the program!\nAmount: **${amountFormatted}**\n@Coach @Admin — onboarding is firing automatically.` },
      },
      {
        url:  newClientUrl,
        body: {
          embeds: [{
            title:       "🎉 NEW CLIENT ONBOARDED",
            description: `Welcome **${rawName}** to the program!`,
            color:       16737792,
            fields: [
              { name: "Amount", value: amountFormatted, inline: true },
              { name: "Email",  value: email,           inline: true },
              { name: "Source", value: source,          inline: true },
              { name: "Status", value: "✅ Payment confirmed\n✅ GHL contact tagged\n✅ Drive folder created\n✅ Welcome + Onboarding emails sent", inline: false },
            ],
            footer: { text: "@Coach — reach out within 24 hours to book their kickoff call" },
          }],
        },
      },
    ];

    Promise.all(
      notifications
        .filter(n => n.url)
        .map(n =>
          fetch(n.url, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(n.body),
            signal:  AbortSignal.timeout(5000),
          }).catch(e => console.error("Discord webhook error:", e))
        )
    ).catch(() => {});

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("triggerOnboarding error:", msg);
    return { ok: false, error: msg };
  }
}

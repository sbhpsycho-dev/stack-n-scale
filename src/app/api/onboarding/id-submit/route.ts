import { kv } from "@vercel/kv";
import type { CoachingClient } from "@/lib/coaching-types";
import { uploadFileToDrive, uploadTextToDrive, appendToSheet } from "@/lib/drive";
import { triggerEmail } from "@/lib/email";

const DISCORD_API = "https://discord.com/api/v10";
const BOT_TOKEN   = process.env.DISCORD_BOT_TOKEN ?? "";
const GUILD_ID    = process.env.DISCORD_GUILD_ID ?? "";
const CAELUM_ID   = process.env.DISCORD_CAELUM_USER_ID ?? "";


async function getOrCreateDmChannel(): Promise<string> {
  const res = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: CAELUM_ID }),
  });
  if (!res.ok) throw new Error(`DM channel create failed: ${await res.text()}`);
  const data = await res.json() as { id: string };
  return data.id;
}

async function getClientChannel(email: string): Promise<string | null> {
  const discord = await kv.get<{ channelId: string }>(`sns:onboarding:discord:${email}`);
  return discord?.channelId ?? null;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const name      = (formData.get("name") as string | null)?.trim() ?? "";
    const email     = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";
    const idFront   = formData.get("idFront") as File | null;
    const selfie    = formData.get("selfie") as File | null;
    const signature = formData.get("signature") as string | null;

    if (!name || !email || !idFront || !selfie) {
      return Response.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    // Update KV — mark idVerification as submitted
    const clientKey = `sns:coaching:client:${email}`;
    const existing  = await kv.get<CoachingClient>(clientKey);
    if (existing) {
      await kv.set(clientKey, {
        ...existing,
        idVerification: "submitted",
        status: "id_pending_review",
      });
    }

    // Store submission record
    await kv.set(`sns:onboarding:id-submit:${email}`, {
      name, email,
      submittedAt: new Date().toISOString(),
      consentGiven: true,
      hasSig: !!signature,
    });

    // Persist signature separately
    if (signature) {
      await kv.set(`sns:onboarding:sig:id:${email}`, signature);
    }

    const submittedAt = new Date().toISOString();

    // Append to Google Sheets — Sheet2 for ID verification (non-blocking)
    const sheetId = process.env.GOOGLE_SHEETS_ONBOARDING_ID;
    if (sheetId) {
      appendToSheet(sheetId, [submittedAt, name, email, "submitted", !!signature ? "yes" : "no"], "ID Verification!A:E")
        .catch(e => console.error("Sheets error (ID):", e));
    }

    // Upload ID files + text summary to the ID Verification subfolder
    const idFolderId = existing?.driveFolder?.idVerificationFolderId ?? existing?.driveFolder?.id;
    if (idFolderId) {
      try {
        const summary = [
          `ID Verification — ${name}`,
          `Email: ${email}`,
          `Submitted: ${submittedAt}`,
          `Consent: confirmed`,
          `Signature: ${signature ? "provided" : "not provided"}`,
        ].join("\n");

        const uploads: Promise<unknown>[] = [
          uploadFileToDrive(idFolderId, `${name} — ID Front`, idFront.type || "image/jpeg", await idFront.arrayBuffer()),
          uploadFileToDrive(idFolderId, `${name} — Selfie with ID`, selfie.type || "image/jpeg", await selfie.arrayBuffer()),
          uploadTextToDrive(idFolderId, `${name} — ID Verification Summary`, summary),
        ];
        if (signature) {
          const base64 = signature.replace(/^data:image\/\w+;base64,/, "");
          const sigBuffer = Buffer.from(base64, "base64");
          uploads.push(uploadFileToDrive(idFolderId, `${name} — Signature`, "image/png", sigBuffer));
        }
        await Promise.all(uploads);
      } catch (driveErr) {
        console.error("Drive upload error (ID):", driveErr);
      }
    }

    // Send ID received confirmation email (non-blocking)
    triggerEmail("id_received", email, name)
      .catch(e => console.error("ID received email error:", e));

    // If onboarding form was also submitted, send Discord link via email
    let discordOAuthUrl: string | null = null;
    try {
      const [formRecord, discordRecord] = await Promise.all([
        kv.get(`sns:onboarding:form:${email}`),
        kv.get<{ channelId: string; channelName: string; discordOAuthUrl?: string }>(
          `sns:onboarding:discord:${email}`
        ),
      ]);
      if (formRecord && discordRecord?.discordOAuthUrl) {
        discordOAuthUrl = discordRecord.discordOAuthUrl;
        const driveFolderUrl = existing?.driveFolder?.url ?? undefined;
        triggerEmail("discord_link", email, name, { discordOAuthUrl, driveFolderUrl })
          .catch(e => console.error("Discord link email error:", e));
      }
    } catch (e) {
      console.error("Both-complete check error:", e);
    }

    // Notify Discord (text only — files are in Drive)
    if (BOT_TOKEN && CAELUM_ID) {
      try {
        let channelId = await getClientChannel(email).catch(() => null);
        if (!channelId) channelId = await getOrCreateDmChannel();

        await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            content: [
              `🪪 **ID Verification Submitted — ${name}**`,
              `📧 ${email}`,
              `✅ Consent confirmed · Files saved to Google Drive`,
              existing?.driveFolder?.url ? `📁 ${existing.driveFolder.url}` : "",
            ].filter(Boolean).join("\n"),
          }),
        });
      } catch (discordErr) {
        console.error("Discord error:", discordErr);
      }
    }

    return Response.json({ ok: true, discordOAuthUrl });
  } catch (err) {
    console.error("ID submit error:", err);
    return Response.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

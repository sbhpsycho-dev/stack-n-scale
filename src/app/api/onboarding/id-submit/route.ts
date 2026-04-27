import { kv } from "@vercel/kv";
import { put } from "@vercel/blob";
import type { CoachingClient } from "@/lib/coaching-types";
import { appendToSheet } from "@/lib/drive";
import { triggerEmail, triggerDriveDocs } from "@/lib/email";

const DISCORD_API = "https://discord.com/api/v10";
const BOT_TOKEN   = process.env.DISCORD_BOT_TOKEN ?? "";
const CAELUM_ID   = process.env.DISCORD_CAELUM_USER_ID ?? "";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const EMAIL_REGEX   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    if (!EMAIL_REGEX.test(email)) {
      return Response.json({ ok: false, error: "Invalid email address" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(idFront.type) || !ALLOWED_TYPES.includes(selfie.type)) {
      return Response.json({ ok: false, error: "ID photos must be JPEG, PNG, or WebP images" }, { status: 400 });
    }

    if (idFront.size > MAX_FILE_SIZE || selfie.size > MAX_FILE_SIZE) {
      return Response.json({ ok: false, error: "File too large. Max 10MB per photo." }, { status: 400 });
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

    // Append to Google Sheets — ID Verification tab (non-blocking)
    const sheetId = process.env.GOOGLE_SHEETS_ONBOARDING_ID;
    if (sheetId) {
      appendToSheet(sheetId, [submittedAt, name, email, "submitted", signature ? "yes" : "no"], "ID Verification!A:E")
        .catch(e => console.error("Sheets error (ID):", e));
    }

    // Upload ID files to Vercel Blob — private access (non-blocking)
    const slug = email.replace(/[^a-z0-9]/gi, "-");
    const blobUploads: Promise<void>[] = [
      put(`id-verification/${slug}/id-front`, await idFront.arrayBuffer(), { access: "private", contentType: idFront.type || "image/jpeg" })
        .catch(e => console.error("Blob upload error (id-front):", e)),
      put(`id-verification/${slug}/selfie`, await selfie.arrayBuffer(), { access: "private", contentType: selfie.type || "image/jpeg" })
        .catch(e => console.error("Blob upload error (selfie):", e)),
    ];
    if (signature) {
      const base64 = signature.replace(/^data:image\/\w+;base64,/, "");
      blobUploads.push(
        put(`id-verification/${slug}/signature`, Buffer.from(base64, "base64"), { access: "private", contentType: "image/png" })
          .catch(e => console.error("Blob upload error (signature):", e))
      );
    }
    await Promise.all(blobUploads);

    // Send ID received confirmation email + Drive doc trigger (non-blocking)
    const idVerificationFolderId = existing?.driveFolder?.idVerificationFolderId ?? undefined;
    triggerEmail("id_received", email, name, { idVerificationFolderId })
      .catch(e => console.error("ID received email error:", e));
    triggerDriveDocs("id_received", email, name, { idVerificationFolderId })
      .catch(e => console.error("Drive docs error:", e));

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
        triggerEmail("discord_link", email, name, { discordOAuthUrl })
          .catch(e => console.error("Discord link email error:", e));
      }
    } catch (e) {
      console.error("Both-complete check error:", e);
    }

    // Notify Discord — no file URLs (files stored privately in Vercel Blob)
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
              `✅ Consent confirmed`,
              `📎 ID photo + selfie uploaded securely`,
              existing?.driveFolder?.url ? `📁 Drive: ${existing.driveFolder.url}` : "",
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

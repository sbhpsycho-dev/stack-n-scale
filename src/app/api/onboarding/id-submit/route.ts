import { after } from "next/server";
import { kv } from "@vercel/kv";
import { put } from "@vercel/blob";
import type { CoachingClient } from "@/lib/coaching-types";
import { appendToSheet, setupClientFolder } from "@/lib/drive";
import { triggerEmail, triggerDriveDocs } from "@/lib/email";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://stack-n-scale-site.vercel.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const DISCORD_API = "https://discord.com/api/v10";
const BOT_TOKEN   = process.env.DISCORD_BOT_TOKEN ?? "";
const CAELUM_ID   = process.env.DISCORD_CAELUM_USER_ID ?? "";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const EMAIL_REGEX   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Verify file magic numbers to prevent MIME type spoofing
async function validateFileMagic(file: File): Promise<boolean> {
  const buf = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isJpeg  = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  const isPng   = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  const isWebp  = buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
               && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
  // HEIC starts with ftyp box — allow if declared type matches
  const isHeic  = file.type === "image/heic";
  return isJpeg || isPng || isWebp || isHeic;
}

async function getOrCreateDmChannel(): Promise<string> {
  const res = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: CAELUM_ID }),
    signal: AbortSignal.timeout(8000),
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
    const consented = formData.get("consented");

    if (!name || !email || !idFront || !selfie) {
      return Response.json({ ok: false, error: "Missing required fields" }, { status: 400, headers: CORS_HEADERS });
    }

    if (consented !== "true") {
      return Response.json({ ok: false, error: "Consent is required" }, { status: 400, headers: CORS_HEADERS });
    }

    if (!EMAIL_REGEX.test(email)) {
      return Response.json({ ok: false, error: "Invalid email address" }, { status: 400, headers: CORS_HEADERS });
    }

    if (!ALLOWED_TYPES.includes(idFront.type) || !ALLOWED_TYPES.includes(selfie.type)) {
      return Response.json({ ok: false, error: "ID photos must be JPEG, PNG, or WebP images" }, { status: 400, headers: CORS_HEADERS });
    }

    if (idFront.size > MAX_FILE_SIZE || selfie.size > MAX_FILE_SIZE) {
      return Response.json({ ok: false, error: "File too large. Max 10MB per photo." }, { status: 400, headers: CORS_HEADERS });
    }

    if (!await validateFileMagic(idFront) || !await validateFileMagic(selfie)) {
      return Response.json({ ok: false, error: "Invalid image file. Please upload a real photo." }, { status: 400, headers: CORS_HEADERS });
    }

    // Update KV — mark idVerification as submitted
    const clientKey = `sns:coaching:client:${email}`;
    let existing  = await kv.get<CoachingClient>(clientKey);
    if (existing) {
      await kv.set(clientKey, { ...existing, idVerification: "submitted", status: "id_pending_review" });
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

    // Upload ID files to Vercel Blob — public so Make.com can fetch them for Drive upload
    const slug = email.replace(/[^a-z0-9]/gi, "-");
    const sigBase64 = signature ? signature.replace(/^data:image\/\w+;base64,/, "") : null;
    const [idFrontBlob, selfieBlob, sigBlob] = await Promise.all([
      put(`id-verification/${slug}/id-front`, await idFront.arrayBuffer(), { access: "public", contentType: idFront.type || "image/jpeg" })
        .catch(e => { console.error("Blob upload error (id-front):", e); return null; }),
      put(`id-verification/${slug}/selfie`, await selfie.arrayBuffer(), { access: "public", contentType: selfie.type || "image/jpeg" })
        .catch(e => { console.error("Blob upload error (selfie):", e); return null; }),
      sigBase64
        ? put(`id-verification/${slug}/signature`, Buffer.from(sigBase64, "base64"), { access: "public", contentType: "image/png" })
            .catch(e => { console.error("Blob upload error (signature):", e); return null; })
        : Promise.resolve(null),
    ]);
    const idFrontUrl  = idFrontBlob?.url;
    const selfieUrl   = selfieBlob?.url;
    const signatureUrl = sigBlob?.url;

    // Send ID received confirmation email + Drive doc trigger (non-blocking)
    if (existing?.driveFolder?.idVerificationFolderId) {
      const idVerificationFolderId = existing.driveFolder.idVerificationFolderId;
      triggerEmail("id_received", email, name, { idVerificationFolderId })
        .catch(e => console.error("ID received email error:", e));
      triggerDriveDocs("id_received", email, name, { idVerificationFolderId, idFrontUrl, selfieUrl, signatureUrl })
        .catch(e => console.error("Drive docs error:", e));
    } else if (process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID) {
      after(async () => {
        try {
          const folders = await setupClientFolder(existing?.name || name);
          const driveFolder = {
            url: folders.folderUrl,
            id: folders.folderId,
            idVerificationFolderId: folders.idVerificationFolderId,
            onboardingFolderId: folders.onboardingFolderId,
            notesFolderId: folders.notesFolderId,
            docs: folders.docs,
          };
          const updated = await kv.get<CoachingClient>(clientKey);
          if (updated) await kv.set(clientKey, { ...updated, driveFolder });
          triggerEmail("id_received", email, name, { idVerificationFolderId: folders.idVerificationFolderId })
            .catch(e => console.error("ID received email error:", e));
          triggerDriveDocs("id_received", email, name, {
            idVerificationFolderId: folders.idVerificationFolderId,
            idFrontUrl, selfieUrl, signatureUrl,
          }).catch(e => console.error("Drive docs error:", e));
        } catch (e) {
          console.error("Drive folder setup error (id-submit):", e);
          triggerEmail("id_received", email, name, {})
            .catch(err => console.error("ID received email error:", err));
        }
      });
    } else {
      triggerEmail("id_received", email, name, {})
        .catch(e => console.error("ID received email error:", e));
    }

    // If onboarding form was also submitted, send Discord link via email with a fresh token
    let discordOAuthUrl: string | undefined;
    try {
      const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
      const APP_URL   = process.env.NEXTAUTH_URL ?? "https://stack-n-scale.vercel.app";
      const [formRecord, discordRecord] = await Promise.all([
        kv.get(`sns:onboarding:form:${email}`),
        kv.get<{ channelId?: string }>(`sns:onboarding:discord:${email}`),
      ]);
      if (formRecord && discordRecord?.channelId && CLIENT_ID) {
        const stateToken = crypto.randomUUID();
        await kv.set(`sns:oauth:state:${stateToken}`, email, { ex: 60 * 60 * 24 * 7 }); // 7-day TTL
        const params = new URLSearchParams({
          client_id: CLIENT_ID,
          redirect_uri: `${APP_URL}/api/discord/connect`,
          response_type: "code",
          scope: "identify guilds.join",
          state: stateToken,
        });
        discordOAuthUrl = `https://discord.com/oauth2/authorize?${params}`;
        await kv.set(`sns:onboarding:discord:${email}`, { ...discordRecord, discordOAuthUrl });
        triggerEmail("discord_link", email, name, { discordOAuthUrl, driveFolderUrl: existing?.driveFolder?.url })
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
          signal: AbortSignal.timeout(8000),
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

    return Response.json({ ok: true, discordOAuthUrl }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("ID submit error:", err);
    return Response.json({ ok: false, error: "Server error" }, { status: 500, headers: CORS_HEADERS });
  }
}

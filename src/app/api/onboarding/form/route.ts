import { kv } from "@vercel/kv";
import { type CoachingClient } from "@/app/api/onboarding/clients/route";
import { appendToSheet, setupClientFolder, uploadTextToDrive } from "@/lib/drive";
import { triggerEmail, triggerDriveDocs } from "@/lib/email";

export const runtime = "nodejs";

const DISCORD_API  = "https://discord.com/api/v10";
const BOT_TOKEN    = process.env.DISCORD_BOT_TOKEN ?? "";
const GUILD_ID     = process.env.DISCORD_GUILD_ID ?? "";
const CAELUM_ID    = process.env.DISCORD_CAELUM_USER_ID ?? "";
const ADMIN2_ID    = process.env.DISCORD_ADMIN2_USER_ID ?? "";
const GENERAL_CH   = process.env.DISCORD_GENERAL_CHANNEL_ID ?? "";
const CLIENT_ID    = process.env.DISCORD_CLIENT_ID ?? "";
const APP_URL      = process.env.NEXTAUTH_URL ?? "https://stack-n-scale.vercel.app";

async function discordRequest(path: string, method: string, body?: unknown) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Discord ${method} ${path} failed: ${await res.text()}`);
  return res.json();
}

const MAX_TEXT_LEN = 2000;
const EMAIL_REGEX  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeForSheets(val: string): string {
  // Strip leading formula characters to prevent CSV/Sheets injection
  return val.replace(/^[=+\-@\t\r]/, "'");
}

function validateTextField(val: unknown, fieldName: string): string | null {
  if (typeof val !== "string" || !val.trim()) return `${fieldName} is required`;
  if (val.length > MAX_TEXT_LEN) return `${fieldName} exceeds maximum length`;
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name, email, motivation, whySNS,
      goal30Days, goal3Months, goal6Months, goal1Year,
      biggestChallenge, successIn90Days, additionalNotes,
    } = body;

    const requiredFields: [unknown, string][] = [
      [name, "Name"], [email, "Email"], [motivation, "Motivation"], [whySNS, "Why SNS"],
      [goal30Days, "30-day goal"], [goal3Months, "3-month goal"], [goal6Months, "6-month goal"],
      [goal1Year, "1-year goal"], [biggestChallenge, "Biggest challenge"], [successIn90Days, "Success in 90 days"],
    ];
    for (const [val, label] of requiredFields) {
      const err = validateTextField(val, label);
      if (err) return Response.json({ ok: false, error: err }, { status: 400 });
    }
    if (additionalNotes && (typeof additionalNotes !== "string" || additionalNotes.length > MAX_TEXT_LEN)) {
      return Response.json({ ok: false, error: "Additional notes exceeds maximum length" }, { status: 400 });
    }

    if (!EMAIL_REGEX.test(email)) {
      return Response.json({ ok: false, error: "Invalid email address" }, { status: 400 });
    }

    const submittedAt = new Date().toISOString();

    // 1. Save form response to KV
    await kv.set(`sns:onboarding:form:${email.toLowerCase()}`, {
      name, email, motivation, whySNS,
      goal30Days, goal3Months, goal6Months, goal1Year,
      biggestChallenge, successIn90Days,
      additionalNotes: additionalNotes ?? "",
      submittedAt,
    });

    // 2. Update client status
    const clientKey = `sns:coaching:client:${email.toLowerCase()}`;
    let existing = await kv.get<CoachingClient>(clientKey);
    if (existing) {
      await kv.set(clientKey, { ...existing, status: "onboarding_complete" });
    }

    // 3. Append to Google Sheets (non-blocking)
    const sheetId = process.env.GOOGLE_SHEETS_ONBOARDING_ID;
    if (sheetId) {
      const san = sanitizeForSheets;
      appendToSheet(sheetId, [
        submittedAt, san(name), san(email), san(motivation), san(whySNS),
        san(goal30Days), san(goal3Months), san(goal6Months), san(goal1Year),
        san(biggestChallenge), san(successIn90Days), san(additionalNotes ?? ""),
      ], "Onboarding Forms!A:L").catch(e => console.error("Sheets error:", e));
    }

    const formData = {
      motivation, whySNS, goal30Days, goal3Months,
      goal6Months, goal1Year, biggestChallenge, successIn90Days,
      additionalNotes: additionalNotes ?? "",
    };

    // Build base64 file of form content for Make.com Drive upload
    const formText = [
      `ONBOARDING FORM — ${name}`,
      `Email: ${email}`,
      ``,
      `What motivated you to get started?`,
      formData.motivation,
      ``,
      `Why Stack N Scale Enterprises?`,
      formData.whySNS,
      ``,
      `30-Day Goal`,
      formData.goal30Days,
      ``,
      `3-Month Goal`,
      formData.goal3Months,
      ``,
      `6-Month Goal`,
      formData.goal6Months,
      ``,
      `1-Year Goal`,
      formData.goal1Year,
      ``,
      `Biggest Challenge`,
      formData.biggestChallenge,
      ``,
      `Success in 90 Days`,
      formData.successIn90Days,
      formData.additionalNotes ? `\nAdditional Notes\n${formData.additionalNotes}` : "",
    ].join("\n");
    const formFile = Buffer.from(formText, "utf8").toString("base64");

    // 4. Send form received confirmation email + Drive doc trigger (non-blocking)
    // If Drive folder exists, fire immediately; otherwise create it first then fire
    if (existing?.driveFolder) {
      const emailPayload = {
        onboardingFolderId: existing.driveFolder.onboardingFolderId,
        notesFolderId: existing.driveFolder.notesFolderId,
        formData,
      };
      if (existing.driveFolder.onboardingFolderId) {
        uploadTextToDrive(existing.driveFolder.onboardingFolderId, "Onboarding Form.txt", formText)
          .catch(e => console.error("Drive upload error:", e));
      }
      triggerEmail("form_received", email, name, emailPayload)
        .catch(e => console.error("Form received email error:", e));
      triggerDriveDocs("form_received", email, name, { ...emailPayload, formFile })
        .catch(e => console.error("Drive docs error:", e));
    } else if (process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID) {
      setupClientFolder(existing?.name || name).then(async (folders) => {
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
        const emailPayload = {
          onboardingFolderId: folders.onboardingFolderId,
          notesFolderId: folders.notesFolderId,
          formData,
        };
        uploadTextToDrive(folders.onboardingFolderId, "Onboarding Form.txt", formText)
          .catch(e => console.error("Drive upload error:", e));
        triggerEmail("form_received", email, name, emailPayload)
          .catch(e => console.error("Form received email error:", e));
        triggerDriveDocs("form_received", email, name, { ...emailPayload, formFile })
          .catch(e => console.error("Drive docs error:", e));
      }).catch(e => {
        console.error("Drive folder setup error (form):", e);
        triggerEmail("form_received", email, name, { formData })
          .catch(err => console.error("Form received email error:", err));
      });
    } else {
      triggerEmail("form_received", email, name, { formData })
        .catch(e => console.error("Form received email error:", e));
    }

    // 5. Discord — create private channel, welcome in #general, store channel for OAuth
    let discordOAuthUrl: string | null = null;
    if (BOT_TOKEN && GUILD_ID && CAELUM_ID) {
      try {
        const channelSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const channelName = `client-${channelSlug}`;
        const botUser = await discordRequest("/users/@me", "GET") as { id: string };

        // Create private 1-on-1 channel (admins + bot only; customer added after OAuth)
        const overwrites = [
          { id: GUILD_ID,    type: 0, deny: "1024" },      // deny everyone
          { id: CAELUM_ID,  type: 1, allow: "3072" },     // Caelum: VIEW + SEND
          { id: botUser.id, type: 1, allow: "3072" },     // bot: VIEW + SEND
          ...(ADMIN2_ID ? [{ id: ADMIN2_ID, type: 1, allow: "3072" }] : []),
        ];
        const channel = await discordRequest(`/guilds/${GUILD_ID}/channels`, "POST", {
          name: channelName,
          type: 0,
          topic: `Private channel for ${name}`,
          permission_overwrites: overwrites,
        }) as { id: string };

        // Post intake summary in private channel
        await discordRequest(`/channels/${channel.id}/messages`, "POST", {
          content: [
            `📋 **New Client Intake — ${name}**`,
            `📧 ${email}`,
            ``,
            `**What motivated you to get started?**`, motivation,
            ``,
            `**Why Stack N Scale Enterprises?**`, whySNS,
            ``,
            `**30-Day Goal**`, goal30Days,
            ``,
            `**3-Month Goal**`, goal3Months,
            ``,
            `**6-Month Goal**`, goal6Months,
            ``,
            `**1-Year Goal**`, goal1Year,
            ``,
            `**Biggest Challenge**`, biggestChallenge,
            ``,
            `**Success in 90 Days**`, successIn90Days,
            additionalNotes ? `\n**Additional Notes**\n${additionalNotes}` : "",
          ].join("\n"),
        });

        // Welcome in #general student chat
        if (GENERAL_CH) {
          discordRequest(`/channels/${GENERAL_CH}/messages`, "POST", {
            content: `👋 Welcome **${name}** to Stack N Scale Enterprises! We're glad to have you. Check your email to connect your private channel.`,
          }).catch(() => {});
        }

        // Build OAuth URL — use a random state token (not the email) to prevent email exposure
        if (CLIENT_ID) {
          const stateToken = crypto.randomUUID();
          await kv.set(`sns:oauth:state:${stateToken}`, email.toLowerCase(), { ex: 86400 }); // 24h TTL
          const params = new URLSearchParams({
            client_id: CLIENT_ID,
            redirect_uri: `${APP_URL}/api/discord/connect`,
            response_type: "code",
            scope: "identify guilds.join",
            state: stateToken,
          });
          discordOAuthUrl = `https://discord.com/oauth2/authorize?${params}`;
        }

        // Store channel ID + OAuth URL so id-submit can send the link after both forms complete
        await kv.set(`sns:onboarding:discord:${email.toLowerCase()}`, {
          channelId: channel.id,
          channelName,
          discordOAuthUrl,
        });

        // If ID was already submitted before the form, send Discord link now
        const idRecord = await kv.get(`sns:onboarding:id-submit:${email.toLowerCase()}`);
        if (idRecord && discordOAuthUrl) {
          const freshClient = await kv.get<CoachingClient>(clientKey);
          triggerEmail("discord_link", email, name, { discordOAuthUrl, driveFolderUrl: freshClient?.driveFolder?.url })
            .catch(e => console.error("Discord link email error (form-side):", e));
        }
      } catch (discordErr) {
        console.error("Discord error:", discordErr);
      }
    }

    return Response.json({ ok: true, discordOAuthUrl });
  } catch (err) {
    console.error("Onboarding form error:", err);
    return Response.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

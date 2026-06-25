import { after } from "next/server";
import { kv } from "@vercel/kv";
import type { CoachingClient } from "@/lib/coaching-types";
import { appendToSheet, getOrCreateDriveFolder, uploadTextToDrive } from "@/lib/drive";
import { triggerEmail, triggerDriveDocs } from "@/lib/email";
import { sendErrorAlert } from "@/lib/alert";
import { triggerScenario } from "@/lib/make";

export const runtime = "nodejs";
export const maxDuration = 10; // Vercel Hobby plan hard cap

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://stack-n-scale-site.vercel.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const DISCORD_API  = "https://discord.com/api/v10";
const BOT_TOKEN    = process.env.DISCORD_BOT_TOKEN ?? "";
const GUILD_ID     = process.env.DISCORD_GUILD_ID ?? "";
const CAELUM_ID    = process.env.DISCORD_CAELUM_USER_ID ?? "";
const EVAN_ID      = process.env.EVAN_DISCORD_USER_ID ?? "";
const ADMIN2_ID    = process.env.DISCORD_ADMIN2_USER_ID ?? "";
const GENERAL_CH   = process.env.DISCORD_GENERAL_CHANNEL_ID ?? "";
const BOILER_ROOM_CH = process.env.DISCORD_BOILER_ROOM_CHANNEL_ID ?? "";
const CLIENT_ID    = process.env.DISCORD_CLIENT_ID ?? "";
const APP_URL      = (process.env.NEXTAUTH_URL ?? "https://stack-n-scale.vercel.app").replace(/\/$/, "");

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
  // Strip all leading formula characters and control chars to prevent Sheets injection
  return val.replace(/^[=+\-@\t\r]+/, "'").replace(/[\x00-\x1f]/g, " ");
}

function sanitizeDiscord(val: string): string {
  return val
    .replace(/@(?:everyone|here)/g, "@​$&") // zero-width space breaks pings
    .replace(/```/g, "\\`\\`\\`")
    .slice(0, 400);
}

function validateTextField(val: unknown, fieldName: string): string | null {
  if (typeof val !== "string" || !val.trim()) return `${fieldName} is required`;
  if (val.length > MAX_TEXT_LEN) return `${fieldName} exceeds maximum length`;
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Rate limit: 1 submission per email per hour
    const rawEmail = (typeof body?.email === "string" ? body.email : "").toLowerCase().trim();
    if (rawEmail) {
      const rateLimitKey = `sns:onboarding:ratelimit:${rawEmail}`;
      const last = await kv.get<number>(rateLimitKey);
      if (last && Date.now() - last < 3_600_000) {
        return Response.json({ ok: false, error: "Too many requests — please wait before resubmitting." }, { status: 429, headers: CORS_HEADERS });
      }
      await kv.set(rateLimitKey, Date.now(), { ex: 3600 });
    }

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
      if (err) return Response.json({ ok: false, error: err }, { status: 400, headers: CORS_HEADERS });
    }
    if (additionalNotes && (typeof additionalNotes !== "string" || additionalNotes.length > MAX_TEXT_LEN)) {
      return Response.json({ ok: false, error: "Additional notes exceeds maximum length" }, { status: 400, headers: CORS_HEADERS });
    }

    if (!EMAIL_REGEX.test(email)) {
      return Response.json({ ok: false, error: "Invalid email address" }, { status: 400, headers: CORS_HEADERS });
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
    const existing = await kv.get<CoachingClient>(clientKey);
    if (existing) {
      await kv.set(clientKey, { ...existing, status: "onboarding_complete" });
    }

    const formData = {
      motivation, whySNS, goal30Days, goal3Months,
      goal6Months, goal1Year, biggestChallenge, successIn90Days,
      additionalNotes: additionalNotes ?? "",
    };

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

    // Snapshot values needed in after() — capture before returning
    const capturedEmail = email.toLowerCase();
    const capturedName = name;
    const capturedExisting = existing;
    const capturedGhlContactId = existing?.ghlContactId ?? null;
    const capturedSheetId = process.env.GOOGLE_SHEETS_ONBOARDING_ID;

    // Return success immediately — all slow external calls go in after()
    after(async () => {
      // Make.com Onboarding Form scenario
      triggerScenario("MAKE_ONBOARDING_FORM_WEBHOOK_URL", {
        name: capturedName,
        email: capturedEmail,
        ghlContactId: capturedGhlContactId,
        submittedAt,
        motivation,
        whySNS,
        goal30Days,
        goal3Months,
        goal6Months,
        goal1Year,
        biggestChallenge,
        successIn90Days,
        additionalNotes: additionalNotes ?? "",
      }).catch(() => {});

      // Append to Google Sheets
      if (capturedSheetId) {
        const san = sanitizeForSheets;
        appendToSheet(capturedSheetId, [
          submittedAt, san(capturedName), san(capturedEmail), san(motivation), san(whySNS),
          san(goal30Days), san(goal3Months), san(goal6Months), san(goal1Year),
          san(biggestChallenge), san(successIn90Days), san(additionalNotes ?? ""),
        ], "Onboarding Forms!A:L").catch(e => console.error("Sheets error:", e));
      }

      // Drive folder creation + doc upload
      let onboardingFolderId: string | undefined;
      let notesFolderId: string | undefined;

      try {
        const folder = await getOrCreateDriveFolder(clientKey, capturedExisting?.name || capturedName);
        onboardingFolderId = folder.onboardingFolderId;
        notesFolderId      = folder.notesFolderId;
        await uploadTextToDrive(folder.onboardingFolderId, "Onboarding Form.txt", formText);

        triggerDriveDocs("form_received", capturedEmail, capturedName, { onboardingFolderId, notesFolderId, formData, formFile })
          .catch(e => console.error("Drive docs error:", e));
      } catch (driveError) {
        await kv.set(`sns:drive:failed:${capturedEmail}`, {
          error: driveError instanceof Error ? driveError.message : String(driveError),
          failedAt: new Date().toISOString(),
        });
        sendErrorAlert("Drive folder/upload failed — onboarding form", driveError, { email: capturedEmail, name: capturedName }).catch(() => {});
      }

      // Always send confirmation email
      triggerEmail("form_received", capturedEmail, capturedName, { onboardingFolderId, notesFolderId, formData })
        .catch(e => console.error("Form received email error:", e));

      // Discord — create private channel
      if (!BOT_TOKEN || !GUILD_ID || !CAELUM_ID) return;
      try {
        const channelSlug = capturedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const channelName = `client-${channelSlug}`;
        const botUser = await discordRequest("/users/@me", "GET") as { id: string };

        const overwrites = [
          { id: GUILD_ID,    type: 0, deny: "1024" },
          { id: CAELUM_ID,  type: 1, allow: "3072" },
          { id: botUser.id, type: 1, allow: "3072" },
          ...(ADMIN2_ID ? [{ id: ADMIN2_ID, type: 1, allow: "3072" }] : []),
          ...(EVAN_ID   ? [{ id: EVAN_ID,   type: 1, allow: "3072" }] : []),
        ];
        const channel = await discordRequest(`/guilds/${GUILD_ID}/channels`, "POST", {
          name: channelName,
          type: 0,
          topic: `Private channel for ${capturedName}`,
          permission_overwrites: overwrites,
        }) as { id: string };

        const sd = sanitizeDiscord;
        discordRequest(`/channels/${channel.id}/messages`, "POST", {
          content: [
            `📋 **New Client Intake — ${sd(capturedName)}**`,
            `📧 ${sd(capturedEmail)}`,
            ``,
            `**What motivated you to get started?**`, sd(motivation),
            ``,
            `**Why Stack N Scale Enterprises?**`, sd(whySNS),
            ``,
            `**30-Day Goal**`, sd(goal30Days),
            ``,
            `**3-Month Goal**`, sd(goal3Months),
            ``,
            `**6-Month Goal**`, sd(goal6Months),
            ``,
            `**1-Year Goal**`, sd(goal1Year),
            ``,
            `**Biggest Challenge**`, sd(biggestChallenge),
            ``,
            `**Success in 90 Days**`, sd(successIn90Days),
            additionalNotes ? `\n**Additional Notes**\n${sd(additionalNotes)}` : "",
          ].join("\n"),
        }).catch(() => {});

        if (GENERAL_CH) {
          discordRequest(`/channels/${GENERAL_CH}/messages`, "POST", {
            content: `👋 Welcome **${sanitizeDiscord(capturedName)}** to Stack N Scale Enterprises! We're glad to have you. Check your email to connect your private channel.`,
          }).catch(() => {});
        }

        let discordOAuthUrl: string | null = null;
        if (CLIENT_ID) {
          const stateToken = crypto.randomUUID();
          await kv.set(`sns:oauth:state:${stateToken}`, capturedEmail, { ex: 60 * 60 * 24 * 7 });
          const params = new URLSearchParams({
            client_id: CLIENT_ID,
            redirect_uri: `${APP_URL}/api/discord/connect`,
            response_type: "code",
            scope: "identify guilds.join",
            state: stateToken,
          });
          discordOAuthUrl = `https://discord.com/oauth2/authorize?${params}`;
        }

        await kv.set(`sns:onboarding:discord:${capturedEmail}`, {
          channelId: channel.id,
          channelName,
          discordOAuthUrl,
        });

        // If ID was already submitted before the form, send Discord link
        const idRecord = await kv.get(`sns:onboarding:id-submit:${capturedEmail}`);
        if (idRecord) {
          if (discordOAuthUrl) {
            const freshClient = await kv.get<CoachingClient>(clientKey);
            triggerEmail("discord_link", capturedEmail, capturedName, { discordOAuthUrl, driveFolderUrl: freshClient?.driveFolder?.url })
              .catch(e => console.error("Discord link email error (form-side):", e));
            // Auto-send the "Join the Discord" email via Make (both forms now complete)
            triggerScenario("MAKE_DISCORD_JOIN_WEBHOOK_URL", { email: capturedEmail, name: capturedName, discordUrl: discordOAuthUrl })
              .catch(() => {});
          }
          if (BOILER_ROOM_CH) {
            discordRequest(`/channels/${BOILER_ROOM_CH}/messages`, "POST", {
              content: `**${sanitizeDiscord(capturedName)}'s** forms are in and ready for next steps. ✅`,
            }).catch(e => console.error("Boiler Room notification error:", e));
          }
        }
      } catch (discordErr) {
        console.error("Discord error:", discordErr);
      }
    });

    return Response.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("Onboarding form error:", err);
    return Response.json({ ok: false, error: "Server error" }, { status: 500, headers: CORS_HEADERS });
  }
}

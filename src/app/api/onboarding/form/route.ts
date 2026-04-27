import { kv } from "@vercel/kv";
import { type CoachingClient } from "@/app/api/onboarding/clients/route";
import { uploadTextToDrive, appendToSheet } from "@/lib/drive";
import { triggerEmail } from "@/lib/email";

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
  });
  if (!res.ok) throw new Error(`Discord ${method} ${path} failed: ${await res.text()}`);
  return res.json();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name, email, motivation, whySNS,
      goal30Days, goal3Months, goal6Months, goal1Year,
      biggestChallenge, successIn90Days, additionalNotes,
    } = body;

    if (!name || !email || !motivation || !whySNS || !goal30Days || !goal3Months || !goal6Months || !goal1Year || !biggestChallenge || !successIn90Days) {
      return Response.json({ ok: false, error: "Missing required fields" }, { status: 400 });
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

    // 3. Append to Google Sheets (non-blocking)
    const sheetId = process.env.GOOGLE_SHEETS_ONBOARDING_ID;
    if (sheetId) {
      appendToSheet(sheetId, [
        submittedAt, name, email, motivation, whySNS,
        goal30Days, goal3Months, goal6Months, goal1Year,
        biggestChallenge, successIn90Days, additionalNotes ?? "",
      ], "Onboarding Forms!A:L").catch(e => console.error("Sheets error:", e));
    }

    // 4. Upload form response to the Onboarding subfolder (non-blocking)
    const onboardingFolderId = existing?.driveFolder?.onboardingFolderId ?? existing?.driveFolder?.id;
    if (onboardingFolderId) {
      const summary = [
        `Onboarding Form — ${name}`,
        `Email: ${email}`,
        `Submitted: ${submittedAt}`,
        ``,
        `What motivated you to get started?`, motivation,
        ``,
        `Why Stack N Scale Enterprises?`, whySNS,
        ``,
        `30-Day Goal`, goal30Days,
        ``,
        `3-Month Goal`, goal3Months,
        ``,
        `6-Month Goal`, goal6Months,
        ``,
        `1-Year Goal`, goal1Year,
        ``,
        `Biggest Challenge`, biggestChallenge,
        ``,
        `Success in 90 Days`, successIn90Days,
        additionalNotes ? `\nAdditional Notes\n${additionalNotes}` : "",
      ].join("\n");
      uploadTextToDrive(onboardingFolderId, `${name} — Onboarding Form`, summary)
        .catch(e => console.error("Drive upload error (form):", e));
    }

    // 4. Send form received confirmation email (non-blocking)
    triggerEmail("form_received", email, name)
      .catch(e => console.error("Form received email error:", e));

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

        // Build OAuth URL — customer clicks this to connect Discord and get added to their channel
        if (CLIENT_ID) {
          const params = new URLSearchParams({
            client_id: CLIENT_ID,
            redirect_uri: `${APP_URL}/api/discord/connect`,
            response_type: "code",
            scope: "identify guilds.join",
            state: encodeURIComponent(email.toLowerCase()),
          });
          discordOAuthUrl = `https://discord.com/oauth2/authorize?${params}`;
        }

        // Store channel ID + OAuth URL so id-submit can send the link after both forms complete
        await kv.set(`sns:onboarding:discord:${email.toLowerCase()}`, {
          channelId: channel.id,
          channelName,
          discordOAuthUrl,
        });
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

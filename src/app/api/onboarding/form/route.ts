import { kv } from "@vercel/kv";
import { type CoachingClient } from "@/app/api/onboarding/clients/route";

const DISCORD_API = "https://discord.com/api/v10";
const BOT_TOKEN   = process.env.DISCORD_BOT_TOKEN ?? "";
const GUILD_ID    = process.env.DISCORD_GUILD_ID ?? "";
const CAELUM_ID   = process.env.DISCORD_CAELUM_USER_ID ?? "";

async function discordRequest(path: string, method: string, body: unknown) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Discord ${method} ${path} failed: ${err}`);
  }
  return res.json();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, motivation, whySNS, goals, biggestChallenge, successIn90Days, additionalNotes } = body;

    if (!name || !email || !motivation || !whySNS || !goals || !biggestChallenge || !successIn90Days) {
      return Response.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const submittedAt = new Date().toISOString();
    const formData = { name, email, motivation, whySNS, goals, biggestChallenge, successIn90Days, additionalNotes: additionalNotes ?? "", submittedAt };

    // 1. Save form response to KV
    await kv.set(`sns:onboarding:form:${email.toLowerCase()}`, formData);

    // 2. Update coaching client status if they exist in the pipeline
    const clientKey = `sns:coaching:client:${email.toLowerCase()}`;
    const existing = await kv.get<CoachingClient>(clientKey);
    if (existing) {
      await kv.set(clientKey, { ...existing, status: "onboarding_complete" });
    }

    // 3. Discord — create private channel + post intake + generate invite
    let inviteUrl: string | null = null;
    if (BOT_TOKEN && GUILD_ID && CAELUM_ID) {
      try {
        const firstName = name.split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "");

        // Fetch bot's own user ID
        const botUser = await discordRequest("/users/@me", "GET", undefined) as { id: string };

        // Create private channel
        const channel = await discordRequest(`/guilds/${GUILD_ID}/channels`, "POST", {
          name: `client-${firstName}`,
          type: 0,
          topic: `Private channel for ${name}`,
          permission_overwrites: [
            { id: GUILD_ID,    type: 0, deny: "1024" },
            { id: CAELUM_ID,  type: 1, allow: "1024" },
            { id: botUser.id, type: 1, allow: "2048" },
          ],
        }) as { id: string };

        // Post intake summary
        const msg = [
          `📋 **New Client Intake — ${name}**`,
          `📧 ${email}`,
          ``,
          `**What motivated you to get started?**`,
          motivation,
          ``,
          `**Why Stack N Scale Enterprises?**`,
          whySNS,
          ``,
          `**Primary Goals**`,
          goals,
          ``,
          `**Biggest Challenge**`,
          biggestChallenge,
          ``,
          `**Success in 90 Days**`,
          successIn90Days,
          additionalNotes ? `\n**Additional Notes**\n${additionalNotes}` : "",
        ].join("\n");

        await discordRequest(`/channels/${channel.id}/messages`, "POST", { content: msg });

        // Generate single-use invite (7 days)
        const invite = await discordRequest(`/channels/${channel.id}/invites`, "POST", {
          max_uses: 1,
          max_age: 604800,
          unique: true,
        }) as { code: string };

        inviteUrl = `https://discord.gg/${invite.code}`;
      } catch (discordErr) {
        console.error("Discord error:", discordErr);
        // Don't fail the whole request if Discord fails
      }
    }

    return Response.json({ ok: true, inviteUrl });
  } catch (err) {
    console.error("Onboarding form error:", err);
    return Response.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

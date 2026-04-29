import { kv } from "@vercel/kv";

const DISCORD_API   = "https://discord.com/api/v10";
const CLIENT_ID     = process.env.DISCORD_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET ?? "";
const GUILD_ID      = process.env.DISCORD_GUILD_ID ?? "";
const BOT_TOKEN     = process.env.DISCORD_BOT_TOKEN ?? "";
const APP_URL       = process.env.NEXTAUTH_URL ?? "https://stack-n-scale.vercel.app";

export async function GET(req: Request) {
  const url   = new URL(req.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) return new Response("Missing code or state", { status: 400 });

  const email = await kv.get<string>(`sns:oauth:state:${state}`);
  if (!email) return new Response("Invalid or expired link", { status: 400 });
  await kv.del(`sns:oauth:state:${state}`);

  // Exchange code for access token
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${APP_URL}/api/discord/connect`,
    }),
  });

  if (!tokenRes.ok) {
    console.error("Discord token exchange failed:", await tokenRes.text());
    return Response.redirect("https://discord.com");
  }

  const { access_token } = await tokenRes.json() as { access_token: string };

  // Get user's Discord ID
  const userRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const user = await userRes.json() as { id: string; username: string };

  // Add user to the guild
  await fetch(`${DISCORD_API}/guilds/${GUILD_ID}/members/${user.id}`, {
    method: "PUT",
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ access_token }),
  });

  // Look up their private channel and add them to it
  const discordData = await kv.get<{ channelId: string }>(`sns:onboarding:discord:${email}`);
  if (discordData?.channelId) {
    const channelId = discordData.channelId;

    // Grant the user VIEW_CHANNEL + SEND_MESSAGES on their private channel
    await fetch(`${DISCORD_API}/channels/${channelId}/permissions/${user.id}`, {
      method: "PUT",
      headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ allow: "3072", deny: "0", type: 1 }),
    });

    // Grant VIEW_CHANNEL + SEND_MESSAGES in the general/student chat channel
    const generalChannelId = process.env.DISCORD_GENERAL_CHANNEL_ID;
    if (generalChannelId) {
      await fetch(`${DISCORD_API}/channels/${generalChannelId}/permissions/${user.id}`, {
        method: "PUT",
        headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ allow: "3072", deny: "0", type: 1 }),
      }).catch(() => {});
    }

    // Welcome them in their private channel
    await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `👋 <@${user.id}> You're in! This is your private channel — direct line to the Stack N Scale team. Welcome.`,
      }),
    });

    // Redirect straight to their private channel
    return Response.redirect(`https://discord.com/channels/${GUILD_ID}/${channelId}`);
  }

  // Fallback: just send them to the server
  return Response.redirect(`https://discord.com/channels/${GUILD_ID}`);
}

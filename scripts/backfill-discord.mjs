/**
 * Backfill Discord private channels + OAuth URLs for clients who
 * submitted forms before the bot was in the server.
 *
 * Run once: node scripts/backfill-discord.mjs
 */

import { readFileSync } from "fs";

const envRaw = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = Object.fromEntries(
  envRaw.split("\n").filter(l => l && !l.startsWith("#") && l.includes("=")).map(l => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);

const BOT_TOKEN  = env.DISCORD_BOT_TOKEN;
const GUILD_ID   = env.DISCORD_GUILD_ID;
const CAELUM_ID  = env.DISCORD_CAELUM_USER_ID;
const ADMIN2_ID  = env.DISCORD_ADMIN2_USER_ID;
const CLIENT_ID  = env.DISCORD_CLIENT_ID;
const APP_URL    = "https://stack-n-scale.vercel.app";
const KV_URL     = env.KV_REST_API_URL;
const KV_TOKEN   = env.KV_REST_API_TOKEN;
const EMAIL_HOOK = env.MAKE_EMAIL_WEBHOOK_URL;

async function api(path, method = "GET", body) {
  const r = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 204) return { ok: true };
  return r.json();
}

async function kvSet(key, value, ex) {
  const body = ex ? [value, "EX", ex] : [value];
  const r = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body.length === 1 ? value : body),
  });
  return r.json();
}

async function kvGet(key) {
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const d = await r.json();
  try { return JSON.parse(d.result); } catch { return d.result; }
}

async function sendEmail(type, to, name, extras = {}) {
  await fetch(EMAIL_HOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, to, name, ...extras }),
    signal: AbortSignal.timeout(5000),
  });
}

// Clients who already submitted both forms
const clients = [
  { name: "Evan Bautista", email: "evanbautista23@gmail.com" },
  { name: "Caelum Harris",  email: "caelum123567@outlook.com" },
];

const botUser = await api("/users/@me");
console.log(`Bot: ${botUser.username}\n`);

for (const { name, email } of clients) {
  console.log(`── Processing ${name} (${email})`);

  // Skip if discord record already exists
  const existing = await kvGet(`sns:onboarding:discord:${email}`);
  if (existing?.channelId) {
    console.log(`  ⏭  Discord record already exists (channel ${existing.channelId}), skipping\n`);
    continue;
  }

  // Create private channel
  const channelSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const channelName = `client-${channelSlug}`;

  const overwrites = [
    { id: GUILD_ID,     type: 0, deny: "1024" },
    { id: CAELUM_ID,   type: 1, allow: "3072" },
    { id: botUser.id,  type: 1, allow: "3072" },
    ...(ADMIN2_ID ? [{ id: ADMIN2_ID, type: 1, allow: "3072" }] : []),
  ];

  const channel = await api(`/guilds/${GUILD_ID}/channels`, "POST", {
    name: channelName,
    type: 0,
    topic: `Private channel for ${name}`,
    permission_overwrites: overwrites,
  });

  if (!channel.id) {
    console.error(`  ❌ Channel creation failed:`, channel);
    continue;
  }
  console.log(`  ✅ Created #${channelName} (${channel.id})`);

  // Post intake summary
  const formData = await kvGet(`sns:onboarding:form:${email}`);
  if (formData) {
    await api(`/channels/${channel.id}/messages`, "POST", {
      content: [
        `📋 **Client Intake (backfilled) — ${name}**`,
        `📧 ${email}`,
        ``,
        `**Motivation:** ${formData.motivation}`,
        `**Why SNS:** ${formData.whySNS}`,
        `**30-Day Goal:** ${formData.goal30Days}`,
        `**3-Month Goal:** ${formData.goal3Months}`,
        `**1-Year Goal:** ${formData.goal1Year}`,
        `**Biggest Challenge:** ${formData.biggestChallenge}`,
      ].join("\n"),
    });
    console.log(`  ✅ Posted intake summary`);
  }

  // Generate OAuth URL
  const stateToken = crypto.randomUUID();
  await kvSet(`sns:oauth:state:${stateToken}`, email, 86400);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${APP_URL}/api/discord/connect`,
    response_type: "code",
    scope: "identify guilds.join",
    state: stateToken,
  });
  const discordOAuthUrl = `https://discord.com/oauth2/authorize?${params}`;

  // Store discord record in KV
  await kvSet(`sns:onboarding:discord:${email}`, {
    channelId: channel.id,
    channelName,
    discordOAuthUrl,
  });
  console.log(`  ✅ Stored discord record in KV`);

  // Send discord_link email
  await sendEmail("discord_link", email, name, { discordOAuthUrl });
  console.log(`  ✅ Fired discord_link email to ${email}`);
  console.log(`  🔗 OAuth URL: ${discordOAuthUrl}\n`);
}

console.log("✅ Backfill complete.");

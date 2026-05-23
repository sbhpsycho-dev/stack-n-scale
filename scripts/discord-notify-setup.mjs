/**
 * One-time Discord notification channel setup.
 * Creates #new-leads, #appointments-booked, #sales, #rep-updates channels
 * and an "SNS Notifications" webhook in each — then prints the webhook URLs
 * in .env format ready to paste.
 *
 * Run: node scripts/discord-notify-setup.mjs
 * Safe to re-run — idempotent (skips existing channels + webhooks).
 */

import { readFileSync } from "fs";

const envRaw = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = Object.fromEntries(
  envRaw.split("\n").filter(l => l && !l.startsWith("#") && l.includes("=")).map(l => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);

const BOT_TOKEN = env.DISCORD_BOT_TOKEN;
const GUILD_ID  = env.DISCORD_GUILD_ID;

if (!BOT_TOKEN || !GUILD_ID) {
  console.error("❌ DISCORD_BOT_TOKEN and DISCORD_GUILD_ID must be set in .env.local");
  process.exit(1);
}

const api = async (path, method = "GET", body) => {
  const r = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (r.status === 204) return { ok: true };
  const json = await r.json();
  if (!r.ok) throw new Error(`Discord API ${method} ${path} → ${r.status}: ${JSON.stringify(json)}`);
  return json;
};

// Channels to ensure exist, and their env var mapping
const NOTIFY_CHANNELS = [
  { name: "new-leads",          envKey: "DISCORD_WEBHOOK_NEW_LEADS" },
  { name: "appointments-booked",envKey: "DISCORD_WEBHOOK_APPOINTMENTS" },
  { name: "sales",              envKey: "DISCORD_WEBHOOK_SALES" },
  { name: "rep-updates",        envKey: "DISCORD_WEBHOOK_REP_UPDATES" },
];

const WEBHOOK_NAME = "SNS Notifications";

console.log("🔍 Fetching existing guild channels...");
const existing = await api(`/guilds/${GUILD_ID}/channels`);
const byName = Object.fromEntries(existing.map(ch => [ch.name, ch]));
console.log(`   Found ${existing.length} channels in guild\n`);

const results = {};

for (const { name, envKey } of NOTIFY_CHANNELS) {
  let channel = byName[name];

  // ── Create channel if missing ─────────────────────────────────────────────
  if (!channel) {
    console.log(`➕ Creating #${name}...`);
    channel = await api(`/guilds/${GUILD_ID}/channels`, "POST", {
      name,
      type: 0, // GUILD_TEXT
    });
    console.log(`   ✅ Created #${name} (id: ${channel.id})`);
  } else {
    console.log(`   ✅ #${name} already exists (id: ${channel.id})`);
  }

  // ── Check for existing SNS webhook ────────────────────────────────────────
  const webhooks = await api(`/channels/${channel.id}/webhooks`);
  const existing_hook = webhooks.find?.(w => w.name === WEBHOOK_NAME);

  if (existing_hook) {
    console.log(`   ↩  Webhook already exists — reusing`);
    results[envKey] = `https://discord.com/api/webhooks/${existing_hook.id}/${existing_hook.token}`;
  } else {
    console.log(`   🔗 Creating webhook "${WEBHOOK_NAME}"...`);
    const hook = await api(`/channels/${channel.id}/webhooks`, "POST", {
      name: WEBHOOK_NAME,
    });
    results[envKey] = `https://discord.com/api/webhooks/${hook.id}/${hook.token}`;
    console.log(`   ✅ Webhook created`);
  }

  console.log();
}

// ── Print env vars ────────────────────────────────────────────────────────────
console.log("─".repeat(60));
console.log("✅ Done! Paste these into .env.local and Vercel env vars:\n");
for (const [key, url] of Object.entries(results)) {
  console.log(`${key}=${url}`);
}
console.log("─".repeat(60));

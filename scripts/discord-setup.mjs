/**
 * One-time Discord server setup:
 * 1. Rename #general → #studentchat
 * 2. Lock all other channels from @everyone (clients can only see #studentchat + their private channel)
 *
 * Run: node scripts/discord-setup.mjs
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
const GENERAL_ID = env.DISCORD_GENERAL_CHANNEL_ID;

const api = async (path, method = "GET", body) => {
  const r = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (r.status === 204) return { ok: true };
  return r.json();
};

// ── 1. Rename #general → #studentchat ────────────────────────────────────────
console.log("Renaming #general → #studentchat...");
const renamed = await api(`/channels/${GENERAL_ID}`, "PATCH", { name: "studentchat" });
if (renamed.name === "studentchat") {
  console.log("✅ Renamed to #studentchat");
} else {
  console.error("❌ Rename failed:", renamed);
}

// ── 2. Fetch all guild channels ───────────────────────────────────────────────
console.log("\nFetching all guild channels...");
const channels = await api(`/guilds/${GUILD_ID}/channels`);
console.log(`Found ${channels.length} channels`);

// ── 3. Lock non-student channels from @everyone ───────────────────────────────
console.log("\nLocking channels from @everyone...\n");

for (const ch of channels) {
  // Skip #studentchat — stays visible to everyone
  if (ch.id === GENERAL_ID) {
    console.log(`⏭  #${ch.name} — skipped (public student chat)`);
    continue;
  }

  // Skip category channels (type 4) — permissions cascade separately
  if (ch.type === 4) {
    console.log(`⏭  [${ch.name}] — skipped (category)`);
    continue;
  }

  // Skip client private channels — already locked by onboarding
  if (ch.name?.startsWith("client-")) {
    console.log(`⏭  #${ch.name} — skipped (already locked)`);
    continue;
  }

  // Deny @everyone VIEW_CHANNEL on everything else
  const res = await api(`/channels/${ch.id}/permissions/${GUILD_ID}`, "PUT", {
    id: GUILD_ID,
    type: 0,        // role overwrite
    allow: "0",
    deny: "1024",   // VIEW_CHANNEL
  });

  if (res.ok || !res.code) {
    console.log(`🔒 #${ch.name} — locked from @everyone`);
  } else {
    console.error(`❌ #${ch.name} — failed:`, res.message);
  }
}

console.log("\n✅ Done. Clients can now only see #studentchat + their own private channel.");

/**
 * One-time GHL webhook subscription registration via Private Integration API.
 * Registers your Next.js endpoint to receive all lead/appointment/deal events.
 *
 * Run: node scripts/ghl-webhook-register.mjs
 * Safe to re-run — lists existing webhooks first and skips if already registered.
 *
 * Requires in .env.local:
 *   GHL_API_KEY       — from your Private Integration
 *   GHL_LOCATION_ID   — your GHL location/sub-account ID
 *   GHL_WEBHOOK_SECRET — secret appended as ?secret= to the webhook URL
 */

import { readFileSync } from "fs";

const envRaw = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = Object.fromEntries(
  envRaw.split("\n").filter(l => l && !l.startsWith("#") && l.includes("=")).map(l => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);

const API_KEY     = env.GHL_API_KEY;
const LOCATION_ID = env.GHL_LOCATION_ID;
const WH_SECRET   = env.GHL_WEBHOOK_SECRET;
const BASE_URL    = env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://stack-n-scale.vercel.app";

if (!API_KEY || !LOCATION_ID || !WH_SECRET) {
  console.error("❌ GHL_API_KEY, GHL_LOCATION_ID, and GHL_WEBHOOK_SECRET must be set in .env.local");
  process.exit(1);
}

const WEBHOOK_URL  = `${BASE_URL}/api/webhooks/ghl?secret=${encodeURIComponent(WH_SECRET)}`;
const WEBHOOK_NAME = "SNS Discord Notifications";

// Events to subscribe to
const EVENTS = [
  "ContactCreate",
  "AppointmentCreate",
  "CalendarEventCreate",
  "InboundMessage",
  "ConversationUnreadUpdate",
  "OpportunityCreate",
  "OpportunityUpdate",
  "OpportunityStatusUpdate",
];

const api = async (path, method = "GET", body) => {
  const r = await fetch(`https://services.leadconnectorhq.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: json };
};

// ── List existing webhooks ────────────────────────────────────────────────────
console.log("🔍 Fetching existing GHL webhooks...");
const listRes = await api(`/webhooks/?locationId=${LOCATION_ID}`);

if (!listRes.ok) {
  console.error("❌ Failed to list webhooks:", listRes.data);
  console.error("\nTroubleshooting:");
  console.error("  • Make sure GHL_API_KEY is a valid Private Integration API key");
  console.error("  • Make sure the Private Integration has Webhooks + Contacts + Calendars + Conversations + Opportunities scopes");
  process.exit(1);
}

const existing = listRes.data?.webhooks ?? [];
console.log(`   Found ${existing.length} existing webhook(s)\n`);

// ── Check if already registered ───────────────────────────────────────────────
const alreadyRegistered = existing.find(w =>
  w.name === WEBHOOK_NAME || w.url?.includes("/api/webhooks/ghl")
);

if (alreadyRegistered) {
  console.log(`✅ Webhook already registered:`);
  console.log(`   Name: ${alreadyRegistered.name}`);
  console.log(`   URL:  ${alreadyRegistered.url}`);
  console.log(`   ID:   ${alreadyRegistered.id}`);
  console.log(`   Events: ${alreadyRegistered.events?.join(", ") || "unknown"}`);
  console.log("\n⚠️  To update events, delete and re-register:");
  console.log(`   DELETE https://services.leadconnectorhq.com/webhooks/${alreadyRegistered.id}`);
  process.exit(0);
}

// ── Register new webhook ──────────────────────────────────────────────────────
console.log(`➕ Registering webhook...`);
console.log(`   URL:    ${WEBHOOK_URL}`);
console.log(`   Events: ${EVENTS.join(", ")}\n`);

const createRes = await api("/webhooks", "POST", {
  locationId: LOCATION_ID,
  name:       WEBHOOK_NAME,
  url:        WEBHOOK_URL,
  events:     EVENTS,
});

if (!createRes.ok) {
  console.error("❌ Registration failed:", JSON.stringify(createRes.data, null, 2));
  console.error("\nTroubleshooting:");
  console.error("  • Confirm GHL_LOCATION_ID matches your sub-account (not agency) ID");
  console.error("  • Ensure Private Integration has all required event scopes enabled");
  process.exit(1);
}

const hook = createRes.data?.webhook ?? createRes.data;
console.log("✅ Webhook registered successfully!");
console.log(`   ID:     ${hook.id}`);
console.log(`   Name:   ${hook.name}`);
console.log(`   URL:    ${hook.url}`);
console.log(`   Events: ${hook.events?.join(", ")}`);
console.log("\n🎯 GHL will now push events to your Discord notification system.");
console.log("   Test by creating a contact in GHL — it should appear in #new-leads within seconds.");
